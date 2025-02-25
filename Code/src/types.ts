import { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import { AnyActorRef } from "xstate";
import { AnyEventObject } from "xstate";


// Custom type alias for RecognisedEvent
export type RecognisedEvent = SpeechStateExternalEvent & {
  type: "RECOGNISED";
  value: Hypothesis[];
};

// Type guard for RecognisedEvent
export function isRecognisedEvent(event: SpeechStateExternalEvent): event is RecognisedEvent {
  return event.type === "RECOGNISED" && Array.isArray(event.value);
}

export interface DMContext {
  spstRef: any;
  lastResult: any;
  name: string | null;
  date: string | null;
  time: string | null;
  allDay: boolean | null;
}
export type DMEvent =
| { type: 'RECOGNISED'; value: Hypothesis[] }
| { type: 'SPEAK_COMPLETE' }
| { type: 'CLICK' }
| { type: 'ASR_NOINPUT' };

// Removed duplicate declaration of isRecognisedEvent
export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" };
