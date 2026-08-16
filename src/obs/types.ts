export type Scene = {
  sceneName: string;
  sceneUuid?: string;
  sceneIndex: number;
};

export type AudioInput = {
  inputName: string;
  inputKind: string;
  muted: boolean;
  volumeDb: number;
  /** Set for the OBS "special" inputs so the mixer can label them nicely. */
  special?: 'desktop' | 'mic';
};

export type SceneItem = {
  sceneItemId: number;
  /** OBS stacking order: 0 is the bottom layer. */
  sceneItemIndex: number;
  sourceName: string;
  sceneItemEnabled: boolean;
  sceneItemLocked: boolean;
  /** Absent for groups and nested scenes, which are not inputs. */
  inputKind?: string;
  isGroup: boolean;
};

export type OutputState = {
  active: boolean;
  paused?: boolean;
  reconnecting?: boolean;
  timecode: string;
  bytes: number;
  congestion?: number;
  skippedFrames?: number;
  totalFrames?: number;
};

export type ObsStats = {
  cpuUsage: number;
  memoryUsage: number;
  availableDiskSpace: number;
  activeFps: number;
  averageFrameRenderTime: number;
  renderSkippedFrames: number;
  renderTotalFrames: number;
  outputSkippedFrames: number;
  outputTotalFrames: number;
};

export const emptyOutputState = (): OutputState => ({
  active: false,
  paused: false,
  reconnecting: false,
  timecode: '00:00:00',
  bytes: 0,
});
