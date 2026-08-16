import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { obs, useObsStore } from '../../src/obs/obsStore';
import { inputKindLabel } from '../../src/obs/inputKinds';
import { createScene, setTransitionDuration } from '../../src/obs/sceneAdmin';
import type { Scene, SceneItem } from '../../src/obs/types';
import { AddSourceSheet } from '../../src/ui/AddSourceSheet';
import { EmptyState, Pill, PrimaryButton, SectionTitle } from '../../src/ui/components';
import { PromptDialog } from '../../src/ui/PromptDialog';
import { SceneOptionsSheet } from '../../src/ui/SceneOptionsSheet';
import { SourceOptionsSheet } from '../../src/ui/SourceOptionsSheet';
import { StatusBarStrip } from '../../src/ui/StatusBarStrip';
import { DURATION_MAX_MS, DURATION_MIN_MS, DURATION_PRESETS } from '../../src/ui/transitionDurations';
import { useLayout } from '../../src/ui/useLayout';
import { fontSize, theme, tint } from '../../src/ui/theme';

const GAP = theme.space(2);
const PADDING = theme.space(4);

export default function ScenesScreen() {
  const layout = useLayout();
  const phase = useObsStore((state) => state.phase);
  const scenes = useObsStore((state) => state.scenes);
  const programScene = useObsStore((state) => state.currentProgramScene);
  const previewScene = useObsStore((state) => state.currentPreviewScene);
  const studioMode = useObsStore((state) => state.studioMode);
  const transitions = useObsStore((state) => state.transitions);
  const currentTransition = useObsStore((state) => state.currentTransition);
  const sceneItems = useObsStore((state) => state.sceneItems);

  const transitionDuration = useObsStore((state) => state.transitionDuration);
  const transitionFixed = useObsStore((state) => state.transitionFixed);

  const connected = phase === 'connected';
  const [refreshing, setRefreshing] = useState(false);
  const [addingScene, setAddingScene] = useState(false);
  const [sceneOptions, setSceneOptions] = useState<Scene | null>(null);
  const [sourceOptions, setSourceOptions] = useState<SceneItem | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  /** Local echo while dragging, before OBS confirms the new duration. */
  const [draggedDuration, setDraggedDuration] = useState<number | null>(null);

  // Scene and source rows tile across the width instead of stretching on tablets.
  const contentWidth = Math.min(layout.width, layout.contentMaxWidth) - PADDING * 2;
  const itemWidth =
    layout.listColumns === 1
      ? '100%'
      : (contentWidth - GAP * (layout.listColumns - 1)) / layout.listColumns;

  // In studio mode the source list follows preview; otherwise it follows program.
  const inspectedScene = studioMode ? previewScene : programScene;
  const items = useMemo(
    () => (inspectedScene ? sceneItems[inspectedScene] ?? [] : []),
    [inspectedScene, sceneItems],
  );

  useEffect(() => {
    if (!connected || !inspectedScene) return;
    useObsStore.getState().loadSceneItems(inspectedScene).catch(() => undefined);
  }, [connected, inspectedScene]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await useObsStore.getState().refreshAll();
      if (inspectedScene) await useObsStore.getState().loadSceneItems(inspectedScene);
    } catch {
      /* ignored — the status strip already reflects connection problems */
    } finally {
      setRefreshing(false);
    }
  };

  const switchScene = (sceneName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    const requestType = studioMode ? 'SetCurrentPreviewScene' : 'SetCurrentProgramScene';
    obs.call(requestType, { sceneName }).catch((error: Error) => Alert.alert('OBS', error.message));
  };

  const openSceneOptions = (scene: Scene) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setSceneOptions(scene);
  };

  const applyDuration = (milliseconds: number) => {
    setDraggedDuration(milliseconds);
    setTransitionDuration(milliseconds)
      .catch((error: Error) => Alert.alert('OBS', error.message))
      .finally(() => setDraggedDuration(null));
  };

  const toggleItem = (sceneItemId: number, enabled: boolean) => {
    if (!inspectedScene) return;
    Haptics.selectionAsync().catch(() => undefined);
    obs
      .call('SetSceneItemEnabled', {
        sceneName: inspectedScene,
        sceneItemId,
        sceneItemEnabled: !enabled,
      })
      .catch((error: Error) => Alert.alert('OBS', error.message));
  };

  if (!connected) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <StatusBarStrip />
        <EmptyState
          icon="cloud-offline-outline"
          title="No OBS connection"
          description="Scenes appear here once the app is connected to a computer running OBS."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBarStrip />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: layout.contentMaxWidth }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.color.textMuted} />
        }
      >
        <View style={styles.studioRow}>
          <Pressable
            onPress={() =>
              obs
                .call('SetStudioModeEnabled', { studioModeEnabled: !studioMode })
                .catch((error: Error) => Alert.alert('OBS', error.message))
            }
            style={[
              styles.studioToggle,
              studioMode && { borderColor: theme.color.accent, backgroundColor: tint(theme.color.accent, 0.15) },
            ]}
          >
            <Ionicons
              name="browsers-outline"
              size={16}
              color={studioMode ? theme.color.accent : theme.color.textMuted}
            />
            <Text style={[styles.studioText, studioMode && { color: theme.color.text }]}>Studio mode</Text>
          </Pressable>

          {studioMode ? (
            <PrimaryButton
              label="Transition"
              icon="swap-horizontal"
              style={{ flex: 1 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
                obs.call('TriggerStudioModeTransition').catch((error: Error) => Alert.alert('OBS', error.message));
              }}
            />
          ) : null}
        </View>

        <SectionTitle
          action={
            <PrimaryButton
              label="Add scene"
              icon="add"
              variant="ghost"
              style={{ paddingVertical: theme.space(1.5), paddingHorizontal: theme.space(3) }}
              onPress={() => setAddingScene(true)}
            />
          }
        >
          {studioMode ? 'Preview / Program' : 'Scenes'}
        </SectionTitle>
        <Text style={styles.hint}>Long-press a scene to rename it, delete it or give it its own transition.</Text>
        <View style={styles.grid}>
          {scenes.map((scene) => {
          const isProgram = scene.sceneName === programScene;
          const isPreview = studioMode && scene.sceneName === previewScene;
          const highlight = isProgram ? theme.color.live : isPreview ? theme.color.good : theme.color.border;

          return (
            <Pressable
              key={scene.sceneUuid ?? scene.sceneName}
              onPress={() => switchScene(scene.sceneName)}
              onLongPress={() => openSceneOptions(scene)}
              delayLongPress={350}
              style={({ pressed }) => [
                styles.sceneRow,
                {
                  width: itemWidth,
                  borderColor: highlight,
                  backgroundColor:
                    isProgram || isPreview ? tint(highlight, 0.12) : theme.color.surface,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={styles.sceneName} numberOfLines={1}>
                {scene.sceneName}
              </Text>
              {isProgram ? <Pill label="LIVE" color={theme.color.live} filled /> : null}
              {isPreview ? <Pill label="PREVIEW" color={theme.color.good} filled /> : null}
              <Pressable onPress={() => openSceneOptions(scene)} hitSlop={10} style={styles.sceneMenuButton}>
                <Ionicons name="ellipsis-horizontal" size={18} color={theme.color.textMuted} />
              </Pressable>
            </Pressable>
          );
          })}
        </View>

        {transitions.length > 0 ? (
          <>
            <SectionTitle>Transition</SectionTitle>
            <View style={styles.chipWrap}>
              {transitions.map((name) => {
                const selected = name === currentTransition;
                return (
                  <Pressable
                    key={name}
                    onPress={() =>
                      obs
                        .call('SetCurrentSceneTransition', { transitionName: name })
                        .catch((error: Error) => Alert.alert('OBS', error.message))
                    }
                    style={[
                      styles.chip,
                      selected && {
                        borderColor: theme.color.accent,
                        backgroundColor: tint(theme.color.accent, 0.15),
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, selected && { color: theme.color.text }]}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>

            {transitionFixed ? (
              <Text style={styles.hint}>“{currentTransition}” has a fixed duration.</Text>
            ) : (
              <View style={styles.durationBlock}>
                <View style={styles.durationHeader}>
                  <Text style={styles.durationLabel}>Duration</Text>
                  <Text style={styles.durationValue}>
                    {Math.round(draggedDuration ?? transitionDuration)} ms
                  </Text>
                </View>
                <Slider
                  minimumValue={DURATION_MIN_MS}
                  maximumValue={DURATION_MAX_MS}
                  step={50}
                  value={transitionDuration}
                  minimumTrackTintColor={theme.color.accent}
                  maximumTrackTintColor={theme.color.border}
                  thumbTintColor={theme.color.accent}
                  onValueChange={setDraggedDuration}
                  onSlidingComplete={applyDuration}
                />
                <View style={styles.chipWrap}>
                  {DURATION_PRESETS.map((preset) => {
                    const selected = Math.round(transitionDuration) === preset;
                    return (
                      <Pressable
                        key={preset}
                        onPress={() => applyDuration(preset)}
                        style={[
                          styles.chip,
                          selected && {
                            borderColor: theme.color.accent,
                            backgroundColor: tint(theme.color.accent, 0.15),
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, selected && { color: theme.color.text }]}>
                          {preset} ms
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        ) : null}

        {inspectedScene ? (
          <>
            <SectionTitle
              action={
                <PrimaryButton
                  label="Add source"
                  icon="add"
                  variant="ghost"
                  style={{ paddingVertical: theme.space(1.5), paddingHorizontal: theme.space(3) }}
                  onPress={() => setAddingSource(true)}
                />
              }
            >
              Sources · {inspectedScene}
            </SectionTitle>
            {items.length === 0 ? (
              <Text style={styles.hint}>
                This scene has no sources yet. Add one with the button above.
              </Text>
            ) : (
              <View style={styles.grid}>
              {items.map((item) => (
                <Pressable
                  key={item.sceneItemId}
                  onPress={() => toggleItem(item.sceneItemId, item.sceneItemEnabled)}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                    setSourceOptions(item);
                  }}
                  delayLongPress={350}
                  style={({ pressed }) => [styles.sourceRow, { width: itemWidth }, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons
                    name={item.sceneItemEnabled ? 'eye' : 'eye-off'}
                    size={18}
                    color={item.sceneItemEnabled ? theme.color.good : theme.color.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.sourceName,
                        !item.sceneItemEnabled && { color: theme.color.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {item.sourceName}
                    </Text>
                    <Text style={styles.sourceKind} numberOfLines={1}>
                      {inputKindLabel(item.inputKind ?? (item.isGroup ? 'group' : undefined))}
                    </Text>
                  </View>
                  {item.sceneItemLocked ? (
                    <Ionicons name="lock-closed" size={14} color={theme.color.warn} />
                  ) : null}
                  <Pressable onPress={() => setSourceOptions(item)} hitSlop={10} style={styles.sceneMenuButton}>
                    <Ionicons name="ellipsis-horizontal" size={18} color={theme.color.textMuted} />
                  </Pressable>
                </Pressable>
              ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      <PromptDialog
        visible={addingScene}
        title="New scene"
        description="Creates an empty scene in OBS. Add sources to it from OBS itself."
        placeholder="Scene name"
        initialValue={`Scene ${scenes.length + 1}`}
        confirmLabel="Create"
        onCancel={() => setAddingScene(false)}
        onSubmit={(value) => {
          setAddingScene(false);
          createScene(value).catch((error: Error) => Alert.alert('Could not create scene', error.message));
        }}
      />

      <SceneOptionsSheet scene={sceneOptions} onClose={() => setSceneOptions(null)} />

      {inspectedScene ? (
        <>
          <AddSourceSheet
            sceneName={inspectedScene}
            visible={addingSource}
            onClose={() => setAddingSource(false)}
          />
          <SourceOptionsSheet
            sceneName={inspectedScene}
            item={sourceOptions}
            itemCount={items.length}
            onClose={() => setSourceOptions(null)}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.background },
  content: {
    padding: PADDING,
    paddingBottom: theme.space(10),
    width: '100%',
    alignSelf: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  studioRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2), marginTop: theme.space(2) },
  studioToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(3),
  },
  studioText: { color: theme.color.textMuted, fontSize: fontSize.sm, fontWeight: '700' },
  sceneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(4),
  },
  sceneName: { flex: 1, color: theme.color.text, fontSize: fontSize.md, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  chip: {
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(2),
  },
  chipText: { color: theme.color.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  sceneMenuButton: { paddingLeft: theme.space(2) },
  durationBlock: { marginTop: theme.space(4), gap: theme.space(2) },
  durationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  durationLabel: { color: theme.color.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  durationValue: {
    color: theme.color.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(3),
  },
  sourceName: { color: theme.color.text, fontSize: fontSize.md, fontWeight: '600' },
  sourceKind: { color: theme.color.textMuted, fontSize: fontSize.xs, marginTop: 1 },
  hint: { color: theme.color.textMuted, fontSize: fontSize.sm },
});
