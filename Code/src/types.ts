import { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import { AnyActorRef } from "xstate";

export interface Appointment {
  person: string | null;
  day: string | null;
  time: string | null;
}

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: Hypothesis[] | null;
  appointment?: Appointment;   // ← now optional
  nluResult?: any;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" };
