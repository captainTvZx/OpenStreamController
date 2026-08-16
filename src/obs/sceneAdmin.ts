import { obs } from './obsStore';
import type { Scene } from './types';

/**
 * Scene and transition management requests, kept in one place so the exact
 * obs-websocket request shapes are not scattered through the UI.
 */

export async function createScene(sceneName: string): Promise<void> {
  await obs.call('CreateScene', { sceneName });
}

export async function removeScene(scene: Scene): Promise<void> {
  await obs.call('RemoveScene', { sceneName: scene.sceneName });
}

export async function renameScene(scene: Scene, newName: string): Promise<void> {
  // obs-websocket changed this request when scene UUIDs arrived in OBS 30:
  // newer builds identify the scene by `sceneUuid` and take the new name in
  // `sceneName`, older ones use `sceneName` + `newSceneName`. Older OBS does
  // not report a UUID at all, so its absence picks the legacy shape.
  if (scene.sceneUuid) {
    try {
      await obs.call('SetSceneName', { sceneUuid: scene.sceneUuid, sceneName: newName });
      return;
    } catch {
      /* fall through and try the older field names */
    }
  }
  await obs.call('SetSceneName', { sceneName: scene.sceneName, newSceneName: newName });
}

/** Duration of the active transition, in milliseconds. */
export async function setTransitionDuration(milliseconds: number): Promise<void> {
  await obs.call('SetCurrentSceneTransitionDuration', {
    transitionDuration: Math.round(milliseconds),
  });
}

export type SceneTransitionOverride = {
  transitionName: string | null;
  transitionDuration: number | null;
};

export async function getSceneTransitionOverride(sceneName: string): Promise<SceneTransitionOverride> {
  const response = await obs.call('GetSceneSceneTransitionOverride', { sceneName });
  return {
    transitionName: (response.transitionName as string | null) ?? null,
    transitionDuration: (response.transitionDuration as number | null) ?? null,
  };
}

/**
 * Per-scene transition override. Passing nulls clears the override so the scene
 * falls back to the global transition again.
 */
export async function setSceneTransitionOverride(
  sceneName: string,
  override: SceneTransitionOverride,
): Promise<void> {
  await obs.call('SetSceneSceneTransitionOverride', {
    sceneName,
    transitionName: override.transitionName,
    transitionDuration: override.transitionDuration,
  });
}
