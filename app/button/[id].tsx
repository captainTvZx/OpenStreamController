import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ACTION_CATALOG,
  ActionType,
  BUTTON_COLORS,
  DeckAction,
  actionMeta,
  defaultVisualsFor,
  describeAction,
  runAction,
} from '../../src/actions/actions';
import { useObsStore } from '../../src/obs/obsStore';
import { makeButton, useDeckStore } from '../../src/store/decks';
import { Card, Field, PrimaryButton, SectionTitle } from '../../src/ui/components';
import { DURATION_PRESETS } from '../../src/ui/transitionDurations';
import { fontSize, theme, tint } from '../../src/ui/theme';

const ICON_CHOICES: string[] = [
  'albums', 'eye', 'eye-off', 'swap-horizontal', 'browsers', 'radio', 'recording', 'pause', 'play',
  'videocam', 'layers', 'save', 'mic', 'mic-off', 'volume-high', 'volume-mute', 'refresh', 'flash',
  'game-controller', 'musical-notes', 'chatbubbles', 'people', 'star', 'heart', 'trophy', 'rocket',
  'camera', 'desktop', 'tv', 'code-slash', 'settings', 'timer',
];

const groups = ['Scenes', 'Broadcast', 'Audio', 'Sources', 'Advanced'] as const;

export default function ButtonEditorScreen() {
  const router = useRouter();
  const { id, deckId } = useLocalSearchParams<{ id: string; deckId: string }>();
  const isNew = id === 'new';

  const deck = useDeckStore((state) => state.deckById(deckId));
  const existing = deck?.buttons.find((button) => button.id === id);

  const scenes = useObsStore((state) => state.scenes);
  const audioInputs = useObsStore((state) => state.audioInputs);
  const transitions = useObsStore((state) => state.transitions);
  const profiles = useObsStore((state) => state.profiles);
  const sceneCollections = useObsStore((state) => state.sceneCollections);
  const sceneItems = useObsStore((state) => state.sceneItems);
  const connected = useObsStore((state) => state.phase === 'connected');

  const [action, setAction] = useState<DeckAction>(existing?.action ?? { type: 'toggleStream' });
  const [label, setLabel] = useState(existing?.label ?? 'Stream');
  const [icon, setIcon] = useState(existing?.icon ?? 'radio');
  const [color, setColor] = useState(existing?.color ?? theme.color.live);
  /** Once the user edits the label we stop syncing it to the action. */
  const [labelTouched, setLabelTouched] = useState(Boolean(existing));

  const meta = actionMeta(action.type);

  // Source pickers need the item list of the selected scene.
  useEffect(() => {
    if (!connected || action.type !== 'toggleSource') return;
    if (!action.sceneName || sceneItems[action.sceneName]) return;
    useObsStore.getState().loadSceneItems(action.sceneName).catch(() => undefined);
  }, [action, connected, sceneItems]);

  const applyAction = (next: DeckAction) => {
    setAction(next);
    const visuals = defaultVisualsFor(next);
    if (!labelTouched) setLabel(visuals.label);
    if (!existing) {
      setIcon(visuals.icon);
      setColor(visuals.color);
    }
  };

  const changeType = (type: ActionType) => {
    applyAction(blankActionFor(type, { scenes, audioInputs, transitions, profiles, sceneCollections }));
  };

  const save = () => {
    if (!deck) {
      router.back();
      return;
    }
    if (!isActionComplete(action)) {
      Alert.alert('Incomplete button', 'Pick what this button should act on.');
      return;
    }

    if (isNew) {
      useDeckStore.getState().addButton(deck.id, makeButton(action, { label, icon, color }));
    } else if (existing) {
      useDeckStore.getState().updateButton(deck.id, existing.id, { label, icon, color, action });
    }
    router.back();
  };

  const test = async () => {
    if (!connected) {
      Alert.alert('Not connected', 'Connect to OBS to test this button.');
      return;
    }
    try {
      await runAction(action);
    } catch (error) {
      Alert.alert('Action failed', error instanceof Error ? error.message : String(error));
    }
  };

  const targetOptions = useMemo(() => {
    switch (meta.target) {
      case 'scene':
        return scenes.map((scene) => scene.sceneName);
      case 'input':
        return audioInputs.map((input) => input.inputName);
      case 'transition':
        return transitions;
      case 'profile':
        return profiles;
      case 'sceneCollection':
        return sceneCollections;
      default:
        return [];
    }
  }, [audioInputs, meta.target, profiles, sceneCollections, scenes, transitions]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'New button' : 'Edit button' }} />

      <Card style={styles.preview}>
        <View
          style={[
            styles.previewTile,
            { backgroundColor: tint(color, 0.25), borderColor: color },
          ]}
        >
          <Ionicons name={(icon || 'ellipse') as keyof typeof Ionicons.glyphMap} size={30} color={color} />
          <Text style={styles.previewLabel} numberOfLines={2}>
            {label || 'Button'}
          </Text>
        </View>
        <View style={{ flex: 1, gap: theme.space(2) }}>
          <Text style={styles.previewTitle}>{describeAction(action)}</Text>
          <PrimaryButton label="Test now" icon="play" variant="ghost" onPress={test} />
        </View>
      </Card>

      <SectionTitle>Action</SectionTitle>
      {groups.map((group) => {
        const entries = ACTION_CATALOG.filter((entry) => entry.group === group);
        return (
          <View key={group} style={{ marginBottom: theme.space(3) }}>
            <Text style={styles.groupLabel}>{group}</Text>
            <View style={styles.chipWrap}>
              {entries.map((entry) => {
                const selected = entry.type === action.type;
                return (
                  <Pressable
                    key={entry.type}
                    onPress={() => changeType(entry.type)}
                    style={[
                      styles.chip,
                      selected && { borderColor: entry.color, backgroundColor: tint(entry.color, 0.18) },
                    ]}
                  >
                    <Ionicons
                      name={entry.icon as keyof typeof Ionicons.glyphMap}
                      size={14}
                      color={selected ? entry.color : theme.color.textMuted}
                    />
                    <Text style={[styles.chipText, selected && { color: theme.color.text }]}>
                      {entry.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      {action.type === 'setTransitionDuration' ? (
        <>
          <SectionTitle>Duration</SectionTitle>
          <View style={styles.chipWrap}>
            {DURATION_PRESETS.map((preset) => {
              const selected = action.durationMs === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => applyAction({ ...action, durationMs: preset })}
                  style={[
                    styles.chip,
                    selected && {
                      borderColor: theme.color.accent,
                      backgroundColor: tint(theme.color.accent, 0.18),
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
          <Card style={{ marginTop: theme.space(3) }}>
            <Field
              label="Custom duration (ms)"
              value={String(action.durationMs)}
              onChangeText={(value) =>
                applyAction({ ...action, durationMs: Number(value.replace(/\D/g, '')) || 0 })
              }
              keyboardType="number-pad"
              hint="Applies to the transition OBS is currently using."
            />
          </Card>
        </>
      ) : null}

      {meta.target !== 'none' &&
      meta.target !== 'raw' &&
      meta.target !== 'duration' &&
      meta.target !== 'sceneSource' ? (
        <>
          <SectionTitle>Target</SectionTitle>
          {targetOptions.length === 0 ? (
            <Text style={styles.hint}>
              {connected
                ? 'OBS reported nothing to pick here.'
                : 'Connect to OBS to load the list, or keep the current value.'}
            </Text>
          ) : (
            <View style={styles.chipWrap}>
              {targetOptions.map((option) => {
                const selected = currentTargetValue(action) === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => applyAction(withTarget(action, option))}
                    style={[
                      styles.chip,
                      selected && {
                        borderColor: theme.color.accent,
                        backgroundColor: tint(theme.color.accent, 0.18),
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, selected && { color: theme.color.text }]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      {meta.target === 'sceneSource' && action.type === 'toggleSource' ? (
        <>
          <SectionTitle>Scene</SectionTitle>
          <View style={styles.chipWrap}>
            {scenes.map((scene) => {
              const selected = action.sceneName === scene.sceneName;
              return (
                <Pressable
                  key={scene.sceneName}
                  onPress={() => applyAction({ ...action, sceneName: scene.sceneName, sourceName: '' })}
                  style={[
                    styles.chip,
                    selected && {
                      borderColor: theme.color.accent,
                      backgroundColor: tint(theme.color.accent, 0.18),
                    },
                  ]}
                >
                  <Text style={[styles.chipText, selected && { color: theme.color.text }]}>
                    {scene.sceneName}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <SectionTitle>Source</SectionTitle>
          <View style={styles.chipWrap}>
            {(sceneItems[action.sceneName] ?? []).map((item) => {
              const selected = action.sourceName === item.sourceName;
              return (
                <Pressable
                  key={item.sceneItemId}
                  onPress={() => applyAction({ ...action, sourceName: item.sourceName })}
                  style={[
                    styles.chip,
                    selected && {
                      borderColor: theme.color.accent,
                      backgroundColor: tint(theme.color.accent, 0.18),
                    },
                  ]}
                >
                  <Text style={[styles.chipText, selected && { color: theme.color.text }]}>
                    {item.sourceName}
                  </Text>
                </Pressable>
              );
            })}
            {action.sceneName && (sceneItems[action.sceneName] ?? []).length === 0 ? (
              <Text style={styles.hint}>No sources loaded for this scene.</Text>
            ) : null}
          </View>
        </>
      ) : null}

      {action.type === 'raw' ? (
        <>
          <SectionTitle>Custom request</SectionTitle>
          <Card>
            <Field
              label="Request type"
              placeholder="SetCurrentProgramScene"
              value={action.requestType}
              onChangeText={(value) => applyAction({ ...action, requestType: value.trim() })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field
              label="Request data (JSON)"
              placeholder='{"sceneName": "Intro"}'
              value={action.requestDataJson ?? ''}
              onChangeText={(value) => applyAction({ ...action, requestDataJson: value })}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              style={{ minHeight: 90, textAlignVertical: 'top' }}
              hint="Any request from the obs-websocket 5 protocol reference."
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <Field
          label="Label"
          value={label}
          onChangeText={(value) => {
            setLabel(value);
            setLabelTouched(true);
          }}
          placeholder="Button label"
        />
        <Text style={styles.fieldLabel}>Colour</Text>
        <View style={styles.chipWrap}>
          {BUTTON_COLORS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setColor(option)}
              style={[
                styles.swatch,
                { backgroundColor: option },
                color === option && styles.swatchSelected,
              ]}
            />
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: theme.space(4) }]}>Icon</Text>
        <View style={styles.chipWrap}>
          {ICON_CHOICES.map((option) => (
            <Pressable
              key={option}
              onPress={() => setIcon(option)}
              style={[
                styles.iconChoice,
                icon === option && { borderColor: color, backgroundColor: tint(color, 0.18) },
              ]}
            >
              <Ionicons
                name={option as keyof typeof Ionicons.glyphMap}
                size={18}
                color={icon === option ? color : theme.color.textMuted}
              />
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={styles.footer}>
        <PrimaryButton label={isNew ? 'Add button' : 'Save'} icon="checkmark" onPress={save} style={{ flex: 1 }} />
        {existing && deck ? (
          <PrimaryButton
            label="Delete"
            variant="outline"
            color={theme.color.live}
            onPress={() => {
              useDeckStore.getState().removeButton(deck.id, existing.id);
              router.back();
            }}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

type ObsLists = {
  scenes: { sceneName: string }[];
  audioInputs: { inputName: string }[];
  transitions: string[];
  profiles: string[];
  sceneCollections: string[];
};

/** A new action of the given type, pre-filled with the first sensible target. */
function blankActionFor(type: ActionType, lists: ObsLists): DeckAction {
  switch (type) {
    case 'scene':
    case 'previewScene':
      return { type, sceneName: lists.scenes[0]?.sceneName ?? '' };
    case 'toggleMute':
    case 'refreshBrowser':
      return { type, inputName: lists.audioInputs[0]?.inputName ?? '' };
    case 'toggleSource':
      return { type, sceneName: lists.scenes[0]?.sceneName ?? '', sourceName: '' };
    case 'setTransition':
      return { type, transitionName: lists.transitions[0] ?? '' };
    case 'setTransitionDuration':
      return { type, durationMs: 300 };
    case 'setProfile':
      return { type, profileName: lists.profiles[0] ?? '' };
    case 'setSceneCollection':
      return { type, collectionName: lists.sceneCollections[0] ?? '' };
    case 'raw':
      return { type, requestType: '', requestDataJson: '' };
    default:
      return { type } as DeckAction;
  }
}

function currentTargetValue(action: DeckAction): string | undefined {
  switch (action.type) {
    case 'scene':
    case 'previewScene':
      return action.sceneName;
    case 'toggleMute':
    case 'refreshBrowser':
      return action.inputName;
    case 'setTransition':
      return action.transitionName;
    case 'setProfile':
      return action.profileName;
    case 'setSceneCollection':
      return action.collectionName;
    default:
      return undefined;
  }
}

function withTarget(action: DeckAction, value: string): DeckAction {
  switch (action.type) {
    case 'scene':
    case 'previewScene':
      return { ...action, sceneName: value };
    case 'toggleMute':
    case 'refreshBrowser':
      return { ...action, inputName: value };
    case 'setTransition':
      return { ...action, transitionName: value };
    case 'setProfile':
      return { ...action, profileName: value };
    case 'setSceneCollection':
      return { ...action, collectionName: value };
    default:
      return action;
  }
}

function isActionComplete(action: DeckAction): boolean {
  switch (action.type) {
    case 'scene':
    case 'previewScene':
      return Boolean(action.sceneName);
    case 'toggleMute':
    case 'refreshBrowser':
      return Boolean(action.inputName);
    case 'toggleSource':
      return Boolean(action.sceneName && action.sourceName);
    case 'setTransition':
      return Boolean(action.transitionName);
    case 'setTransitionDuration':
      return action.durationMs > 0;
    case 'setProfile':
      return Boolean(action.profileName);
    case 'setSceneCollection':
      return Boolean(action.collectionName);
    case 'raw':
      return Boolean(action.requestType);
    default:
      return true;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.background },
  content: {
    padding: theme.space(4),
    paddingBottom: theme.space(12),
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  preview: { flexDirection: 'row', alignItems: 'center', gap: theme.space(4) },
  previewTile: {
    width: 96,
    height: 96,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    padding: theme.space(2),
  },
  previewLabel: { color: theme.color.text, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' },
  previewTitle: { color: theme.color.textMuted, fontSize: fontSize.sm, lineHeight: 19 },
  groupLabel: {
    color: theme.color.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginBottom: theme.space(2),
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
  },
  chipText: { color: theme.color.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  swatch: { width: 36, height: 36, borderRadius: theme.radius.sm, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: '#fff' },
  iconChoice: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surface,
  },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: theme.space(2),
  },
  hint: { color: theme.color.textMuted, fontSize: fontSize.sm },
  footer: { flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(6) },
});
