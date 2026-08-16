/**
 * Live meter levels from the obs-websocket `InputVolumeMeters` event.
 *
 * The event fires around twenty times a second for every audio input, which is
 * far too hot for the zustand store: pushing it through there would re-render
 * the whole deck on every frame. Levels live here instead, outside React, and
 * meters subscribe to just the input they draw.
 */

/** Silence floor, matching the mixer fader's own bottom end. */
export const METER_MIN_DB = -60;

export type InputLevel = {
  /** Loudest channel's magnitude (the moving bar), in dB. */
  db: number;
  /** Loudest channel's instantaneous peak, in dB. */
  peakDb: number;
  /** Peak that lingers before sliding back down, like the OBS meter's tick. */
  holdDb: number;
};

const SILENT: InputLevel = { db: METER_MIN_DB, peakDb: METER_MIN_DB, holdDb: METER_MIN_DB };

/** How long a peak stays pinned before it starts falling. */
const HOLD_MS = 1000;
const HOLD_FALL_DB_PER_SEC = 40;
/** Grace period before dropping the subscription, so a re-render cannot flap it. */
const RELEASE_DELAY_MS = 300;

type Entry = {
  level: InputLevel;
  /** When the current hold value was set, for the pin-then-fall behaviour. */
  holdSince: number;
  /** Timestamp of the last update, used to scale the hold's fall. */
  at: number;
};

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<(level: InputLevel) => void>>();

/** OBS reports levels as multipliers; the meter is drawn in dB. */
function mulToDb(mul: number): number {
  if (!(mul > 0)) return METER_MIN_DB;
  return Math.max(METER_MIN_DB, 20 * Math.log10(mul));
}

function nextHold(
  previous: Entry | undefined,
  peakDb: number,
  now: number,
): { holdDb: number; holdSince: number } {
  if (!previous || peakDb >= previous.level.holdDb) return { holdDb: peakDb, holdSince: now };
  if (now - previous.holdSince < HOLD_MS) {
    return { holdDb: previous.level.holdDb, holdSince: previous.holdSince };
  }
  const fallen = previous.level.holdDb - (HOLD_FALL_DB_PER_SEC * (now - previous.at)) / 1000;
  // Once the fall catches up with the live peak, the next update re-pins it.
  return { holdDb: Math.max(peakDb, fallen), holdSince: previous.holdSince };
}

function emit(inputName: string, db: number, peakDb: number, now: number): void {
  const previous = entries.get(inputName);
  const { holdDb, holdSince } = nextHold(previous, peakDb, now);
  const level: InputLevel = { db, peakDb, holdDb };
  entries.set(inputName, { level, holdSince, at: now });
  listeners.get(inputName)?.forEach((listener) => listener(level));
}

/** Feeds one `InputVolumeMeters` payload to the meters that are on screen. */
export function publishInputLevels(inputs: unknown): void {
  if (!Array.isArray(inputs)) return;
  const now = Date.now();

  for (const raw of inputs) {
    const input = raw as { inputName?: unknown; inputLevelsMul?: unknown };
    if (typeof input?.inputName !== 'string') continue;

    // A muted or inactive input reports an empty channel list, which reads as
    // silence — that is what makes the bar drop when OBS mutes the mic.
    const channels = Array.isArray(input.inputLevelsMul) ? input.inputLevelsMul : [];
    let magnitude = 0;
    let peak = 0;
    for (const channel of channels) {
      if (!Array.isArray(channel)) continue;
      magnitude = Math.max(magnitude, Number(channel[0]) || 0);
      peak = Math.max(peak, Number(channel[1]) || 0);
    }

    emit(input.inputName, mulToDb(magnitude), mulToDb(peak), now);
  }
}

/** Drops every bar to silence — OBS has stopped talking to us. */
export function clearInputLevels(): void {
  const now = Date.now();
  entries.forEach((_, inputName) => {
    entries.set(inputName, { level: SILENT, holdSince: now, at: now });
    listeners.get(inputName)?.forEach((listener) => listener(SILENT));
  });
}

export function getInputLevel(inputName: string): InputLevel {
  return entries.get(inputName)?.level ?? SILENT;
}

let demandActive = false;
let demandListener: ((wanted: boolean) => void) | null = null;
let subscriberCount = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function setDemand(wanted: boolean): void {
  if (wanted === demandActive) return;
  demandActive = wanted;
  demandListener?.(wanted);
}

/**
 * Called by the OBS store so the socket can add or drop the high-volume meter
 * subscription as meters come and go from the screen.
 */
export function setMeterDemandListener(listener: (wanted: boolean) => void): void {
  demandListener = listener;
}

/** True while something on screen is drawing a meter. */
export function meterEventsWanted(): boolean {
  return demandActive;
}

export function subscribeInputLevel(
  inputName: string,
  listener: (level: InputLevel) => void,
): () => void {
  let set = listeners.get(inputName);
  if (!set) {
    set = new Set();
    listeners.set(inputName, set);
  }
  set.add(listener);

  subscriberCount += 1;
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  setDemand(true);

  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(inputName);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount > 0 || releaseTimer) return;
    // Meters unmount and remount back to back on a re-render; waiting a moment
    // keeps that from resubscribing on the socket twice.
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      if (subscriberCount === 0) setDemand(false);
    }, RELEASE_DELAY_MS);
  };
}
