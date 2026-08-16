import { obs } from '../obs/obsStore';
import type { ObsWebSocket } from '../obs/ObsWebSocket';

/** Everything a deck button can be bound to. */
export type DeckAction =
  | { type: 'scene'; sceneName: string }
  | { type: 'previewScene'; sceneName: string }
  | { type: 'studioTransition' }
  | { type: 'toggleStudioMode' }
  | { type: 'toggleStream' }
  | { type: 'toggleRecord' }
  | { type: 'pauseRecord' }
  | { type: 'toggleVirtualCam' }
  | { type: 'toggleReplayBuffer' }
  | { type: 'saveReplay' }
  | { type: 'toggleMute'; inputName: string }
  | { type: 'toggleSource'; sceneName: string; sourceName: string }
  | { type: 'setTransition'; transitionName: string }
  | { type: 'setTransitionDuration'; durationMs: number }
  | { type: 'setProfile'; profileName: string }
  | { type: 'setSceneCollection'; collectionName: string }
  | { type: 'refreshBrowser'; inputName: string }
  | { type: 'raw'; requestType: string; requestDataJson?: string };

export type ActionType = DeckAction['type'];

/** What the action editor needs to know to build each action type. */
export type ActionTarget =
  | 'none'
  | 'scene'
  | 'input'
  | 'sceneSource'
  | 'transition'
  | 'duration'
  | 'profile'
  | 'sceneCollection'
  | 'raw';

type ActionMeta = {
  type: ActionType;
  title: string;
  group: 'Scenes' | 'Broadcast' | 'Audio' | 'Sources' | 'Advanced';
  target: ActionTarget;
  icon: string;
  color: string;
};

export const ACTION_CATALOG: ActionMeta[] = [
  { type: 'scene', title: 'Switch scene', group: 'Scenes', target: 'scene', icon: 'albums', color: '#4C8DFF' },
  { type: 'previewScene', title: 'Set preview scene', group: 'Scenes', target: 'scene', icon: 'eye', color: '#7C5CFF' },
  { type: 'studioTransition', title: 'Transition (studio)', group: 'Scenes', target: 'none', icon: 'swap-horizontal', color: '#7C5CFF' },
  { type: 'toggleStudioMode', title: 'Toggle studio mode', group: 'Scenes', target: 'none', icon: 'browsers', color: '#7C5CFF' },
  { type: 'setTransition', title: 'Set transition', group: 'Scenes', target: 'transition', icon: 'git-compare', color: '#7C5CFF' },
  { type: 'setTransitionDuration', title: 'Set transition duration', group: 'Scenes', target: 'duration', icon: 'timer', color: '#7C5CFF' },

  { type: 'toggleStream', title: 'Start / stop stream', group: 'Broadcast', target: 'none', icon: 'radio', color: '#FF4757' },
  { type: 'toggleRecord', title: 'Start / stop recording', group: 'Broadcast', target: 'none', icon: 'recording', color: '#FF6B35' },
  { type: 'pauseRecord', title: 'Pause / resume recording', group: 'Broadcast', target: 'none', icon: 'pause', color: '#FF6B35' },
  { type: 'toggleVirtualCam', title: 'Toggle virtual camera', group: 'Broadcast', target: 'none', icon: 'videocam', color: '#2ED573' },
  { type: 'toggleReplayBuffer', title: 'Toggle replay buffer', group: 'Broadcast', target: 'none', icon: 'layers', color: '#2ED573' },
  { type: 'saveReplay', title: 'Save replay', group: 'Broadcast', target: 'none', icon: 'save', color: '#2ED573' },

  { type: 'toggleMute', title: 'Mute / unmute source', group: 'Audio', target: 'input', icon: 'mic', color: '#FFC048' },

  { type: 'toggleSource', title: 'Show / hide source', group: 'Sources', target: 'sceneSource', icon: 'eye-off', color: '#00B8D9' },
  { type: 'refreshBrowser', title: 'Refresh browser source', group: 'Sources', target: 'input', icon: 'refresh', color: '#00B8D9' },

  { type: 'setProfile', title: 'Switch profile', group: 'Advanced', target: 'profile', icon: 'person', color: '#8B93A5' },
  { type: 'setSceneCollection', title: 'Switch scene collection', group: 'Advanced', target: 'sceneCollection', icon: 'file-tray-full', color: '#8B93A5' },
  { type: 'raw', title: 'Custom OBS request', group: 'Advanced', target: 'raw', icon: 'code-slash', color: '#8B93A5' },
];

export const actionMeta = (type: ActionType): ActionMeta =>
  ACTION_CATALOG.find((entry) => entry.type === type) ?? ACTION_CATALOG[0];

export const BUTTON_COLORS = [
  '#4C8DFF',
  '#7C5CFF',
  '#FF4757',
  '#FF6B35',
  '#FFC048',
  '#2ED573',
  '#00B8D9',
  '#8B93A5',
];

/** Label/icon/color a button gets when it is first created. */
export function defaultVisualsFor(action: DeckAction): { label: string; icon: string; color: string } {
  const meta = actionMeta(action.type);
  const base = { icon: meta.icon, color: meta.color };

  switch (action.type) {
    case 'scene':
    case 'previewScene':
      return { ...base, label: action.sceneName };
    case 'toggleMute':
    case 'refreshBrowser':
      return { ...base, label: action.inputName };
    case 'toggleSource':
      return { ...base, label: action.sourceName };
    case 'setTransition':
      return { ...base, label: action.transitionName };
    case 'setTransitionDuration':
      return { ...base, label: `${action.durationMs} ms` };
    case 'setProfile':
      return { ...base, label: action.profileName };
    case 'setSceneCollection':
      return { ...base, label: action.collectionName };
    case 'raw':
      return { ...base, label: action.requestType || 'Custom' };
    case 'toggleStream':
      return { ...base, label: 'Stream' };
    case 'toggleRecord':
      return { ...base, label: 'Record' };
    case 'pauseRecord':
      return { ...base, label: 'Pause' };
    case 'toggleVirtualCam':
      return { ...base, label: 'Virtual cam' };
    case 'toggleReplayBuffer':
      return { ...base, label: 'Replay buffer' };
    case 'saveReplay':
      return { ...base, label: 'Save replay' };
    case 'studioTransition':
      return { ...base, label: 'Transition' };
    case 'toggleStudioMode':
      return { ...base, label: 'Studio mode' };
    default:
      return { ...base, label: meta.title };
  }
}

/** One-line description shown under the button in the editor. */
export function describeAction(action: DeckAction): string {
  const meta = actionMeta(action.type);
  switch (action.type) {
    case 'scene':
    case 'previewScene':
      return `${meta.title} · ${action.sceneName}`;
    case 'toggleMute':
    case 'refreshBrowser':
      return `${meta.title} · ${action.inputName}`;
    case 'toggleSource':
      return `${meta.title} · ${action.sourceName} (${action.sceneName})`;
    case 'setTransition':
      return `${meta.title} · ${action.transitionName}`;
    case 'setTransitionDuration':
      return `${meta.title} · ${action.durationMs} ms`;
    case 'setProfile':
      return `${meta.title} · ${action.profileName}`;
    case 'setSceneCollection':
      return `${meta.title} · ${action.collectionName}`;
    case 'raw':
      return `${meta.title} · ${action.requestType}`;
    default:
      return meta.title;
  }
}

type ObsSnapshot = {
  currentProgramScene?: string;
  currentPreviewScene?: string;
  studioMode: boolean;
  stream: { active: boolean; timecode: string };
  record: { active: boolean; paused?: boolean; timecode: string };
  virtualCam: boolean;
  replayBuffer: boolean;
  audioInputs: { inputName: string; muted: boolean; volumeDb: number }[];
  sceneItems: Record<string, { sourceName: string; sceneItemEnabled: boolean }[]>;
  currentTransition?: string;
  transitionDuration: number;
  currentProfile?: string;
  currentSceneCollection?: string;
};

/**
 * Whether the button should render lit up. `undefined` means the action has no
 * on/off state (a one-shot like "save replay").
 */
export function isActionActive(action: DeckAction, state: ObsSnapshot): boolean | undefined {
  switch (action.type) {
    case 'scene':
      return state.currentProgramScene === action.sceneName;
    case 'previewScene':
      return state.currentPreviewScene === action.sceneName;
    case 'toggleStudioMode':
      return state.studioMode;
    case 'toggleStream':
      return state.stream.active;
    case 'toggleRecord':
      return state.record.active;
    case 'pauseRecord':
      return Boolean(state.record.paused);
    case 'toggleVirtualCam':
      return state.virtualCam;
    case 'toggleReplayBuffer':
      return state.replayBuffer;
    case 'toggleMute':
      // "Active" means muted, matching the red-when-muted convention in OBS.
      return state.audioInputs.find((input) => input.inputName === action.inputName)?.muted;
    case 'toggleSource': {
      const item = state.sceneItems[action.sceneName]?.find(
        (candidate) => candidate.sourceName === action.sourceName,
      );
      return item ? item.sceneItemEnabled : undefined;
    }
    case 'setTransition':
      return state.currentTransition === action.transitionName;
    case 'setTransitionDuration':
      return Math.round(state.transitionDuration) === Math.round(action.durationMs);
    case 'setProfile':
      return state.currentProfile === action.profileName;
    case 'setSceneCollection':
      return state.currentSceneCollection === action.collectionName;
    default:
      return undefined;
  }
}

/**
 * Live detail shown under a button's label — a running timecode, a fader
 * position. Returns undefined when the action has nothing to report.
 */
export function subtitleFor(action: DeckAction, state: ObsSnapshot): string | undefined {
  switch (action.type) {
    case 'toggleStream':
      return state.stream.active ? state.stream.timecode : undefined;
    case 'toggleRecord':
      if (!state.record.active) return undefined;
      return state.record.paused ? 'Paused' : state.record.timecode;
    case 'pauseRecord':
      if (!state.record.active) return undefined;
      return state.record.paused ? 'Paused' : 'Recording';
    case 'toggleMute': {
      const input = state.audioInputs.find((candidate) => candidate.inputName === action.inputName);
      if (!input) return undefined;
      if (input.muted) return 'Muted';
      return input.volumeDb <= -60 ? '-inf dB' : `${input.volumeDb.toFixed(1)} dB`;
    }
    case 'setTransitionDuration':
      return `${action.durationMs} ms`;
    default:
      return undefined;
  }
}

/** Executes the action against OBS. Rejects with a message worth showing. */
export async function runAction(action: DeckAction, client: ObsWebSocket = obs): Promise<void> {
  switch (action.type) {
    case 'scene':
      await client.call('SetCurrentProgramScene', { sceneName: action.sceneName });
      return;
    case 'previewScene':
      await client.call('SetCurrentPreviewScene', { sceneName: action.sceneName });
      return;
    case 'studioTransition':
      await client.call('TriggerStudioModeTransition');
      return;
    case 'toggleStudioMode': {
      const current = await client.call('GetStudioModeEnabled');
      await client.call('SetStudioModeEnabled', { studioModeEnabled: !current.studioModeEnabled });
      return;
    }
    case 'toggleStream':
      await client.call('ToggleStream');
      return;
    case 'toggleRecord':
      await client.call('ToggleRecord');
      return;
    case 'pauseRecord':
      await client.call('ToggleRecordPause');
      return;
    case 'toggleVirtualCam':
      await client.call('ToggleVirtualCam');
      return;
    case 'toggleReplayBuffer':
      await client.call('ToggleReplayBuffer');
      return;
    case 'saveReplay':
      await client.call('SaveReplayBuffer');
      return;
    case 'toggleMute':
      await client.call('ToggleInputMute', { inputName: action.inputName });
      return;
    case 'toggleSource': {
      const { sceneItemId } = await client.call('GetSceneItemId', {
        sceneName: action.sceneName,
        sourceName: action.sourceName,
      });
      const { sceneItemEnabled } = await client.call('GetSceneItemEnabled', {
        sceneName: action.sceneName,
        sceneItemId,
      });
      await client.call('SetSceneItemEnabled', {
        sceneName: action.sceneName,
        sceneItemId,
        sceneItemEnabled: !sceneItemEnabled,
      });
      return;
    }
    case 'setTransition':
      await client.call('SetCurrentSceneTransition', { transitionName: action.transitionName });
      return;
    case 'setTransitionDuration':
      await client.call('SetCurrentSceneTransitionDuration', {
        transitionDuration: Math.round(action.durationMs),
      });
      return;
    case 'setProfile':
      await client.call('SetCurrentProfile', { profileName: action.profileName });
      return;
    case 'setSceneCollection':
      await client.call('SetCurrentSceneCollection', { sceneCollectionName: action.collectionName });
      return;
    case 'refreshBrowser':
      await client.call('PressInputPropertiesButton', {
        inputName: action.inputName,
        propertyName: 'refreshnocache',
      });
      return;
    case 'raw': {
      let requestData: Record<string, unknown> | undefined;
      if (action.requestDataJson?.trim()) {
        try {
          requestData = JSON.parse(action.requestDataJson);
        } catch {
          throw new Error('Request data is not valid JSON.');
        }
      }
      await client.call(action.requestType, requestData);
      return;
    }
    default:
      throw new Error('Unknown action.');
  }
}
