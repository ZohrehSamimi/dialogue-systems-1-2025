import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 8000, // Increased timeout
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  wholeDay?: boolean;
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  aya: { person: "Nayat Astaiza Soriano" },
  victoria: { person: "Victoria Daniilidou" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function getDay(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).day;
}

function getTime(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).time;
}

function getWholeDay(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).wholeDay;
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) => {
      console.log(`Speaking: "${params.utterance}"`);
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      });
    },
    "spst.listen": ({ context }) => {
      console.log("Starting to listen...");
      context.spstRef.send({
        type: "LISTEN",
      });
    },
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    appointment: {
      person: null,
      day: null,
      time: null,
      wholeDay: false,
      confirmation: false
    }
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: [
        ({ context }) => context.spstRef.send({ type: "PREPARE" }),
        () => console.log("Preparing speech services...")
      ],
      on: { 
        ASRTTS_READY: {
          target: "WaitToStart",
          actions: () => console.log("Speech services ready!") 
        }
      },
    },
    WaitToStart: {
      on: { CLICK: "Greeting" },
    },
    Greeting: {
      initial: "Prompt",
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello, let's make an appointment!` } },
          on: { SPEAK_COMPLETE: "AskName" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "AskName" },
        },
        AskName: {
          entry: { type: "spst.speak", params: { utterance: `Who are you meeting with?` } },
          on: { SPEAK_COMPLETE: "ListenForName" },
        },
        ListenForName: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
              target: "#DM.ProcessName.UpdateName",
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "AskName",
            },
          },
        },
        AskDay: {
          entry: { type: "spst.speak", params: { utterance: `What day are you meeting?` } },
          on: { SPEAK_COMPLETE: "ListenForDay" },
        },
        ListenForDay: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => { 
                return { lastResult: event.value };
              }),
              target: "#DM.ProcessDay.UpdateDay",
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "AskDay",
            },
          },  
        },
        AskWholeDay: {
          entry: { type: "spst.speak", params: { utterance: `Is it a whole day meeting?` } },
          on: { SPEAK_COMPLETE: "ListenForWholeDay" },
        },
        ListenForWholeDay: {  
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => { 
                return { lastResult: event.value };
              }),
              target: "#DM.ProcessWholeDay.UpdateWholeDay",
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "AskWholeDay",
            },
          },  
        },
        AskTime: {
          entry: { type: "spst.speak", params: { utterance: `What time are you meeting?` } },
          on: { SPEAK_COMPLETE: "ListenForTime" },
        },
        ListenForTime: {
          entry: [
            { type: "spst.listen" },
            () => console.log("=== LISTENING FOR TIME INPUT ===")
          ],
          on: {
            RECOGNISED: {
              actions: [
                assign(({ event }) => { 
                  console.log("=== TIME RECOGNIZED ===", event.value);
                  return { lastResult: event.value };
                }),
                () => console.log("Time input received, moving to ProcessTime")
              ],
              target: "#DM.ProcessTime.UpdateTime",
            },
            ASR_NOINPUT: {
              actions: [
                assign({ lastResult: null }),
                () => console.log("=== NO TIME INPUT DETECTED ===")
              ],
              target: "AskTime",
            },
          },
        },
      },
    },
    ProcessName: {
      initial: "UpdateName",
      states: {
        UpdateName: {
          entry: assign(({ context }) => {
            const utterance = context.lastResult?.[0].utterance || "";
            const person = getPerson(utterance);
            return { 
              appointment: { 
                ...context.appointment,
                person: person || null
              } 
            };
          }),
          always: "SpeakConfirmation"
        },
        SpeakConfirmation: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }: { context: DMContext }) => {
                const utterance = context.lastResult?.[0].utterance || "";
                const person = getPerson(utterance);
                if (person) {
                  return { utterance: `Great, you're meeting with ${person}.` };
                } else {
                  return { utterance: `Sorry, I don't recognize that name.` };
                }
              }
            },
            () => console.log("Starting name confirmation speech..."),
            // Add a timer to auto-complete after speaking
            () => {
              setTimeout(() => {
                console.log("Auto-triggering SPEAK_COMPLETE for name confirmation");
                dmActor.send({ type: "SPEAK_COMPLETE" });
              }, 3000);
            }
          ],
          on: { 
            SPEAK_COMPLETE: [
              {
                target: "#DM.Greeting.AskDay",
                guard: ({ context }) => !!context.appointment.person,
                actions: () => console.log("Speech complete, moving to AskDay")
              },
              {
                target: "#DM.Greeting.AskName",
                actions: () => console.log("Speech complete, but no valid person - returning to AskName")
              }
            ]
          }
        }
      }
    },
    ProcessDay: {
      initial: "UpdateDay",
      states: {
        UpdateDay: {
          entry: assign(({ context }) => {
            const utterance = context.lastResult?.[0].utterance || "";
            const day = getDay(utterance);
            return { 
              appointment: { 
                ...context.appointment,
                day: day || null
              } 
            };
          }),
          always: "SpeakConfirmation"
        },
        SpeakConfirmation: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }: { context: DMContext }) => {
                const utterance = context.lastResult?.[0].utterance || "";
                const day = getDay(utterance);
                if (day) {
                  return { utterance: `You're meeting on ${day}.` };
                } else {
                  return { utterance: `Sorry, I don't recognize that day.` };
                }
              }
            },
            () => console.log("Starting day confirmation speech..."),
            // Add a timer to auto-complete after speaking
            () => {
              setTimeout(() => {
                console.log("Auto-triggering SPEAK_COMPLETE for day confirmation");
                dmActor.send({ type: "SPEAK_COMPLETE" });
              }, 3000);
            }
          ],
          on: { 
            SPEAK_COMPLETE: [
              {
                target: "#DM.Greeting.AskWholeDay",
                guard: ({ context }) => !!context.appointment.day,
                actions: () => console.log("Speech complete, moving to AskWholeDay")
              },
              {
                target: "#DM.Greeting.AskDay",
                actions: () => console.log("Speech complete, but no valid day - returning to AskDay")
              }
            ]
          }
        }
      }
    },
    ProcessWholeDay: {
      initial: "UpdateWholeDay",
      states: {
        UpdateWholeDay: {
          entry: assign(({ context }) => {
            const utterance = context.lastResult?.[0].utterance || "";
            const wholeDay = utterance.toLowerCase().includes("yes");
            return { 
              appointment: { 
                ...context.appointment,
                wholeDay: wholeDay
              } 
            };
          }),
          always: "SpeakConfirmation"
        },
        SpeakConfirmation: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }: { context: DMContext }) => {
                const wholeDay = context.appointment.wholeDay;
                if (wholeDay) {
                  return { utterance: `Great! It's a whole day meeting.` };
                } else {
                  return { utterance: `Okay, it's not a whole day meeting.` };
                }
              }
            },
            () => console.log("Starting whole day confirmation speech..."),
            // Add a timer to auto-complete after speaking
            () => {
              setTimeout(() => {
                console.log("Auto-triggering SPEAK_COMPLETE for whole day confirmation");
                dmActor.send({ type: "SPEAK_COMPLETE" });
              }, 3000);
            }
          ],
          on: { 
            SPEAK_COMPLETE: [
              {
                target: "#DM.Greeting.AskTime",
                guard: ({ context }) => !context.appointment.wholeDay,
                actions: () => console.log("Speech complete, not whole day - moving to AskTime")
              },
              {
                target: "#DM.SummarizeAppointment",
                guard: ({ context }) => context.appointment.wholeDay,
                actions: () => console.log("Speech complete, whole day meeting - moving to Summary")
              }
            ]
          }
        }
      }
    },
    ProcessTime: {
      initial: "UpdateTime",
      states: {
        UpdateTime: {
          entry: [
            assign(({ context }) => {
              const utterance = context.lastResult?.[0].utterance || "";
              const time = getTime(utterance);
              console.log("ProcessTime.UpdateTime - utterance:", utterance);
              console.log("ProcessTime.UpdateTime - extracted time:", time);
              return { 
                appointment: { 
                  ...context.appointment,
                  time: time || null
                } 
              };
            }),
            ({ context }) => {
              console.log("ProcessTime.UpdateTime - updated appointment:", context.appointment);
            }
          ],
          always: "SpeakConfirmation"
        },
        SpeakConfirmation: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }: { context: DMContext }) => {
                const time = context.appointment.time;
                console.log("ProcessTime.SpeakConfirmation - about to speak, time:", time);
                if (time) {
                  return { utterance: `Your meeting is at ${time}.` };
                } else {
                  return { utterance: `Sorry, I don't recognize that time.` };
                }
              }
            },
            () => console.log("ProcessTime.SpeakConfirmation - speech started"),
            // Add a timer to auto-complete after speaking
            () => {
              setTimeout(() => {
                console.log("Auto-triggering SPEAK_COMPLETE for time confirmation");
                dmActor.send({ type: "SPEAK_COMPLETE" });
              }, 3000);
            }
          ],
          on: { 
            SPEAK_COMPLETE: [
              {
                target: "#DM.SummarizeAppointment",
                guard: ({ context }) => {
                  const hasTime = !!context.appointment.time;
                  console.log("ProcessTime.SpeakConfirmation - SPEAK_COMPLETE guard check, hasTime:", hasTime);
                  console.log("ProcessTime.SpeakConfirmation - current appointment:", context.appointment);
                  return hasTime;
                },
                actions: () => console.log("ProcessTime.SpeakConfirmation - moving to Summarize")
              },
              {
                target: "#DM.Greeting.AskTime",
                actions: () => console.log("ProcessTime.SpeakConfirmation - no valid time, returning to AskTime")
              }
            ]
          }
        }
      }
    },
    SummarizeAppointment: {
      entry: [
        {
          type: "spst.speak",
          params: ({ context }: { context: DMContext }) => {
            if (context.appointment.wholeDay) {
              return {
                utterance: `Your appointment with ${context.appointment.person} is on ${context.appointment.day} for the whole day.`,
              };
            } else {
              return {
                utterance: `Your appointment with ${context.appointment.person} is on ${context.appointment.day} at ${context.appointment.time}.`,
              };
            }
          },
        },
        () => console.log("Summarizing appointment details..."),
        () => {
          setTimeout(() => {
            console.log("Auto-triggering SPEAK_COMPLETE for appointment summary");
            dmActor.send({ type: "SPEAK_COMPLETE" });
          }, 4000);
        }
      ],
      on: { SPEAK_COMPLETE: "ConfirmAppointment" }
    },
    ConfirmAppointment: {
      entry: [
        {
          type: "spst.speak",
          params: ({ context }: { context: DMContext }) => {
            const { person, day, time, wholeDay } = context.appointment;
            const summary = wholeDay
              ? `Do you want to confirm the meeting with ${person} on ${day} for the whole day?`
              : `Do you want to confirm the meeting with ${person} on ${day} at ${time}?`;
            return { utterance: summary };
          }
        },
        () => console.log("Prompting for final confirmation..."),
        // Add auto-trigger for SPEAK_COMPLETE
        () => {
          setTimeout(() => {
            console.log("Auto-triggering SPEAK_COMPLETE for confirmation question");
            dmActor.send({ type: "SPEAK_COMPLETE" });
          }, 4000);
        }
      ],
      on: { SPEAK_COMPLETE: "ListenForConfirmation" }
    },
    ListenForConfirmation: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          {
            target: "Done",
            guard: ({ event }) => event.value[0].utterance.toLowerCase().includes("yes"),
            actions: assign(({ context }) => ({ 
              appointment: { ...context.appointment, confirmation: true } 
            }))
          },
          {
            target: "#DM.Greeting.AskName",
            guard: ({ event }) => event.value[0].utterance.toLowerCase().includes("no"),
            actions: assign({
              appointment: {
                person: null,
                day: null,
                time: null,
                wholeDay: false,
                confirmation: false
              },
              lastResult: null
            })
          }
        ],
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
          target: "ConfirmAppointment"
        }
      }
    },
    Done: {
      entry: ({ context }) => {
        if (context.appointment.confirmation) {
          console.log("Appointment successfully booked!");
        } else {
          console.log("Confirmation not received, should not be here!");
        }
      },
      on: {
        CLICK: {
          target: "Greeting",
          actions: assign({
            lastResult: null,
            appointment: {
              person: null,
              day: null,
              time: null,
              wholeDay: false,
              confirmation: false
            }
          })
        }
      }
    }
  }
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

// Debug the events being sent to the actor
const originalSend = dmActor.send;
dmActor.send = function(event: any) {
  console.log("Event sent to actor:", event);
  return originalSend.apply(this, [event]);
};

// Subscribe to state updates
dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  
  // Add more detailed logging for debugging
  if (state.context.lastResult && state.context.lastResult.length > 0) {
    console.log("Recognition result:", state.context.lastResult[0].utterance);
  }
  
  if (state.context.appointment) {
    console.log("Current appointment:", JSON.stringify(state.context.appointment));
  }
  
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}

// Add a debug button to manually trigger SPEAK_COMPLETE
export function setupDebugButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    console.log("Debug button clicked - forcing SPEAK_COMPLETE event");
    dmActor.send({ type: "SPEAK_COMPLETE" });
  });
}