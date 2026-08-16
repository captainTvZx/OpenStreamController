import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useObsStore } from '../obs/obsStore';
import {
  getSceneTransitionOverride,
  removeScene,
  renameScene,
  setSceneTransitionOverride,
} from '../obs/sceneAdmin';
import type { Scene } from '../obs/types';
import { PrimaryButton, SectionTitle } from './components';
import { PromptDialog } from './PromptDialog';
import { DURATION_MAX_MS, DURATION_MIN_MS, DURATION_PRESETS } from './transitionDurations';
import { fontSize, theme, tint } from './theme';

/**
 * Per-scene management: rename, delete, and the transition override OBS keeps
 * for each scene (its own transition and duration, used when switching *to* it).
 */
export function SceneOptionsSheet({
  scene,
  onClose,
}: {
  scene: Scene | null;
  onClose: () => void;
}) {
  const transitions = useObsStore((state) => state.transitions);
  const globalDuration = useObsStore((state) => state.transitionDuration);

  const [overrideName, setOverrideName] = useState<string | null>(null);
  const [overrideDuration, setOverrideDuration] = useState<number>(globalDuration);
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!scene) return;
    let cancelled = false;
    setLoading(true);
    getSceneTransitionOverride(scene.sceneName)
      .then((override) => {
        if (cancelled) return;
        setOverrideName(override.transitionName);
        setOverrideDuration(override.transitionDuration ?? globalDuration);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [globalDuration, scene]);

  const applyOverride = (transitionName: string | null, duration: number) => {
    if (!scene) return;
    setOverrideName(transitionName);
    setOverrideDuration(duration);
    setSceneTransitionOverride(scene.sceneName, {
      transitionName,
      // OBS wants both cleared together when the override is switched off.
      transitionDuration: transitionName ? Math.round(duration) : null,
    }).catch((error: Error) => Alert.alert('OBS', error.message));
  };

  const confirmDelete = () => {
    if (!scene) return;
    Alert.alert('Delete scene', `Delete “${scene.sceneName}” from OBS? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeScene(scene)
            .then(onClose)
            .catch((error: Error) => Alert.alert('Could not delete scene', error.message));
        },
      },
    ]);
  };

  return (
    <Modal visible={scene !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {scene?.sceneName}
              </Text>
              <Text style={styles.subtitle}>Scene options</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.color.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: theme.space(4) }}>
            <View style={styles.actionRow}>
              <PrimaryButton
                label="Rename"
                icon="pencil"
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => setRenaming(true)}
              />
              <PrimaryButton
                label="Delete"
                icon="trash-outline"
                variant="outline"
                color={theme.color.live}
                style={{ flex: 1 }}
                onPress={confirmDelete}
              />
            </View>

            <SectionTitle>Transition override</SectionTitle>
            <Text style={styles.hint}>
              Used whenever OBS switches to this scene. Off means it follows the global transition
              {globalDuration ? ` (${globalDuration} ms)` : ''}.
            </Text>

            <View style={styles.chipWrap}>
              <Pressable
                onPress={() => applyOverride(null, overrideDuration)}
                style={[
                  styles.chip,
                  overrideName === null && {
                    borderColor: theme.color.accent,
                    backgroundColor: tint(theme.color.accent, 0.18),
                  },
                ]}
              >
                <Text style={[styles.chipText, overrideName === null && { color: theme.color.text }]}>
                  Off
                </Text>
              </Pressable>
              {transitions.map((name) => {
                const selected = overrideName === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => applyOverride(name, overrideDuration)}
                    style={[
                      styles.chip,
                      selected && {
                        borderColor: theme.color.accent,
                        backgroundColor: tint(theme.color.accent, 0.18),
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, selected && { color: theme.color.text }]}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>

            {overrideName ? (
              <>
                <View style={styles.durationHeader}>
                  <Text style={styles.durationLabel}>Override duration</Text>
                  <Text style={styles.durationValue}>{Math.round(overrideDuration)} ms</Text>
                </View>
                <Slider
                  minimumValue={DURATION_MIN_MS}
                  maximumValue={DURATION_MAX_MS}
                  step={50}
                  value={overrideDuration}
                  minimumTrackTintColor={theme.color.accent}
                  maximumTrackTintColor={theme.color.border}
                  thumbTintColor={theme.color.accent}
                  onValueChange={setOverrideDuration}
                  onSlidingComplete={(value) => applyOverride(overrideName, value)}
                />
                <View style={styles.chipWrap}>
                  {DURATION_PRESETS.map((preset) => (
                    <Pressable
                      key={preset}
                      onPress={() => applyOverride(overrideName, preset)}
                      style={[
                        styles.chip,
                        Math.round(overrideDuration) === preset && {
                          borderColor: theme.color.accent,
                          backgroundColor: tint(theme.color.accent, 0.18),
                        },
                      ]}
                    >
                      <Text style={styles.chipText}>{preset} ms</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            {loading ? <Text style={styles.hint}>Reading current override…</Text> : null}
          </ScrollView>
        </Pressable>
      </Pressable>

      <PromptDialog
        visible={renaming}
        title="Rename scene"
        placeholder="Scene name"
        initialValue={scene?.sceneName ?? ''}
        confirmLabel="Rename"
        onCancel={() => setRenaming(false)}
        onSubmit={(value) => {
          setRenaming(false);
          if (!scene) return;
          renameScene(scene, value)
            .then(onClose)
            .catch((error: Error) => Alert.alert('Could not rename scene', error.message));
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.color.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    padding: theme.space(4),
    paddingBottom: theme.space(8),
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.border,
    marginBottom: theme.space(3),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
  title: { color: theme.color.text, fontSize: fontSize.lg, fontWeight: '700' },
  subtitle: { color: theme.color.textMuted, fontSize: fontSize.sm, marginTop: 1 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surface,
  },
  actionRow: { flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(4) },
  hint: { color: theme.color.textMuted, fontSize: fontSize.sm, lineHeight: 19, marginBottom: theme.space(3) },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  chip: {
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(2),
  },
  chipText: { color: theme.color.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  durationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.space(4),
  },
  durationLabel: { color: theme.color.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  durationValue: {
    color: theme.color.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
