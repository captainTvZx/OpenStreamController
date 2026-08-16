import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obs, useObsStore } from '../obs/obsStore';
import { inputKindLabel } from '../obs/inputKinds';
import { createScene, setTransitionDuration } from '../obs/sceneAdmin';
import type { Scene, SceneItem } from '../obs/types';
import { AddSourceSheet } from './AddSourceSheet';
import { EmptyState, Pill, PrimaryButton, SectionTitle } from './components';
import { PromptDialog } from './PromptDialog';
import { SceneOptionsSheet } from './SceneOptionsSheet';
import { SourceOptionsSheet } from './SourceOptionsSheet';
import { fontSize, theme, tint } from './theme';
import { DURATION_MAX_MS, DURATION_MIN_MS, DURATION_PRESETS } from './transitionDurations';

/** Compact scene switcher embedded directly below the deck buttons. */
export function ScenesPanel() {
  const phase = useObsStore((state) => state.phase);
  const scenes = useObsStore((state) => state.scenes);
  const programScene = useObsStore((state) => state.currentProgramScene);
  const previewScene = useObsStore((state) => state.currentPreviewScene);
  const studioMode = useObsStore((state) => state.studioMode);
  const transitions = useObsStore((state) => state.transitions);
  const currentTransition = useObsStore((state) => state.currentTransition);
  const transitionDuration = useObsStore((state) => state.transitionDuration);
  const transitionFixed = useObsStore((state) => state.transitionFixed);
  const sceneItems = useObsStore((state) => state.sceneItems);
  const [addingScene, setAddingScene] = useState(false);
  const [sceneOptions, setSceneOptions] = useState<Scene | null>(null);
  const [sourceOptions, setSourceOptions] = useState<SceneItem | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [draggedDuration, setDraggedDuration] = useState<number | null>(null);
  const connected = phase === 'connected';
  const inspectedScene = studioMode ? previewScene : programScene;
  const items = useMemo(() => (inspectedScene ? sceneItems[inspectedScene] ?? [] : []), [inspectedScene, sceneItems]);

  useEffect(() => {
    if (connected && inspectedScene) useObsStore.getState().loadSceneItems(inspectedScene).catch(() => undefined);
  }, [connected, inspectedScene]);

  const switchScene = (sceneName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    const requestType = studioMode ? 'SetCurrentPreviewScene' : 'SetCurrentProgramScene';
    obs.call(requestType, { sceneName }).catch((error: Error) => Alert.alert('OBS', error.message));
  };

  const toggleItem = (item: SceneItem) => {
    if (!inspectedScene) return;
    obs.call('SetSceneItemEnabled', { sceneName: inspectedScene, sceneItemId: item.sceneItemId, sceneItemEnabled: !item.sceneItemEnabled }).catch((error: Error) => Alert.alert('OBS', error.message));
  };

  const applyDuration = (milliseconds: number) => {
    setDraggedDuration(milliseconds);
    setTransitionDuration(milliseconds).catch((error: Error) => Alert.alert('OBS', error.message)).finally(() => setDraggedDuration(null));
  };

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.panelTitle}>Scenes</Text>
          <PrimaryButton label="Add scene" icon="add" variant="ghost" style={styles.addButton} onPress={() => setAddingScene(true)} />
        </View>
        {!connected ? (
          <EmptyState icon="cloud-offline-outline" title="No OBS connection" description="Scenes appear here when OBS is connected." />
        ) : (
          <>
            <Pressable
              onPress={() => obs.call('SetStudioModeEnabled', { studioModeEnabled: !studioMode }).catch((error: Error) => Alert.alert('OBS', error.message))}
              style={[styles.studioToggle, studioMode && { borderColor: theme.color.accent, backgroundColor: tint(theme.color.accent, 0.15) }]}
            >
              <Ionicons name="browsers-outline" size={15} color={studioMode ? theme.color.accent : theme.color.textMuted} />
              <Text style={[styles.studioText, studioMode && { color: theme.color.text }]}>Studio mode</Text>
            </Pressable>
            <View style={styles.grid}>
              {scenes.map((scene) => {
                const isProgram = scene.sceneName === programScene;
                const isPreview = studioMode && scene.sceneName === previewScene;
                const highlight = isProgram ? theme.color.live : isPreview ? theme.color.good : theme.color.border;
                return (
                  <Pressable
                    key={scene.sceneUuid ?? scene.sceneName}
                    onPress={() => switchScene(scene.sceneName)}
                    onLongPress={() => setSceneOptions(scene)}
                    delayLongPress={350}
                    style={({ pressed }) => [styles.scene, { borderColor: highlight, backgroundColor: isProgram || isPreview ? tint(highlight, 0.12) : theme.color.surface, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={styles.sceneName} numberOfLines={1}>{scene.sceneName}</Text>
                    {isProgram ? <Pill label="LIVE" color={theme.color.live} filled /> : null}
                    {isPreview ? <Pill label="PREVIEW" color={theme.color.good} filled /> : null}
                    <Pressable onPress={() => setSceneOptions(scene)} hitSlop={8}>
                      <Ionicons name="ellipsis-horizontal" size={16} color={theme.color.textMuted} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>

            {transitions.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle>Transition</SectionTitle>
                <View style={styles.chips}>
                  {transitions.map((name) => {
                    const selected = name === currentTransition;
                    return (
                      <Pressable key={name} onPress={() => obs.call('SetCurrentSceneTransition', { transitionName: name }).catch((error: Error) => Alert.alert('OBS', error.message))} style={[styles.chip, selected && styles.chipSelected]}>
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!transitionFixed ? (
                  <>
                    <View style={styles.durationHeader}>
                      <Text style={styles.mutedText}>Duration</Text>
                      <Text style={styles.durationValue}>{Math.round(draggedDuration ?? transitionDuration)} ms</Text>
                    </View>
                    <Slider minimumValue={DURATION_MIN_MS} maximumValue={DURATION_MAX_MS} step={50} value={transitionDuration} minimumTrackTintColor={theme.color.accent} maximumTrackTintColor={theme.color.border} thumbTintColor={theme.color.accent} onValueChange={setDraggedDuration} onSlidingComplete={applyDuration} />
                    <View style={styles.chips}>
                      {DURATION_PRESETS.map((preset) => (
                        <Pressable key={preset} onPress={() => applyDuration(preset)} style={[styles.chip, Math.round(transitionDuration) === preset && styles.chipSelected]}>
                          <Text style={[styles.chipText, Math.round(transitionDuration) === preset && styles.chipTextSelected]}>{preset} ms</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : <Text style={styles.mutedText}>This transition has a fixed duration.</Text>}
              </View>
            ) : null}

            {inspectedScene ? (
              <View style={styles.section}>
                <View style={styles.header}>
                  <SectionTitle>Sources</SectionTitle>
                  <PrimaryButton label="Add source" icon="add" variant="ghost" style={styles.addButton} onPress={() => setAddingSource(true)} />
                </View>
                {items.length === 0 ? <Text style={styles.mutedText}>This scene has no sources yet.</Text> : items.map((item) => (
                  <Pressable key={item.sceneItemId} onPress={() => toggleItem(item)} onLongPress={() => setSourceOptions(item)} delayLongPress={350} style={({ pressed }) => [styles.source, pressed && { opacity: 0.7 }]}>
                    <Ionicons name={item.sceneItemEnabled ? 'eye' : 'eye-off'} size={18} color={item.sceneItemEnabled ? theme.color.good : theme.color.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sourceName} numberOfLines={1}>{item.sourceName}</Text>
                      <Text style={styles.sourceKind} numberOfLines={1}>{inputKindLabel(item.inputKind ?? (item.isGroup ? 'group' : undefined))}</Text>
                    </View>
                    <Pressable onPress={() => setSourceOptions(item)} hitSlop={8}><Ionicons name="ellipsis-horizontal" size={16} color={theme.color.textMuted} /></Pressable>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <PromptDialog visible={addingScene} title="New scene" description="Creates an empty scene in OBS." placeholder="Scene name" initialValue={`Scene ${scenes.length + 1}`} confirmLabel="Create" onCancel={() => setAddingScene(false)} onSubmit={(value) => { setAddingScene(false); createScene(value).catch((error: Error) => Alert.alert('Could not create scene', error.message)); }} />
      <SceneOptionsSheet scene={sceneOptions} onClose={() => setSceneOptions(null)} />
      {inspectedScene ? <><AddSourceSheet sceneName={inspectedScene} visible={addingSource} onClose={() => setAddingSource(false)} /><SourceOptionsSheet sceneName={inspectedScene} item={sourceOptions} itemCount={items.length} onClose={() => setSourceOptions(null)} /></> : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(3), gap: theme.space(2.5) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { color: theme.color.textMuted, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  addButton: { paddingVertical: theme.space(1), paddingHorizontal: theme.space(2) },
  studioToggle: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), borderRadius: theme.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.border, paddingHorizontal: theme.space(2.5), paddingVertical: theme.space(1.5) },
  studioText: { color: theme.color.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  scene: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), borderRadius: theme.radius.md, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: theme.space(3), paddingVertical: theme.space(2.5) },
  sceneName: { flex: 1, color: theme.color.text, fontSize: fontSize.sm, fontWeight: '700' },
  section: { gap: theme.space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1.5) },
  chip: { borderRadius: theme.radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.border, paddingHorizontal: theme.space(2.5), paddingVertical: theme.space(1.5) },
  chipSelected: { borderColor: theme.color.accent, backgroundColor: tint(theme.color.accent, 0.15) },
  chipText: { color: theme.color.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  chipTextSelected: { color: theme.color.text },
  durationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  durationValue: { color: theme.color.text, fontSize: fontSize.sm, fontWeight: '700' },
  mutedText: { color: theme.color.textMuted, fontSize: fontSize.xs },
  source: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2), backgroundColor: theme.color.background, borderRadius: theme.radius.md, paddingHorizontal: theme.space(2.5), paddingVertical: theme.space(2) },
  sourceName: { color: theme.color.text, fontSize: fontSize.sm, fontWeight: '600' },
  sourceKind: { color: theme.color.textMuted, fontSize: fontSize.xs, marginTop: 1 },
});
