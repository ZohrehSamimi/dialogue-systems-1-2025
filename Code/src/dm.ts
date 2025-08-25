import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, ENDPOINT } from "./azure"; // Prefer ENDPOINT = "https://<region>.api.cognitive.microsoft.com/"
import { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

// If you're using a backend token, replace { key: KEY } with { authorizationToken: <token> }
const azureCredentials = {
  endpoint: ENDPOINT, // e.g., "https://northeurope.api.cognitive.microsoft.com/"
  key: KEY,
};

const settings: Settings = {
  azureCredentials,
  azureRegion: "northeurope",
  // As requested: no automatic timeouts; you control transitions via events.
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 0,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

/** ---- Simple grammar helpers ---- */
interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
}

const grammar: Record<string, GrammarEntry> = {
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
  one: { time: "1:00" },
  two: { time: "2:00" },
  three: { time: "3:00" },
  four: { time: "4:00" },
  five: { time: "5:00" },
  six: { time: "6:00" },
  seven: { time: "7:00" },
  eight: { time: "8:00" },
  nine: { time: "9:00" },
};

function getPerson(u: string): string | null {
  const l = u.toLowerCase();
  if (grammar[l]?.person) return grammar[l].person!;
  for (const k in grammar) if (grammar[k].person && l.includes(k)) return grammar[k].person!;
  return null;
}

function getDay(u: string): string | null {
  const l = u.toLowerCase();
  for (const k in grammar) if (grammar[k].day && l.includes(k)) return grammar[k].day!;
  return null;
}

function getTime(u: string): string | null {
  const l = u.toLowerCase().trim();
  if (grammar[l]?.time) return grammar[l].time!;
  for (const k in grammar) if (grammar[k].time && l.includes(k)) return grammar[k].time!;
  const m = l.match(/(\w+)\s*o'?clock/); // e.g., "two o'clock"
  if (m && grammar[m[1]]?.time) return grammar[m[1]].time!;
  return null;
}

const isYes = (u: string) => /(?:^|\b)(yes|yeah|yep|ok|okay|sure|confirm|correct)(?:\b|$)/i.test(u);
const isNo  = (u: string) => /(?:^|\b)(no|nope|nah|cancel|restart|wrong)(?:\b|$)/i.test(u);

/** ---- Machine ---- */
const dmMachine = setup({
  types: {
    context: {} as DMContext,    // should include: spstRef, lastResult, appointment {person, day, time, wholeDay?}
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({ type: "SPEAK", value: { utterance: params.utterance } }),
    "spst.listen": ({ context }) => context.spstRef.send({ type: "LISTEN" }),
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
    confirmation: false,          // ← add this
  },
}),

  states: {
    /** 0) Prepare speech (ASR/TTS) */
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "Welcome" },
    },

    /** Welcome */
    Welcome: {
      entry: { type: "spst.speak", params: { utterance: "Let's create an appointment." } },
      on: { SPEAK_COMPLETE: "AskName" },
    },

    /** 1) Name */
    AskName: {
      entry: { type: "spst.speak", params: { utterance: "Who are you meeting with?" } },
      on: { SPEAK_COMPLETE: "ListenName" },
    },
    ListenName: {
      entry: "spst.listen",
      on: {
        RECOGNISED: {
          target: "ProcessName",
          actions: assign(({ event }) => ({ lastResult: event.value })),
        },
        ASR_NOINPUT: "AskName",
        ASR_ERROR: "AskName",
      },
    },
    ProcessName: {
      entry: assign(({ context }) => {
        const u = context.lastResult?.[0]?.utterance || "";
        return { appointment: { ...context.appointment, person: getPerson(u) } };
      }),
      always: [
        { guard: ({ context }) => !!context.appointment.person, target: "AskDay" },
        { target: "AskName" },
      ],
    },

    /** 2) Day */
    AskDay: {
      entry: { type: "spst.speak", params: { utterance: "On which day is your meeting?" } },
      on: { SPEAK_COMPLETE: "ListenDay" },
    },
    ListenDay: {
      entry: "spst.listen",
      on: {
        RECOGNISED: {
          target: "ProcessDay",
          actions: assign(({ event }) => ({ lastResult: event.value })),
        },
        ASR_NOINPUT: "AskDay",
        ASR_ERROR: "AskDay",
      },
    },
    ProcessDay: {
      entry: assign(({ context }) => {
        const u = context.lastResult?.[0]?.utterance || "";
        return { appointment: { ...context.appointment, day: getDay(u) } };
      }),
      always: [
        { guard: ({ context }) => !!context.appointment.day, target: "AskWholeDay" },
        { target: "AskDay" },
      ],
    },

    /** 3) Whole day? */
    AskWholeDay: {
      entry: { type: "spst.speak", params: { utterance: "Will it take the whole day?" } },
      on: { SPEAK_COMPLETE: "ListenWholeDay" },
    },
    ListenWholeDay: {
      entry: "spst.listen",
      on: {
        RECOGNISED: {
          target: "ProcessWholeDay",
          actions: assign(({ event }) => ({ lastResult: event.value })),
        },
        ASR_NOINPUT: "AskWholeDay",
        ASR_ERROR: "AskWholeDay",
      },
    },
    ProcessWholeDay: {
      always: [
        {
          guard: ({ context }) => isYes(context.lastResult?.[0]?.utterance || ""),
          target: "SummaryWholeDay",
          actions: assign(({ context }) => ({
            appointment: { ...context.appointment, wholeDay: true, time: null },
          })),
        },
        {
          guard: ({ context }) => isNo(context.lastResult?.[0]?.utterance || ""),
          target: "AskTime",
          actions: assign(({ context }) => ({
            appointment: { ...context.appointment, wholeDay: false },
          })),
        },
        { target: "AskWholeDay" },
      ],
    },

    /** 4) Time (only if NOT whole day) */
    AskTime: {
      entry: { type: "spst.speak", params: { utterance: "What time is your meeting?" } },
      on: { SPEAK_COMPLETE: "ListenTime" },
    },
    ListenTime: {
      entry: "spst.listen",
      on: {
        RECOGNISED: {
          target: "ProcessTime",
          actions: assign(({ event }) => ({ lastResult: event.value })),
        },
        ASR_NOINPUT: "AskTime",
        ASR_ERROR: "AskTime",
      },
    },
    ProcessTime: {
      entry: assign(({ context }) => {
        const u = context.lastResult?.[0]?.utterance || "";
        return { appointment: { ...context.appointment, time: getTime(u) } };
      }),
      always: [
        { guard: ({ context }) => !!context.appointment.time, target: "SummaryTimed" },
        { target: "AskTime" },
      ],
    },

    /** 5) Confirm (two variants) */
    SummaryTimed: {
      entry: {
        type: "spst.speak",
        params: ({ context }: { context: DMContext }) => ({
          utterance: `Do you want me to create an appointment with ${context.appointment.person} on ${context.appointment.day} at ${context.appointment.time}?`,
        }),
      },
      on: { SPEAK_COMPLETE: "ListenConfirm" },
    },
    SummaryWholeDay: {
      entry: {
        type: "spst.speak",
        params: ({ context }: { context: DMContext }) => ({
          utterance: `Do you want me to create an appointment with ${context.appointment.person} on ${context.appointment.day} for the whole day?`,
        }),
      },
      on: { SPEAK_COMPLETE: "ListenConfirm" },
    },
    ListenConfirm: {
  entry: "spst.listen",
  on: {
    RECOGNISED: [
      {
        guard: ({ event }) => isYes(event.value?.[0]?.utterance || ""),
        target: "Done",
        actions: assign(({ context }) => ({
          appointment: { ...context.appointment, confirmation: true } // ← add
        })),
      },
      {
        guard: ({ event }) => isNo(event.value?.[0]?.utterance || ""),
        target: "AskName",
        actions: assign({
          lastResult: null,
          appointment: { person: null, day: null, time: null, wholeDay: false, confirmation: false }, // ← ensure reset
        }),
      },
      { target: "ListenConfirm" },
    ],
    ASR_NOINPUT: "ListenConfirm",
    ASR_ERROR: "ListenConfirm",
  },
},

    /** 6) Done */
    Done: {
      entry: { type: "spst.speak", params: { utterance: "Your appointment has been created!" } },
      on: { SPEAK_COMPLETE: "Welcome" },
    },
  },
});

const dmActor = createActor(dmMachine,/* { inspect: inspector.inspect }*/).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => dmActor.send({ type: "CLICK" }));
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } =
      Object.values(snapshot.context.spstRef.getSnapshot().getMeta?.() || {})[0] || {};
    element.innerHTML = `${meta?.view || "Click to start"}`;
  });
}
