import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  EditableField,
  editableFieldsFor,
  hexToObsColor,
  inputKindLabel,
  obsColorToHex,
} from '../obs/inputKinds';
import { obs, useObsStore } from '../obs/obsStore';
import {
  getInputSettings,
  getSourceThumbnail,
  listFilters,
  moveSceneItem,
  patchInputSettings,
  removeInput,
  removeSceneItem,
  setFilterEnabled,
  setSceneItemLocked,
  SourceFilter,
} from '../obs/sourceAdmin';
import type { SceneItem } from '../obs/types';
import { BUTTON_COLORS } from '../actions/actions';
import { Card, Field, PrimaryButton, SectionTitle } from './components';
import { fontSize, theme, tint } from './theme';

export function SourceOptionsSheet({
  sceneName,
  item,
  itemCount,
  onClose,
}: {
  sceneName: string;
  item: SceneItem | null;
  itemCount: number;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [fields, setFields] = useState<EditableField[]>([]);
  const [filters, setFilters] = useState<SourceFilter[]>([]);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const reloadItems = useCallback(() => {
    useObsStore.getState().loadSceneItems(sceneName).catch(() => undefined);
  }, [sceneName]);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;

    setShowRaw(false);
    setFields(editableFieldsFor(item.inputKind));

    if (item.inputKind) {
      getInputSettings(item.sourceName)
        .then(({ inputSettings }) => {
          if (cancelled) return;
          setSettings(inputSettings);
          setRawJson(JSON.stringify(inputSettings, null, 2));
        })
        .catch(() => undefined);
    } else {
      setSettings({});
      setRawJson('');
    }

    listFilters(item.sourceName)
      .then((result) => !cancelled && setFilters(result))
      .catch(() => undefined);

    getSourceThumbnail(item.sourceName)
      .then((uri) => !cancelled && setThumbnail(uri))
      .catch(() => undefined);

    return () => {
      cancelled = true;
      setThumbnail(null);
    };
  }, [item]);

  if (!item) return null;

  const commitField = (field: EditableField, value: string) => {
    let parsed: unknown = value;
    if (field.type === 'number') parsed = Number(value) || 0;
    if (field.type === 'color') parsed = hexToObsColor(value);
    setSettings((current) => ({ ...current, [field.key]: parsed }));
    patchInputSettings(item.sourceName, { [field.key]: parsed }).catch((error: Error) =>
      Alert.alert('Could not update source', error.message),
    );
  };

  const move = (direction: 'up' | 'down') => {
    Haptics.selectionAsync().catch(() => undefined);
    moveSceneItem(sceneName, item, direction, itemCount)
      .then(reloadItems)
      .catch((error: Error) => Alert.alert('OBS', error.message));
  };

  const toggleLock = () => {
    setSceneItemLocked(sceneName, item.sceneItemId, !item.sceneItemLocked)
      .then(reloadItems)
      .catch((error: Error) => Alert.alert('OBS', error.message));
  };

  const toggleVisible = () => {
    // The SceneItemEnableStateChanged event updates the store for us.
    obs
      .call('SetSceneItemEnabled', {
        sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: !item.sceneItemEnabled,
      })
      .catch((error: Error) => Alert.alert('OBS', error.message));
  };

  const confirmRemoveFromScene = () => {
    Alert.alert(
      'Remove from scene',
      `Take “${item.sourceName}” out of ${sceneName}? The source itself stays in OBS and keeps working in other scenes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeSceneItem(sceneName, item.sceneItemId)
              .then(() => {
                reloadItems();
                onClose();
              })
              .catch((error: Error) => Alert.alert('OBS', error.message));
          },
        },
      ],
    );
  };

  const confirmDeleteSource = () => {
    Alert.alert(
      'Delete source',
      `Delete “${item.sourceName}” from OBS entirely? It disappears from every scene that uses it. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everywhere',
          style: 'destructive',
          onPress: () => {
            removeInput(item.sourceName)
              .then(() => {
                reloadItems();
                onClose();
              })
              .catch((error: Error) => Alert.alert('OBS', error.message));
          },
        },
      ],
    );
  };

  const saveRawJson = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      Alert.alert('Invalid JSON', 'Fix the syntax before saving.');
      return;
    }
    patchInputSettings(item.sourceName, parsed)
      .then(() => Alert.alert('Saved', 'Settings sent to OBS.'))
      .catch((error: Error) => Alert.alert('Could not update source', error.message));
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {item.sourceName}
              </Text>
              <Text style={styles.subtitle}>
                {inputKindLabel(item.inputKind ?? (item.isGroup ? 'group' : undefined))} · in {sceneName}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.color.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: theme.space(6) }}>
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} style={styles.thumbnail} resizeMode="contain" />
            ) : null}

            <View style={styles.quickRow}>
              <QuickAction
                icon={item.sceneItemEnabled ? 'eye' : 'eye-off'}
                label={item.sceneItemEnabled ? 'Visible' : 'Hidden'}
                color={item.sceneItemEnabled ? theme.color.good : theme.color.textMuted}
                onPress={toggleVisible}
              />
              <QuickAction
                icon={item.sceneItemLocked ? 'lock-closed' : 'lock-open'}
                label={item.sceneItemLocked ? 'Locked' : 'Unlocked'}
                color={item.sceneItemLocked ? theme.color.warn : theme.color.textMuted}
                onPress={toggleLock}
              />
              <QuickAction
                icon="arrow-up"
                label="Bring up"
                color={theme.color.accent}
                onPress={() => move('up')}
              />
              <QuickAction
                icon="arrow-down"
                label="Send down"
                color={theme.color.accent}
                onPress={() => move('down')}
              />
            </View>

            {fields.length > 0 ? (
              <>
                <SectionTitle>Settings</SectionTitle>
                <Card>
                  {fields.map((field) =>
                    field.type === 'color' ? (
                      <View key={field.key}>
                        <Text style={styles.fieldLabel}>{field.label}</Text>
                        <View style={styles.swatchRow}>
                          {BUTTON_COLORS.concat(['#000000', '#FFFFFF']).map((hex) => {
                            const selected =
                              obsColorToHex(Number(settings[field.key] ?? 0)).toLowerCase() ===
                              hex.toLowerCase();
                            return (
                              <Pressable
                                key={hex}
                                onPress={() => commitField(field, hex)}
                                style={[
                                  styles.swatch,
                                  { backgroundColor: hex },
                                  selected && styles.swatchSelected,
                                ]}
                              />
                            );
                          })}
                        </View>
                      </View>
                    ) : (
                      <Field
                        key={field.key}
                        label={field.label}
                        hint={field.hint}
                        value={String(settings[field.key] ?? '')}
                        onChangeText={(value) =>
                          setSettings((current) => ({ ...current, [field.key]: value }))
                        }
                        onBlur={() => commitField(field, String(settings[field.key] ?? ''))}
                        multiline={field.type === 'multiline'}
                        keyboardType={field.type === 'number' ? 'number-pad' : 'default'}
                        autoCapitalize={field.type === 'url' ? 'none' : 'sentences'}
                        autoCorrect={field.type !== 'url'}
                        style={field.type === 'multiline' ? styles.multiline : undefined}
                      />
                    ),
                  )}
                  <Text style={styles.note}>Changes are sent to OBS when you leave the field.</Text>
                </Card>
              </>
            ) : null}

            {filters.length > 0 ? (
              <>
                <SectionTitle>Filters</SectionTitle>
                {filters.map((filter) => (
                  <Pressable
                    key={filter.filterName}
                    onPress={() => {
                      setFilters((current) =>
                        current.map((candidate) =>
                          candidate.filterName === filter.filterName
                            ? { ...candidate, filterEnabled: !candidate.filterEnabled }
                            : candidate,
                        ),
                      );
                      setFilterEnabled(item.sourceName, filter.filterName, !filter.filterEnabled).catch(
                        (error: Error) => Alert.alert('OBS', error.message),
                      );
                    }}
                    style={({ pressed }) => [styles.filterRow, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons
                      name={filter.filterEnabled ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={filter.filterEnabled ? theme.color.good : theme.color.textMuted}
                    />
                    <Text style={styles.filterName} numberOfLines={1}>
                      {filter.filterName}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}

            {item.inputKind ? (
              <>
                <SectionTitle
                  action={
                    <Pressable onPress={() => setShowRaw((value) => !value)}>
                      <Text style={styles.link}>{showRaw ? 'Hide' : 'Show'}</Text>
                    </Pressable>
                  }
                >
                  All settings (JSON)
                </SectionTitle>
                {showRaw ? (
                  <Card>
                    <Field
                      label={`${item.inputKind} settings`}
                      value={rawJson}
                      onChangeText={setRawJson}
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.json}
                      hint="Anything the fields above do not cover. Merged into the source’s settings."
                    />
                    <PrimaryButton label="Send to OBS" icon="cloud-upload" onPress={saveRawJson} />
                  </Card>
                ) : null}
              </>
            ) : null}

            <SectionTitle>Remove</SectionTitle>
            <View style={{ gap: theme.space(2) }}>
              <PrimaryButton
                label="Remove from this scene"
                icon="remove-circle-outline"
                variant="outline"
                color={theme.color.warn}
                onPress={confirmRemoveFromScene}
              />
              {item.inputKind ? (
                <PrimaryButton
                  label="Delete source everywhere"
                  icon="trash-outline"
                  variant="outline"
                  color={theme.color.live}
                  onPress={confirmDeleteSource}
                />
              ) : null}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function QuickAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { borderColor: tint(color, 0.5) },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.quickLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
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
    maxHeight: '90%',
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
  thumbnail: {
    width: '100%',
    height: 160,
    borderRadius: theme.radius.md,
    backgroundColor: '#000',
    marginTop: theme.space(4),
  },
  quickRow: { flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(4) },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(1),
    paddingVertical: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: theme.color.surface,
  },
  quickLabel: { fontSize: fontSize.xs, fontWeight: '700' },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: theme.space(2),
  },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  swatch: { width: 36, height: 36, borderRadius: theme.radius.sm, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: theme.color.text },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  json: { minHeight: 140, textAlignVertical: 'top', fontSize: fontSize.sm },
  note: { color: theme.color.textMuted, fontSize: fontSize.xs, marginTop: theme.space(1) },
  filterRow: {
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
  filterName: { flex: 1, color: theme.color.text, fontSize: fontSize.md, fontWeight: '600' },
  link: { color: theme.color.accent, fontSize: fontSize.sm, fontWeight: '700' },
});
