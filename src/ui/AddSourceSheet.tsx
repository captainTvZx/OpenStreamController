import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { inputKindLabel } from '../obs/inputKinds';
import { useObsStore } from '../obs/obsStore';
import {
  addExistingSource,
  createInput,
  InputSummary,
  listInputKinds,
  listInputs,
} from '../obs/sourceAdmin';
import type { SceneItem } from '../obs/types';
import { Field, PrimaryButton, SectionTitle } from './components';
import { fontSize, theme, tint } from './theme';

/**
 * Shared empty array for the selector below. zustand feeds the selector result
 * straight into useSyncExternalStore, so returning a fresh `[]` on every call
 * would look like a new snapshot each render and loop forever.
 */
const NO_ITEMS: SceneItem[] = [];

/** Kinds worth putting first; the rest stay available under "All kinds". */
const COMMON_KINDS = [
  'text_gdiplus_v2',
  'text_ft2_source_v2',
  'browser_source',
  'image_source',
  'ffmpeg_source',
  'color_source_v3',
  'monitor_capture',
  'window_capture',
  'game_capture',
  'dshow_input',
  'av_capture_input_v2',
];

export function AddSourceSheet({
  sceneName,
  visible,
  onClose,
}: {
  sceneName: string;
  visible: boolean;
  onClose: () => void;
}) {
  const sceneItems = useObsStore((state) => state.sceneItems[sceneName] ?? NO_ITEMS);

  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [kinds, setKinds] = useState<string[]>([]);
  const [inputs, setInputs] = useState<InputSummary[]>([]);
  const [selectedKind, setSelectedKind] = useState<string>();
  const [name, setName] = useState('');
  const [showAllKinds, setShowAllKinds] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode('new');
    setName('');
    setSelectedKind(undefined);
    setShowAllKinds(false);
    listInputKinds().then(setKinds).catch(() => undefined);
    listInputs().then(setInputs).catch(() => undefined);
  }, [visible]);

  /** Sources that exist in OBS but are not in this scene yet. */
  const available = useMemo(() => {
    const present = new Set(sceneItems.map((item) => item.sourceName));
    return inputs.filter((input) => !present.has(input.inputName));
  }, [inputs, sceneItems]);

  const visibleKinds = useMemo(() => {
    if (showAllKinds) return kinds;
    const common = COMMON_KINDS.filter((kind) => kinds.includes(kind));
    return common.length > 0 ? common : kinds;
  }, [kinds, showAllKinds]);

  const create = () => {
    if (!selectedKind) {
      Alert.alert('Pick a kind', 'Choose what sort of source to create.');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name needed', 'Give the source a name so you can find it later.');
      return;
    }
    setBusy(true);
    createInput(sceneName, selectedKind, trimmed)
      .then(() => {
        useObsStore.getState().loadSceneItems(sceneName).catch(() => undefined);
        onClose();
      })
      .catch((error: Error) => Alert.alert('Could not create source', error.message))
      .finally(() => setBusy(false));
  };

  const addExisting = (sourceName: string) => {
    setBusy(true);
    addExistingSource(sceneName, sourceName)
      .then(() => {
        useObsStore.getState().loadSceneItems(sceneName).catch(() => undefined);
        onClose();
      })
      .catch((error: Error) => Alert.alert('Could not add source', error.message))
      .finally(() => setBusy(false));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Add source</Text>
              <Text style={styles.subtitle}>to {sceneName}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.color.textMuted} />
            </Pressable>
          </View>

          <View style={styles.tabs}>
            <TabButton label="Create new" active={mode === 'new'} onPress={() => setMode('new')} />
            <TabButton
              label={`Existing (${available.length})`}
              active={mode === 'existing'}
              onPress={() => setMode('existing')}
            />
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: theme.space(6) }}>
            {mode === 'new' ? (
              <>
                <SectionTitle
                  action={
                    kinds.length > visibleKinds.length || showAllKinds ? (
                      <Pressable onPress={() => setShowAllKinds((value) => !value)}>
                        <Text style={styles.link}>{showAllKinds ? 'Common only' : `All ${kinds.length}`}</Text>
                      </Pressable>
                    ) : undefined
                  }
                >
                  Kind
                </SectionTitle>
                <View style={styles.chipWrap}>
                  {visibleKinds.map((kind) => {
                    const selected = kind === selectedKind;
                    return (
                      <Pressable
                        key={kind}
                        onPress={() => {
                          setSelectedKind(kind);
                          if (!name.trim()) setName(inputKindLabel(kind));
                        }}
                        style={[
                          styles.chip,
                          selected && {
                            borderColor: theme.color.accent,
                            backgroundColor: tint(theme.color.accent, 0.18),
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, selected && { color: theme.color.text }]}>
                          {inputKindLabel(kind)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ marginTop: theme.space(4) }}>
                  <Field
                    label="Name"
                    value={name}
                    onChangeText={setName}
                    placeholder="Camera, Lower third, Alerts…"
                    hint="Created with OBS defaults — set it up further from the source options."
                  />
                </View>
                <PrimaryButton label="Create source" icon="add" loading={busy} onPress={create} />
              </>
            ) : (
              <>
                <Text style={styles.hint}>
                  These sources already exist in OBS. Adding one here shows the same source in this scene —
                  edit it once and every scene follows.
                </Text>
                {available.length === 0 ? (
                  <Text style={styles.hint}>Every existing source is already in this scene.</Text>
                ) : (
                  available.map((input) => (
                    <Pressable
                      key={input.inputName}
                      onPress={() => addExisting(input.inputName)}
                      style={({ pressed }) => [styles.existingRow, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="duplicate-outline" size={18} color={theme.color.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.existingName} numberOfLines={1}>
                          {input.inputName}
                        </Text>
                        <Text style={styles.existingKind}>{inputKindLabel(input.inputKind)}</Text>
                      </View>
                      <Ionicons name="add" size={20} color={theme.color.textMuted} />
                    </Pressable>
                  ))
                )}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tab,
        active && { backgroundColor: tint(theme.color.accent, 0.18), borderColor: theme.color.accent },
      ]}
    >
      <Text style={[styles.tabText, active && { color: theme.color.text }]}>{label}</Text>
    </Pressable>
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
  tabs: { flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(4) },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.space(2.5),
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  tabText: { color: theme.color.textMuted, fontSize: fontSize.sm, fontWeight: '700' },
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
  hint: { color: theme.color.textMuted, fontSize: fontSize.sm, lineHeight: 19, marginBottom: theme.space(3) },
  link: { color: theme.color.accent, fontSize: fontSize.sm, fontWeight: '700' },
  existingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    padding: theme.space(3),
    marginBottom: theme.space(2),
  },
  existingName: { color: theme.color.text, fontSize: fontSize.md, fontWeight: '600' },
  existingKind: { color: theme.color.textMuted, fontSize: fontSize.xs, marginTop: 1 },
});
