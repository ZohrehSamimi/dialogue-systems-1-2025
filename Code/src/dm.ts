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
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
      }),
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
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
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
              target: "#DM.ProcessName",
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
              target: "#DM.ProcessDay",
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
              target: "#DM.ProcessTime",
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
      entry: [
        assign(({ context }) => {
          const utterance = context.lastResult?.[0].utterance || "";
          const person = getPerson(utterance);
          return { 
            appointment: { 
              ...context.appointment,
              person 
            } 
          };
        }),
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
        }
      ],
      on: { 
        SPEAK_COMPLETE: {
          target: "Greeting.AskDay",
          // Only proceed if we understood the person
          guard: ({ context }) => !!context.appointment.person
        } 
      },
    },
    ProcessDay: {
      entry: [
        assign(({ context }) => {
          const utterance = context.lastResult?.[0].utterance || "";
          const day = getDay(utterance);
          return { 
            appointment: { 
              ...context.appointment,
              day 
            } 
          };
        }),
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
        }
      ],
      on: { 
        SPEAK_COMPLETE: {
          target: "Greeting.AskTime",
          // Only proceed if we understood the day
          guard: ({ context }) => !!context.appointment.day
        } 
      },
    },
    ProcessTime: {
      entry: [
        assign(({ context }) => {
          const utterance = context.lastResult?.[0].utterance || "";
          const time = getTime(utterance);
          return { 
            appointment: { 
              ...context.appointment,
              time
            } 
          };
        }),
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
        }
      ],
      on: { 
        SPEAK_COMPLETE: {
          target: "SummarizeAppointment",
          // Only proceed if we understood the time
          guard: ({ context }) => !!context.appointment.time
        } 
      },
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

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
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