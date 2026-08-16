import { create } from 'zustand';

import {
  clearInputLevels,
  meterEventsWanted,
  publishInputLevels,
  setMeterDemandListener,
} from './audioLevels';
import { ObsWebSocket } from './ObsWebSocket';
import { EventSubscription } from './protocol';
import { AudioInput, emptyOutputState, ObsStats, OutputState, Scene, SceneItem } from './types';
import { SavedConnection, connectionUrl, useConnectionStore } from '../store/connections';

export type ConnectionPhase = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

const AUDIO_KINDS = new Set([
  'wasapi_input_capture',
  'wasapi_output_capture',
  'wasapi_process_output_capture',
  'coreaudio_input_capture',
  'coreaudio_output_capture',
  'pulse_input_capture',
  'pulse_output_capture',
  'alsa_input_capture',
  'jack_output_capture',
  'audio_line',
  'sndio_output_capture',
  'browser_source',
  'ffmpeg_source',
  'vlc_source',
]);

/** Reconnect backoff in ms; the last value repeats. */
const BACKOFF = [1000, 2000, 4000, 8000, 15000];
const POLL_INTERVAL_MS = 1000;

export const obs = new ObsWebSocket();

/**
 * Volume meters are a high-volume subscription OBS does not include in `All`,
 * so it is only asked for while meters are actually on screen.
 */
function subscriptionMask(): number {
  return EventSubscription.All | (meterEventsWanted() ? EventSubscription.InputVolumeMeters : 0);
}

setMeterDemandListener(() => obs.setEventSubscriptions(subscriptionMask()));

type ObsStoreState = {
  phase: ConnectionPhase;
  error?: string;
  activeConnectionId?: string;
  obsVersion?: string;
  reconnectAttempt: number;

  scenes: Scene[];
  currentProgramScene?: string;
  currentPreviewScene?: string;
  studioMode: boolean;

  transitions: string[];
  currentTransition?: string;
  /** Duration of the active transition in ms. */
  transitionDuration: number;
  /** Cut-style transitions have a fixed duration that cannot be set. */
  transitionFixed: boolean;

  profiles: string[];
  currentProfile?: string;
  sceneCollections: string[];
  currentSceneCollection?: string;

  stream: OutputState;
  record: OutputState;
  virtualCam: boolean;
  replayBuffer: boolean;

  audioInputs: AudioInput[];
  sceneItems: Record<string, SceneItem[]>;
  stats?: ObsStats;

  connect: (connection: SavedConnection, password?: string) => Promise<void>;
  connectById: (id: string) => Promise<void>;
  disconnect: () => void;
  refreshAll: () => Promise<void>;
  loadSceneItems: (sceneName: string) => Promise<SceneItem[]>;
};

const initialState = {
  phase: 'idle' as ConnectionPhase,
  error: undefined,
  activeConnectionId: undefined,
  obsVersion: undefined,
  reconnectAttempt: 0,
  scenes: [] as Scene[],
  currentProgramScene: undefined,
  currentPreviewScene: undefined,
  studioMode: false,
  transitions: [] as string[],
  currentTransition: undefined,
  transitionDuration: 300,
  transitionFixed: false,
  profiles: [] as string[],
  currentProfile: undefined,
  sceneCollections: [] as string[],
  currentSceneCollection: undefined,
  stream: emptyOutputState(),
  record: emptyOutputState(),
  virtualCam: false,
  replayBuffer: false,
  audioInputs: [] as AudioInput[],
  sceneItems: {} as Record<string, SceneItem[]>,
  stats: undefined,
};

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollTick = 0;
/** Connection we should keep re-dialing after an unexpected drop. */
let reconnectTarget: { connection: SavedConnection; password?: string } | null = null;

function clearTimers() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export const useObsStore = create<ObsStoreState>((set, get) => ({
  ...initialState,

  async connect(connection, password) {
    clearTimers();
    reconnectTarget = { connection, password };
    set({
      ...initialState,
      phase: 'connecting',
      activeConnectionId: connection.id,
    });

    try {
      await obs.connect(connectionUrl(connection), password, subscriptionMask());
      set({
        phase: 'connected',
        error: undefined,
        reconnectAttempt: 0,
        obsVersion: obs.obsWebSocketVersion,
      });
      useConnectionStore.getState().markUsed(connection.id);
      await get().refreshAll();
      startPolling(set, get);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ phase: 'error', error: message });
      throw error;
    }
  },

  async connectById(id) {
    const connection = useConnectionStore.getState().byId(id);
    if (!connection) throw new Error('Connection not found.');
    const password = await useConnectionStore.getState().getPassword(id);
    await get().connect(connection, password);
  },

  disconnect() {
    clearTimers();
    reconnectTarget = null;
    obs.disconnect();
    clearInputLevels();
    set({ ...initialState });
  },

  async refreshAll() {
    if (!obs.isConnected) return;

    const [sceneList, studio, streamStatus, recordStatus, transitionList] = await Promise.all([
      obs.call('GetSceneList'),
      obs.call('GetStudioModeEnabled').catch(() => ({ studioModeEnabled: false })),
      obs.call('GetStreamStatus'),
      obs.call('GetRecordStatus'),
      obs.call('GetSceneTransitionList').catch(() => ({ transitions: [], currentSceneTransitionName: undefined })),
    ]);

    set({
      scenes: ((sceneList.scenes ?? []) as Scene[]).slice().sort((a, b) => b.sceneIndex - a.sceneIndex),
      currentProgramScene: sceneList.currentProgramSceneName,
      currentPreviewScene: sceneList.currentPreviewSceneName,
      studioMode: Boolean(studio.studioModeEnabled),
      stream: toOutputState(streamStatus),
      record: toOutputState(recordStatus),
      transitions: (transitionList.transitions ?? []).map((t: any) => t.transitionName),
      currentTransition: transitionList.currentSceneTransitionName,
    });

    // These are all optional extras: an older OBS or a missing feature must not
    // take down the whole refresh.
    await Promise.all([
      refreshAudioInputs(set),
      refreshTransitionDetails(set),
      obs
        .call('GetVirtualCamStatus')
        .then((r) => set({ virtualCam: Boolean(r.outputActive) }))
        .catch(() => undefined),
      obs
        .call('GetReplayBufferStatus')
        .then((r) => set({ replayBuffer: Boolean(r.outputActive) }))
        .catch(() => undefined),
      obs
        .call('GetProfileList')
        .then((r) => set({ profiles: r.profiles ?? [], currentProfile: r.currentProfileName }))
        .catch(() => undefined),
      obs
        .call('GetSceneCollectionList')
        .then((r) =>
          set({
            sceneCollections: r.sceneCollections ?? [],
            currentSceneCollection: r.currentSceneCollectionName,
          }),
        )
        .catch(() => undefined),
    ]);
  },

  async loadSceneItems(sceneName) {
    if (!obs.isConnected) return [];
    const response = await obs.call('GetSceneItemList', { sceneName });
    const items = ((response.sceneItems ?? []) as any[])
      .map((item) => ({
        sceneItemId: item.sceneItemId as number,
        sceneItemIndex: item.sceneItemIndex as number,
        sourceName: item.sourceName as string,
        sceneItemEnabled: Boolean(item.sceneItemEnabled),
        sceneItemLocked: Boolean(item.sceneItemLocked),
        inputKind: (item.inputKind as string | undefined) ?? undefined,
        isGroup: Boolean(item.isGroup),
      }))
      .reverse(); // OBS returns bottom-up; the UI shows the source list top-down.
    set((state) => ({ sceneItems: { ...state.sceneItems, [sceneName]: items } }));
    return items;
  },
}));

type SetState = (partial: Partial<ObsStoreState> | ((state: ObsStoreState) => Partial<ObsStoreState>)) => void;

function toOutputState(data: Record<string, any>): OutputState {
  return {
    active: Boolean(data.outputActive),
    paused: Boolean(data.outputPaused),
    reconnecting: Boolean(data.outputReconnecting),
    timecode: (data.outputTimecode ?? '00:00:00').split('.')[0],
    bytes: data.outputBytes ?? 0,
    congestion: data.outputCongestion,
    skippedFrames: data.outputSkippedFrames,
    totalFrames: data.outputTotalFrames,
  };
}

async function refreshAudioInputs(set: SetState): Promise<void> {
  try {
    const [inputList, specials] = await Promise.all([
      obs.call('GetInputList'),
      obs.call('GetSpecialInputs').catch(() => ({} as Record<string, any>)),
    ]);

    const specialByName = new Map<string, 'desktop' | 'mic'>();
    Object.entries(specials).forEach(([key, name]) => {
      if (typeof name !== 'string' || !name) return;
      specialByName.set(name, key.startsWith('desktop') ? 'desktop' : 'mic');
    });

    const candidates = ((inputList.inputs ?? []) as any[]).filter(
      (input) => AUDIO_KINDS.has(input.inputKind) || specialByName.has(input.inputName),
    );

    const inputs: AudioInput[] = [];
    for (const candidate of candidates) {
      // Sources without an audio track reject these calls; that is how we filter
      // browser/media sources that are muted-by-design out of the mixer.
      const [mute, volume] = await Promise.all([
        obs.call('GetInputMute', { inputName: candidate.inputName }).catch(() => null),
        obs.call('GetInputVolume', { inputName: candidate.inputName }).catch(() => null),
      ]);
      if (!mute || !volume) continue;
      inputs.push({
        inputName: candidate.inputName,
        inputKind: candidate.inputKind,
        muted: Boolean(mute.inputMuted),
        volumeDb: Number(volume.inputVolumeDb ?? 0),
        special: specialByName.get(candidate.inputName),
      });
    }

    set({ audioInputs: inputs });
  } catch {
    /* keep the previous mixer contents */
  }
}

/** Duration and whether it is adjustable both change with the transition. */
async function refreshTransitionDetails(set: SetState): Promise<void> {
  try {
    const current = await obs.call('GetCurrentSceneTransition');
    set({
      currentTransition: current.transitionName,
      transitionDuration: Number(current.transitionDuration ?? 300),
      transitionFixed: Boolean(current.transitionFixed),
    });
  } catch {
    /* older OBS builds may not expose it; the UI hides the control */
  }
}

function startPolling(set: SetState, get: () => ObsStoreState) {
  if (pollTimer) clearInterval(pollTimer);
  pollTick = 0;
  pollTimer = setInterval(async () => {
    if (!obs.isConnected) return;
    pollTick += 1;
    const state = get();

    try {
      if (state.stream.active) {
        set({ stream: toOutputState(await obs.call('GetStreamStatus')) });
      }
      if (state.record.active) {
        set({ record: toOutputState(await obs.call('GetRecordStatus')) });
      }
      if (pollTick % 3 === 0) {
        const stats = await obs.call('GetStats');
        set({ stats: stats as unknown as ObsStats });
      }
    } catch {
      /* a dropped socket is handled by the close listener */
    }
  }, POLL_INTERVAL_MS);
}

function scheduleReconnect() {
  const target = reconnectTarget;
  if (!target || !target.connection.autoReconnect) return;

  const attempt = useObsStore.getState().reconnectAttempt;
  const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
  useObsStore.setState({ phase: 'reconnecting', reconnectAttempt: attempt + 1 });

  reconnectTimer = setTimeout(async () => {
    if (!reconnectTarget) return;
    try {
      await obs.connect(
        connectionUrl(reconnectTarget.connection),
        reconnectTarget.password,
        subscriptionMask(),
      );
      useObsStore.setState({
        phase: 'connected',
        error: undefined,
        reconnectAttempt: 0,
        obsVersion: obs.obsWebSocketVersion,
      });
      await useObsStore.getState().refreshAll();
      startPolling(useObsStore.setState as SetState, useObsStore.getState);
    } catch (error) {
      useObsStore.setState({ error: error instanceof Error ? error.message : String(error) });
      scheduleReconnect();
    }
  }, delay);
}

obs.onClose(({ reason, wasIntentional }) => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  // Nothing is feeding the meters any more; leave no bars frozen mid-level.
  clearInputLevels();
  if (wasIntentional) return;
  useObsStore.setState({ phase: 'reconnecting', error: reason ?? 'Connection lost.' });
  scheduleReconnect();
});

obs.onEvent((eventType, data) => {
  // Meters arrive ~20x a second, so they get handled before anything else and
  // stay out of the store entirely.
  if (eventType === 'InputVolumeMeters') {
    publishInputLevels(data.inputs);
    return;
  }

  const set = useObsStore.setState;

  switch (eventType) {
    case 'CurrentProgramSceneChanged':
      set({ currentProgramScene: data.sceneName });
      break;
    case 'CurrentPreviewSceneChanged':
      set({ currentPreviewScene: data.sceneName });
      break;
    case 'SceneListChanged':
      set({
        scenes: ((data.scenes ?? []) as Scene[]).slice().sort((a, b) => b.sceneIndex - a.sceneIndex),
      });
      break;
    case 'SceneNameChanged':
      void useObsStore.getState().refreshAll();
      break;
    case 'StudioModeStateChanged':
      set({ studioMode: Boolean(data.studioModeEnabled) });
      break;
    case 'StreamStateChanged':
      set((state) => ({
        stream: { ...state.stream, active: Boolean(data.outputActive) },
      }));
      break;
    case 'RecordStateChanged':
      set((state) => ({
        record: {
          ...state.record,
          active: Boolean(data.outputActive),
          paused: data.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED',
        },
      }));
      break;
    case 'VirtualcamStateChanged':
      set({ virtualCam: Boolean(data.outputActive) });
      break;
    case 'ReplayBufferStateChanged':
      set({ replayBuffer: Boolean(data.outputActive) });
      break;
    case 'InputMuteStateChanged':
      set((state) => ({
        audioInputs: state.audioInputs.map((input) =>
          input.inputName === data.inputName ? { ...input, muted: Boolean(data.inputMuted) } : input,
        ),
      }));
      break;
    case 'InputVolumeChanged':
      set((state) => ({
        audioInputs: state.audioInputs.map((input) =>
          input.inputName === data.inputName ? { ...input, volumeDb: Number(data.inputVolumeDb) } : input,
        ),
      }));
      break;
    case 'InputNameChanged':
    case 'InputCreated':
    case 'InputRemoved':
      void refreshAudioInputs(useObsStore.setState as SetState);
      break;
    case 'SceneItemEnableStateChanged':
      set((state) => {
        const items = state.sceneItems[data.sceneName];
        if (!items) return {};
        return {
          sceneItems: {
            ...state.sceneItems,
            [data.sceneName]: items.map((item) =>
              item.sceneItemId === data.sceneItemId
                ? { ...item, sceneItemEnabled: Boolean(data.sceneItemEnabled) }
                : item,
            ),
          },
        };
      });
      break;
    case 'CurrentSceneTransitionChanged':
      set({ currentTransition: data.transitionName });
      // A different transition brings its own duration and fixed-ness.
      void refreshTransitionDetails(useObsStore.setState as SetState);
      break;
    case 'CurrentSceneTransitionDurationChanged':
      set({ transitionDuration: Number(data.transitionDuration) });
      break;
    case 'SceneCreated':
    case 'SceneRemoved':
      void useObsStore.getState().refreshAll();
      break;
    case 'CurrentProfileChanged':
      set({ currentProfile: data.profileName });
      break;
    case 'CurrentSceneCollectionChanged':
      void useObsStore.getState().refreshAll();
      break;
    default:
      break;
  }
});
