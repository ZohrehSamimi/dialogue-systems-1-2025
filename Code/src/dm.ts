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
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
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
      time: null
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
        ASRTTS_READY: [
          { 
            target: "WaitToStart",
            actions: () => console.log("Speech services ready!")
          }
        ] 
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
              target: "NoInput",
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
              target: "NoInput",
            },
          },  
        },
        AskTime: {
          entry: { type: "spst.speak", params: { utterance: `What time are you meeting?` } },
          on: { SPEAK_COMPLETE: "ListenForTime" },
        },
        ListenForTime: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => { 
                return { lastResult: event.value };
              }),
              target: "#DM.ProcessTime.UpdateTime",
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "NoInput",
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
            () => console.log("Starting name confirmation speech...")
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
            () => console.log("Starting day confirmation speech...")
          ],
          on: { 
            SPEAK_COMPLETE: [
              {
                target: "#DM.Greeting.AskTime",
                guard: ({ context }) => !!context.appointment.day,
                actions: () => console.log("Speech complete, moving to AskTime")
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
    ProcessTime: {
      initial: "UpdateTime",
      states: {
        UpdateTime: {
          entry: assign(({ context }) => {
            const utterance = context.lastResult?.[0].utterance || "";
            const time = getTime(utterance);
            return { 
              appointment: { 
                ...context.appointment,
                time: time || null
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
                const time = getTime(utterance);
                if (time) {
                  return { utterance: `Your meeting is at ${time}.` };
                } else {
                  return { utterance: `Sorry, I don't recognize that time.` };
                }
              }
            },
            () => console.log("Starting time confirmation speech...")
          ],
          on: { 
            SPEAK_COMPLETE: [
              {
                target: "#DM.SummarizeAppointment",
                guard: ({ context }) => !!context.appointment.time,
                actions: () => console.log("Speech complete, moving to Summarize")
              },
              {
                target: "#DM.Greeting.AskTime",
                actions: () => console.log("Speech complete, but no valid time - returning to AskTime")
              }
            ]
          }
        }
      }
    },
    SummarizeAppointment: {
      entry: {
        type: "spst.speak",
        params: ({ context }: { context: DMContext }) => ({
          utterance: `Your appointment with ${context.appointment.person} is on ${context.appointment.day} at ${context.appointment.time}.`,
        }),
      },
      on: { SPEAK_COMPLETE: "Done" },
    },
    Done: {
      on: {
        CLICK: {
          target: "Greeting",
          actions: assign({
            lastResult: null,
            appointment: {
              person: null,
              day: null,
              time: null
            }
          })
        },
      },
    },
  },
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