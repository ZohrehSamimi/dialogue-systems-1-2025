import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();
const knownPeople: { [key: string]: string } = {
  "albert einstein": "Albert Einstein was a theoretical physicist known for the theory of relativity.",
  "taylor swift": "Taylor Swift is an American singer-songwriter.",
  "marie curie": "Marie Curie was a pioneer in radioactivity research.",
};


const azureCredentials = {
  endpoint:
    "https://samimi1981.cognitiveservices.azure.com/",
  key: "1wkAREoXFI31nPfAcFzfxIPKE1jjqaNBJdrX57eYOkSStSbaUUEAJQQJ99BEACi5YpzXJ3w3AAAaACOGwvNz",
  deploymentName: "appointment",
  projectName: "appointment",
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
        value: { nlu: true }, 
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
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
      on: {
        LISTEN_COMPLETE: [
          {
            target: "WhoIsResponse",
            guard: ({ context }) =>
            context.nluResult?.topIntent === "Who is X",
          },
          {
            target: "CheckGrammar",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello world!` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,       
                nluResult: event.nluValue,   })),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    CheckGrammar: {
  entry: {
    type: "spst.speak",
    params: ({ context }) => ({
      utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
        isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
      } in the grammar.`,
    }),
  },
  on: { SPEAK_COMPLETE: "Done" },
},

WhoIsResponse: {
  entry: ({ context }) => {
    const personEntity = context.nluResult?.prediction?.entities?.person?.[0]?.toLowerCase();
    const description =
      knownPeople[personEntity] || `Sorry, I don't have information about ${personEntity}.`;

    context.spstRef.send({
      type: "SPEAK",
      value: { utterance: description },
    });
  },

      on: { SPEAK_COMPLETE: "Done" },
    },
    Done: {
      on: {
        CLICK: "Greeting",
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