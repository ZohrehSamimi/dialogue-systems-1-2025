import { assign, createActor, setup, createMachine } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import { DMContext, DMEvents } from "./types";
import { SpeechStateExternalEvent } from "speechstate";
import { RecognisedEvent } from "./types";


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
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "1": { time: "13:00" },
  "2": { time: "14:00" },

};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return grammar[utterance.toLowerCase()]?.person || null;
}

function getDay(utterance: string) {
  return grammar[utterance.toLowerCase()]?.day || null;
}

function getTime(utterance: string) {
  return grammar[utterance.toLowerCase()]?.time || null
}
export function isRecognisedEvent(event: SpeechStateExternalEvent): event is RecognisedEvent {
  return event.type === "RECOGNISED" && Array.isArray(event.value);
}


const dmMachine = setup({
  types: {

    /** you might need to extend these */
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    /** define your actions here */
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
    name: null,
    date: null,
    time: null,
    allDay: false,
  }),
  id: "DM",
  initial: "Start",
  states: {
    Start: {
      entry: { type: "spst.speak", params: { utterance: `Let's create an appointment` } },
      on: { SPEAK_COMPLETE: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "AskName" },
    },
    AskName: {
      entry: { type: "spst.speak", params: { utterance: `Who are you meeting with?` } },
      on: { SPEAK_COMPLETE: "ListenName" },
    },
    ListenName: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            name: getPerson(event.value[0].utterance) || event.value[0].utterance,
          })),
          target: "AskDate",
        },
        ASR_NOINPUT: "AskName",
      },
    },
    
    AskDate: {
      entry: { type: "spst.speak", params: { utterance: `On which day is your meeting?` } },
      on: { SPEAK_COMPLETE: "ListenDate" },
    },
    ListenDate: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            date: getDay(event.value[0].utterance) || event.value[0].utterance,
          })),
          target: "AskAllDay",
        },
        ASR_NOINPUT: "AskDate",
      }, 
    },
    AskAllDay: {
      entry: { type: "spst.speak", params: { utterance: `Will it take the whole day?` } },
      on: { SPEAK_COMPLETE: "ListenAllDay" },
    },
    ListenAllDay: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          {
            cond: ({ event }: { event: SpeechStateExternalEvent }) => 
              isRecognisedEvent(event) &&
              ["yes", "yup", "sure", "of course"].includes(event.value[0].utterance.toLowerCase()),
            actions: assign({ allDay: true }),
            target: "Confirm",
          },
          {
            cond: ({ event }: { event: SpeechStateExternalEvent }) => 
              isRecognisedEvent(event) &&
              ["no", "nope", "not at all"].includes(event.value[0].utterance.toLowerCase()),
            actions: assign({ allDay: false }),
            target: "AskTime",
          },
        ],
        ASR_NOINPUT: "AskAllDay",
      },
    },
    

    AskTime: {
      entry: { type: "spst.speak", params: { utterance: `What time is your meeting?` } },
      on: { SPEAK_COMPLETE: "ListenTime" },
    },

    ListenTime: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            time: getTime(event.value[0].utterance) || event.value[0].utterance,
          })),

          target: "Confirm",
        },
        ASR_NOINPUT: "AskTime",
      },
    },

    Confirm: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: context.allDay
          ? `Do you want me to create an appointment with ${context.name} on ${context.date} for the whole day?`
            : `Do you want me to create an appointment with ${context.name} on ${context.date} at ${context.time}?`,
        }),
      },
      on: { SPEAK_COMPLETE: "ListenConfirm" },
    },
    ListenConfirm: {
  entry: { type: "spst.listen" },
  on: {
    RECOGNISED: [
      {
        cond: ({ event }: { event: SpeechStateExternalEvent }) => 
          isRecognisedEvent(event) &&
          ["yes", "yup", "sure", "of course"].includes(event.value[0].utterance.toLowerCase()),
        target: "CreateAppointment",
      },
      {
        cond: ({ event }: { event: SpeechStateExternalEvent }) => 
          isRecognisedEvent(event) &&
          ["no", "nope", "not at all"].includes(event.value[0].utterance.toLowerCase()),
        target: "End",
      },
    ],
    ASR_NOINPUT: "Confirm",
  },
},

    End: {
      entry: { type: "spst.speak", params: { utterance: `Goodbye!` } },
      type: "final",
    },



    CreateAppointment: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Your appointment has been created with ${context.name} on ${context.date} at ${context.time}...`,
        }),
      },
      on: { SPEAK_COMPLETE: "End" },
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
