import { obs } from './obsStore';
import type { SceneItem } from './types';

/**
 * Source (input) and scene-item management. Scene items are the *placements* of
 * a source inside a scene; the source itself can live in several scenes at once,
 * which is why removing from a scene and deleting outright are separate calls.
 */

export type InputSummary = {
  inputName: string;
  inputKind: string;
};

export type SourceFilter = {
  filterName: string;
  filterKind: string;
  filterEnabled: boolean;
  filterIndex: number;
};

export async function listInputs(): Promise<InputSummary[]> {
  const response = await obs.call('GetInputList');
  return ((response.inputs ?? []) as any[]).map((input) => ({
    inputName: input.inputName as string,
    inputKind: input.inputKind as string,
  }));
}

/** Source kinds this OBS build can create, e.g. `browser_source`. */
export async function listInputKinds(): Promise<string[]> {
  const response = await obs.call('GetInputKindList');
  return (response.inputKinds ?? []) as string[];
}

export async function createInput(
  sceneName: string,
  inputKind: string,
  inputName: string,
): Promise<void> {
  await obs.call('CreateInput', { sceneName, inputKind, inputName, sceneItemEnabled: true });
}

/** Places an existing source into another scene. */
export async function addExistingSource(sceneName: string, sourceName: string): Promise<void> {
  await obs.call('CreateSceneItem', { sceneName, sourceName });
}

/** Takes the source out of this scene, leaving it available elsewhere. */
export async function removeSceneItem(sceneName: string, sceneItemId: number): Promise<void> {
  await obs.call('RemoveSceneItem', { sceneName, sceneItemId });
}

/** Deletes the source itself, removing it from every scene that used it. */
export async function removeInput(inputName: string): Promise<void> {
  await obs.call('RemoveInput', { inputName });
}

export async function setSceneItemLocked(
  sceneName: string,
  sceneItemId: number,
  sceneItemLocked: boolean,
): Promise<void> {
  await obs.call('SetSceneItemLocked', { sceneName, sceneItemId, sceneItemLocked });
}

/**
 * Moves a scene item one step through the stack. `direction` is in screen terms:
 * "up" means closer to the viewer, which is a *higher* index in OBS.
 */
export async function moveSceneItem(
  sceneName: string,
  item: SceneItem,
  direction: 'up' | 'down',
  itemCount: number,
): Promise<void> {
  const target = direction === 'up' ? item.sceneItemIndex + 1 : item.sceneItemIndex - 1;
  const clamped = Math.max(0, Math.min(itemCount - 1, target));
  if (clamped === item.sceneItemIndex) return;
  await obs.call('SetSceneItemIndex', {
    sceneName,
    sceneItemId: item.sceneItemId,
    sceneItemIndex: clamped,
  });
}

export async function getInputSettings(
  inputName: string,
): Promise<{ inputKind: string; inputSettings: Record<string, any> }> {
  const response = await obs.call('GetInputSettings', { inputName });
  return {
    inputKind: response.inputKind as string,
    inputSettings: (response.inputSettings ?? {}) as Record<string, any>,
  };
}

/**
 * Patches settings. `overlay: true` merges with what OBS already has, so a
 * single changed field never wipes the rest of the source's configuration.
 */
export async function patchInputSettings(
  inputName: string,
  inputSettings: Record<string, unknown>,
): Promise<void> {
  await obs.call('SetInputSettings', { inputName, inputSettings, overlay: true });
}

export async function listFilters(sourceName: string): Promise<SourceFilter[]> {
  const response = await obs.call('GetSourceFilterList', { sourceName });
  return ((response.filters ?? []) as any[]).map((filter) => ({
    filterName: filter.filterName as string,
    filterKind: filter.filterKind as string,
    filterEnabled: Boolean(filter.filterEnabled),
    filterIndex: filter.filterIndex as number,
  }));
}

export async function setFilterEnabled(
  sourceName: string,
  filterName: string,
  filterEnabled: boolean,
): Promise<void> {
  await obs.call('SetSourceFilterEnabled', { sourceName, filterName, filterEnabled });
}

/** Returns a data URI ready for an <Image source={{ uri }} />, or null. */
export async function getSourceThumbnail(sourceName: string, width = 480): Promise<string | null> {
  try {
    const response = await obs.call('GetSourceScreenshot', {
      sourceName,
      imageFormat: 'jpg',
      imageWidth: Math.max(8, Math.min(4096, Math.round(width))),
      imageCompressionQuality: 60,
    });
    const data = response.imageData as string | undefined;
    if (!data) return null;
    // Newer OBS already hands back a full data URI; older builds send raw base64.
    return data.startsWith('data:') ? data : `data:image/jpg;base64,${data}`;
  } catch {
    // Audio-only and some capture sources cannot be screenshotted.
    return null;
  }
}
