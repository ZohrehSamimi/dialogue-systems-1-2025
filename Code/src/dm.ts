import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import { DMContext, DMEvents } from "./types";
import { RecognitionResult } from "./types";

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
  asrDefaultNoInputTimeout: 0,
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
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "1": { time: "1:00" },
  "2": { time: "2:00" },
  "3": { time: "3:00" },
  "4": { time: "4:00" },
  "5": { time: "5:00" },
  "6": { time: "6:00" },
  "7": { time: "7:00" },
  "8": { time: "8:00" },
  "9": { time: "9:00" },
  "ten": { time: "10:00" },
  "eleven": { time: "11:00" },
  "twelve": { time: "12:00" },
  "one": { time: "1:00" },
  "two": { time: "2:00" },
  "three": { time: "3:00" },
  "four": { time: "4:00" },
  "five": { time: "5:00" },
  "six": { time: "6:00" },
  "seven": { time: "7:00" },
  "eight": { time: "8:00" },
  "nine": { time: "9:00" },
};

interface Hypothesis {
  utterance: string;
  confidence: number;
}

function isRecognisedEvent(event: DMEvents): event is { type: "RECOGNISED"; value: Hypothesis[] } {
  return event.type === "RECOGNISED" && Array.isArray((event as any).value);
}



function getPerson(utterance: string): string | null {
  const lower = utterance.toLowerCase();
  console.log("getPerson - checking utterance:", lower);
  
  // Direct match first
  if (grammar[lower]?.person) {
    console.log("getPerson - direct match found:", grammar[lower].person);
    return grammar[lower].person;
  }
  
  // Check for partial matches
  for (const key in grammar) {
    if (grammar[key].person && lower.includes(key)) {
      console.log("getPerson - partial match found:", grammar[key].person);
      return grammar[key].person;
    }
  }
  
  console.log("getPerson - no match found");
  return null;
}

function getDay(utterance: string) {
  const lower = utterance.toLowerCase();
  for (const key in grammar) {
    if (grammar[key].day && lower.includes(key)) {
      return grammar[key].day;
    }
  }
  return null;
}

function getTime(utterance: string) {
  const lower = utterance.toLowerCase().trim();
  
  // Direct match
  if (grammar[lower]?.time) {
    return grammar[lower].time;
  }
  
  // Check for partial matches
  for (const key in grammar) {
    if (grammar[key].time && lower.includes(key)) {
      return grammar[key].time;
    }
  }
  
  // Handle "o'clock" format
  const match = lower.match(/(\w+)\s*o'?clock/);
  if (match && grammar[match[1]]?.time) {
    return grammar[match[1]].time;
  }
  
  return null;
}

function isYesResponse(utterance: string): boolean {
  const lower = utterance.toLowerCase();
  return ["yes", "yeah", "yep", "sure", "ok", "okay", "yup", "correct", "right", "absolutely"].some(word => 
    lower.includes(word)
  );
}

function isNoResponse(utterance: string): boolean {
  const lower = utterance.toLowerCase();
  return ["no", "nope", "not", "nah", "negative", "don't", "doesnt", "doesn't"].some(word => 
    lower.includes(word)
  );
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
        value: { utterance: params.utterance },
      });
    },
    "spst.listen": ({ context }) => {
      console.log("Starting to listen...");
      context.spstRef.send({ type: "LISTEN" });
    },
    "logError": (_, params: { error: string }) => {
      console.error("Error:", params.error);
    }
  },
}).createMachine({
  id: "DM",
  initial: "Prepare",
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    appointment: {
      person: null,
      day: null,
      time: null,
      wholeDay: false,
      confirmation: false,
    },
  }),
  states: {
    Prepare: {
      entry: ({ context }: { context: DMContext }) => {
        console.log("Preparing speech services...");
        context.spstRef.send({ type: "PREPARE" });
      },
      on: { 
        ASRTTS_READY: {
          target: "WaitToStart",
          actions: () => console.log("Speech services ready!")
        },
        ASRTTS_ERROR: {
          actions: { type: "logError", params: { error: "Failed to prepare speech services" } }
        }
      },
    },
    WaitToStart: {
      on: { CLICK: "Welcome" },
    },
    Welcome: {
  entry: { 
    type: "spst.speak", 
    params: { utterance: "Welcome! Let's schedule your appointment." } 
  },
  on: { SPEAK_COMPLETE: "AskName" },
},
    AskName: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Who is the appointment with? Say Vlad, Aya, or Victoria." },
      },
      on: { 
        SPEAK_COMPLETE: "ListenName",
        
      },
    },
    
    ListenName: {
      entry: "spst.listen",
      on: {
        RECOGNISED: {
          actions: [
              assign(({ event }) => ({ lastResult: event.value })),
              ({ event }) => console.log("Recognized:", event.value[0].utterance)
  ],
          target: "ProcessName"
},
        ASR_NOINPUT: {
          target: "NoInputName",
          actions: () => console.log("No input detected")
        },
        ASR_ERROR: {
          target: "AskName",
          actions: { type: "logError", params: { error: "ASR error" } }
        }
      },
    },
    ProcessName: {
      entry: ({ context }: { context: DMContext }) => {
        const utterance = context.lastResult?.[0]?.utterance || "";
        const person = getPerson(utterance);
        console.log("ProcessName - utterance:", utterance);
        console.log("ProcessName - person found:", person);
      },
      always: [
        {
          guard: ({ context }: { context: DMContext }) => {
            const utterance = context.lastResult?.[0]?.utterance || "";
            const person = getPerson(utterance);
            console.log("Guard checking - person:", person);
            return !!person;
          },
          target: "ConfirmName",
          actions: assign(({ context }: { context: DMContext }) => {
            const utterance = context.lastResult?.[0]?.utterance || "";
            const person = getPerson(utterance);
            console.log("Assigning person:", person);
            return {
              appointment: { 
                ...context.appointment, 
                person: person || null
              }
            };
          })
        },
        { 
          target: "InvalidName",
          actions: () => console.log("No valid person found, going to InvalidName")
        }
      ]
    },
    NoInputName: {
  after: {
    100: "NoInputNameSpeak"
  }
},
NoInputNameSpeak: {
  entry: {
    type: "spst.speak",
    params: { utterance: "I didn't hear anything. Please tell me who you're meeting with." },
  },
  on: { SPEAK_COMPLETE: "ListenName" },
},
    InvalidName: {
  after: {
    100: "InvalidNameSpeak"
  }
},
InvalidNameSpeak: {
  entry: {
    type: "spst.speak",
    params: { utterance: "I didn't understand. Please say Vlad, Aya, or Victoria." },
  },
  on: { SPEAK_COMPLETE: "ListenName" },
},
    ConfirmName: {
      entry: [
        ({ context }: { context: DMContext }) => {
          console.log("Entering ConfirmName with person:", context.appointment.person);
          const utterance = `Great! Meeting with ${context.appointment.person}.`;
          console.log("Speaking:", utterance);
          context.spstRef.send({
            type: "SPEAK",
            value: { utterance: utterance }
          });
        }
      ],
      on: { 
        SPEAK_COMPLETE: {
          target: "AskDay",
          actions: () => console.log("SPEAK_COMPLETE received, moving to AskDay")
        },
        LISTEN_COMPLETE: {
          target: "AskDay",
          actions: () => console.log("LISTEN_COMPLETE received, moving to AskDay")
        },
        ASRTTS_READY: {
          target: "AskDay",
          actions: () => console.log("ASRTTS_READY received, moving to AskDay")
        },
        "*": {
          actions: ({ event }: { event: DMEvents }) => console.log("Other event in ConfirmName:", event)
        }
      },
      
          target: "AskDay",
          actions: () => console.log("Timeout - forcing move to AskDay")
        },
      
    AskDay: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Which day is the appointment?" },
      },
      on: { 
        SPEAK_COMPLETE: "ListenDay"
      },
    },
    
    ListenDay: {
      entry: "spst.listen",
      on: {
        RECOGNISED: {
          actions: [
          assign(({ event }) => ({ lastResult: event.value })),
          ({ event }) => console.log("Recognized:", event.value[0].utterance)
  ],
        target: "ProcessDay"
},
        ASR_NOINPUT: {
          target: "NoInputDay",
          actions: () => console.log("No input detected")
        },
        ASR_ERROR: {
          target: "AskDay",
          actions: { type: "logError", params: { error: "ASR error" } }
        }
      },
    },
    ProcessDay: {
      always: [
        {
          guard: ({ context }: { context: DMContext }) => {
            const utterance = context.lastResult?.[0]?.utterance || "";
            return !!getDay(utterance);
          },
          target: "ConfirmDay",
          actions: assign(({ context }: { context: DMContext }) => {
            const utterance = context.lastResult?.[0]?.utterance || "";
            return {
              appointment: { 
                ...context.appointment, 
                day: getDay(utterance) || null
              }
            };
          })
        },
        { target: "InvalidDay" }
      ]
    },
    NoInputDay: {
  after: {
    100: "NoInputDaySpeak"
  }
},
NoInputDaySpeak: {
  entry: {
    type: "spst.speak",
    params: { utterance: "I didn't hear anything. Which day?" },
  },
  on: { SPEAK_COMPLETE: "ListenDay" },
},
    InvalidDay: {
  after: {
    100: "InvalidDaySpeak"
  }
},
InvalidDaySpeak: {
  entry: {
    type: "spst.speak",
    params: { utterance: "Please say a weekday like Monday or Friday." },
  },
  on: { SPEAK_COMPLETE: "ListenDay" },
},

    ConfirmDay: {
  entry: {
    type: "spst.speak",
    params: ({ context }: { context: DMContext }) => ({ 
      utterance: `Got it! On ${context.appointment.day}.` 
    })
  },
  on: { 
    SPEAK_COMPLETE: "AskWholeDay",
    LISTEN_COMPLETE: "AskWholeDay",
    ASRTTS_READY: "AskWholeDay"
  },
  after: {
    3000: "AskWholeDay"
  }
},
    // NEW WHOLE DAY STATES
    AskWholeDay: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Is this a whole day meeting?" },
      },
      on: { 
        SPEAK_COMPLETE: "ListenWholeDay"
      },
    },
    
    ListenWholeDay: {
      entry: "spst.listen",
      on: {
        RECOGNISED: {
          actions: [
          assign(({ event }) => ({ lastResult: event.value })),
          ({ event }) => console.log("Recognized:", event.value[0].utterance)
  ],
  target: "ProcessWholeDay"
},
        ASR_NOINPUT: {
          target: "NoInputWholeDay",
          actions: () => console.log("No input detected for whole day question")
        },
        ASR_ERROR: {
          target: "AskWholeDay",
          actions: { type: "logError", params: { error: "ASR error" } }
        }
      },
    },
    ProcessWholeDay: {
  entry: ({ context }: { context: DMContext }) => {
    const utterance = context.lastResult?.[0]?.utterance || "";
    console.log("ProcessWholeDay - utterance:", utterance);
  },
  always: [
    {
      guard: ({ context }: { context: DMContext }) => {
        const utterance = context.lastResult?.[0]?.utterance || "";
        const isYes = isYesResponse(utterance);
        console.log("Is whole day? ", isYes);
        return isYes;
      },
      target: "ConfirmWholeDay",
      actions: assign(({ context }: { context: DMContext }) => {
        return {
          appointment: { 
            ...context.appointment, 
            wholeDay: true,
            time: null // Clear time for whole day meetings
          }
        };
      })
    },
    {
      guard: ({ context }: { context: DMContext }) => {
        const utterance = context.lastResult?.[0]?.utterance || "";
        const isNo = isNoResponse(utterance);
        console.log("Not whole day? ", isNo);
        return isNo;
      },
      target: "ConfirmNotWholeDay", // Changed from "AskTime" to intermediate state
      actions: assign(({ context }: { context: DMContext }) => {
        return {
          appointment: { 
            ...context.appointment, 
            wholeDay: false
          }
        };
      })
    },
    { 
      target: "InvalidWholeDay",
      actions: () => console.log("Unclear whole day response")
    }
  ]
},
ConfirmNotWholeDay: {
  entry: {
    type: "spst.speak",
    params: { utterance: "Okay, it's not a whole day meeting." }
  },
  on: {
    SPEAK_COMPLETE: "AskTime"
  },
  after: {
    2000: "AskTime" // Fallback timeout
  }
},
    NoInputWholeDay: {
  after: {
    100: "NoInputWholeDaySpeak"
  }
},
NoInputWholeDaySpeak: {
  entry: {
    type: "spst.speak",
    params: { utterance: "I didn't hear anything. Is it a whole day meeting? Say yes or no." },
  },
  on: { SPEAK_COMPLETE: "ListenWholeDay" },
},
    InvalidWholeDay: {
  after: {
    100: "InvalidWholeDaySpeak"
  }
},
InvalidWholeDaySpeak: {
  entry: {
    type: "spst.speak",
    params: { utterance: "Please say yes if it's a whole day meeting, or no if it's not." },
  },
  on: { SPEAK_COMPLETE: "ListenWholeDay" },
},
    ConfirmWholeDay: {
  entry: {
    type: "spst.speak",
    params: { utterance: "Okay, it's a whole day meeting." }
  },
  on: { 
    SPEAK_COMPLETE: "Summary",
    LISTEN_COMPLETE: "Summary",
    ASRTTS_READY: "Summary"
  },
  after: {
    3000: "Summary"
  }
},
    // END OF NEW WHOLE DAY STATES
    AskTime: {
  entry: {
    type: "spst.speak",
    params: { utterance: "What time is the appointment?" },
  },
  on: { 
    SPEAK_COMPLETE: "ListenTime"
  },
  after: {
    3000: "ListenTime"  // Fallback timeout
  }
},
    
    ListenTime: {
      entry: "spst.listen",
      on: {
        RECOGNISED: {
          actions: [
            assign(({ event }: { event: DMEvents }) => ({ lastResult: event.type === 'RECOGNISED' ? event.value : null })),
            ({ event }: { event: DMEvents }) => {
              if (event.type === 'RECOGNISED') {
                console.log("Recognized:", event.value[0].utterance);
              }
            }
          ],
          target: "ProcessTime"
        },
        ASR_NOINPUT: {
          target: "NoInputTime",
          actions: () => console.log("No input detected")
        },
        ASR_ERROR: {
          target: "AskTime",
          actions: { type: "logError", params: { error: "ASR error" } }
        }
      },
    },
    ProcessTime: {
      always: [
        {
          guard: ({ context }: { context: DMContext }) => {
            const utterance = context.lastResult?.[0]?.utterance || "";
            return !!getTime(utterance);
          },
          target: "ConfirmTime",
          actions: assign(({ context }: { context: DMContext }) => {
            const utterance = context.lastResult?.[0]?.utterance || "";
            return {
              appointment: { 
                ...context.appointment, 
                time: getTime(utterance) || null
              }
            };
          })
        },
        { target: "InvalidTime" }
      ]
    },
    NoInputTime: {
  after: {
    100: "NoInputTimeSpeak"
  }
},
NoInputTimeSpeak: {
  entry: {
    type: "spst.speak",
    params: { utterance: "I didn't hear anything. What time?" },
  },
  on: { SPEAK_COMPLETE: "ListenTime" },
},
    InvalidTime: {
  after: {
    100: "InvalidTimeSpeak"
  }
},
InvalidTimeSpeak: {
  entry: {
    type: "spst.speak",
    params: { utterance: "Please say a time like 'two o'clock' or 'three'." },
  },
  on: { SPEAK_COMPLETE: "ListenTime" },
},
    ConfirmTime: {
  entry: {
    type: "spst.speak",
    params: ({ context }: { context: DMContext }) => ({ 
      utterance: `Perfect! At ${context.appointment.time}.` 
    })
  },
  on: { 
    SPEAK_COMPLETE: "Summary",
    LISTEN_COMPLETE: "Summary",
    ASRTTS_READY: "Summary"
  },
  after: {
    3000: "Summary"
  }
},
    Summary: {
      entry: [
        ({ context }: { context: DMContext }) => {
          let utterance;
          if (context.appointment.wholeDay) {
            utterance = `Your whole day appointment is with ${context.appointment.person} on ${context.appointment.day}. Say yes to confirm or no to start over.`;
          } else {
            utterance = `Your appointment is with ${context.appointment.person} on ${context.appointment.day} at ${context.appointment.time}. Say yes to confirm or no to start over.`;
          }
          console.log("Speaking summary:", utterance);
          context.spstRef.send({
            type: "SPEAK",
            value: { utterance: utterance }
          });
        }
      ],
      on: { 
        SPEAK_COMPLETE: "ListenConfirmation",
        
      },
      
    },
    
    ListenConfirmation: {
      entry: [
        () => console.log("Entering ListenConfirmation state"),
        "spst.listen"
],
      on: {
        RECOGNISED: {
  actions: [
    assign(({ event }) => ({ lastResult: event.value })),
    ({ event }) => console.log("Confirmation recognized:", event.value[0].utterance)
  ],
  target: "ProcessConfirmation"
},
        ASR_NOINPUT: {
          target: "Summary",
          actions: () => console.log("No input detected in confirmation")
        },
        ASR_ERROR: {
          target: "Summary",
          actions: () => console.log("ASR error in confirmation")
        },
        "*": {
          actions: ({ event }) => console.log("Unexpected event in ListenConfirmation:", event)
        }
      },
      after: {
        10000: {
          target: "Summary",
          actions: () => console.log("Timeout in ListenConfirmation")
        }
      }
    },
    ProcessConfirmation: {
      entry: () => console.log("Entering ProcessConfirmation"),
      always: [
        {
          guard: ({ context }: { context: DMContext }) => {
            const utterance = context.lastResult?.[0]?.utterance?.toLowerCase() || "";
            console.log("Checking for YES - utterance:", utterance);
            const isYes = ["yes", "sure", "ok", "okay", "yeah", "yep", "confirm"].some(word => 
              utterance.includes(word)
            );
            console.log("Is YES?", isYes);
            return isYes;
          },
          target: "Done"
        },
        {
          guard: ({ context }: { context: DMContext }) => {
            const utterance = context.lastResult?.[0]?.utterance?.toLowerCase() || "";
            console.log("Checking for NO - utterance:", utterance);
            const isNo = ["no", "nope", "cancel", "wrong", "restart"].some(word => 
              utterance.includes(word)
            );
            console.log("Is NO?", isNo);
            return isNo;
          },
          target: "WaitToStart",
          actions: assign({
            appointment: {
              person: null,
              day: null,
              time: null,
              wholeDay: false,
              confirmation: false,
            },
            lastResult: null,
          })
        },
        { 
          target: "Summary",
          actions: () => console.log("Neither YES nor NO, returning to Summary")
        }
      ]
    },
    Done: {
      entry: [
        ({ context }: { context: DMContext }) => {
          const utterance = "Great! Your appointment is confirmed. Thank you!";
          console.log("Speaking done message:", utterance);
          console.log("Final appointment details:", context.appointment);
          context.spstRef.send({
            type: "SPEAK",
            value: { utterance: utterance }
          });
        }
      ],
      on: {
        CLICK: {
          target: "Welcome",
          actions: assign({
            appointment: {
              person: null,
              day: null,
              time: null,
              wholeDay: false,
              confirmation: false,
            },
            lastResult: null,
          }),
        }
      }
    }
  }
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

// Monitor all state transitions
dmActor.subscribe((state) => {
  console.log("=== State Transition ===");
  console.log("Current state:", state.value);
  
  if (state.context.spstRef) {
    const spstState = state.context.spstRef.getSnapshot();
    console.log("Speech State:", spstState.value);
  }
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });

  dmActor.subscribe((snapshot: any) => {
    const spstSnapshot = snapshot.context.spstRef.getSnapshot();
    const meta: { view?: string } = Object.values(spstSnapshot.getMeta?.() || {})[0] || {};
    element.innerHTML = `${meta?.view || "Click to start"}`;
  });
}

export function setupDebugButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    const state = dmActor.getSnapshot();
    console.log("Current State:", state.value);
    console.log("Appointment:", state.context.appointment);
    
    // Force next transition
    dmActor.send({ type: "SPEAK_COMPLETE" });
  });
}