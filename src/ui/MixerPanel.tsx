import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { audioIconFor } from '../obs/inputKinds';
import { obs, useObsStore } from '../obs/obsStore';
import { LevelMeter } from './LevelMeter';
import { fontSize, theme, tint } from './theme';

/** OBS treats anything at or below this as silence. */
const MIN_DB = -60;

/**
 * Audio faders that live under the deck grid. Each strip is a mute button plus
 * a level slider, sized to sit alongside the buttons rather than dominate them.
 */
export function MixerPanel({
  width,
  columns = 1,
  compact = false,
  title,
  style,
}: {
  width: number;
  columns?: number;
  compact?: boolean;
  title?: string;
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
}) {
  const audioInputs = useObsStore((state) => state.audioInputs);
  /** dB values being dragged, before OBS echoes them back. */
  const [dragging, setDragging] = useState<Record<string, number>>({});

  if (audioInputs.length === 0) {
    return (
      <View style={[styles.empty, { width }, style]}>
        <Text style={styles.emptyText}>No audio sources in this scene collection.</Text>
      </View>
    );
  }

  const gap = theme.space(3); // Match global PADDING gap
  // Never squeeze more columns in than the strips can actually use.
  const effectiveColumns = Math.max(1, Math.min(columns, audioInputs.length));
  const stripWidth =
    effectiveColumns === 1 ? width : (width - gap * (effectiveColumns - 1)) / effectiveColumns;

  return (
    <View style={[{ width }, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={[styles.grid, { width, gap }]}>
      {audioInputs.map((input) => {
        const db = dragging[input.inputName] ?? input.volumeDb;
        // OBS commonly maps dB to a 0-100% slider using a power curve (db / 40)
        // The percentage mirrors the fader's own position: MIN_DB is silence,
        // 0 dB is 100%. OBS can report a boosted level above 0 dB (set in its
        // Advanced Audio Properties), which the fader shows pinned at 100%
        // while the dB reading beside it stays exact.
        const percent = Math.max(0, Math.min(100, Math.round(((db - MIN_DB) / -MIN_DB) * 100)));
        const faderValue = Math.max(MIN_DB, Math.min(0, input.volumeDb));
        return (
          <View
            key={input.inputName}
            style={[styles.strip, { width: stripWidth }, compact && styles.stripCompact]}
          >
            <View style={styles.header}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  obs
                    .call('ToggleInputMute', { inputName: input.inputName })
                    .catch((error: Error) => Alert.alert('OBS', error.message));
                }}
                style={[
                  styles.muteButton,
                  {
                    backgroundColor: input.muted
                      ? tint(theme.color.live, 0.2)
                      : tint(theme.color.good, 0.15),
                    borderColor: input.muted ? theme.color.live : theme.color.good,
                  },
                ]}
              >
                <Ionicons
                  name={
                    (input.muted ? audioIconFor(input).off : audioIconFor(input).on) as
                      keyof typeof Ionicons.glyphMap
                  }
                  size={16}
                  color={input.muted ? theme.color.live : theme.color.good}
                />
              </Pressable>

              <Text style={styles.name} numberOfLines={1}>
                {input.inputName}
              </Text>
              <Text style={[styles.level, input.muted && { color: theme.color.live }]}>
                {percent}%  |  {db <= MIN_DB ? '-inf' : db.toFixed(1)} dB
              </Text>
            </View>

            {/* Live level sits above the fader, the way OBS stacks them. */}
            <View style={styles.meterRow}>
              <LevelMeter inputName={input.inputName} muted={input.muted} height={compact ? 5 : 6} />
            </View>

            <Slider
              minimumValue={MIN_DB}
              maximumValue={0}
              step={0.5}
              value={faderValue}
              minimumTrackTintColor={input.muted ? theme.color.live : theme.color.accent}
              maximumTrackTintColor={theme.color.border}
              thumbTintColor={input.muted ? theme.color.live : theme.color.accent}
              onValueChange={(value) =>
                setDragging((current) => ({ ...current, [input.inputName]: value }))
              }
              onSlidingComplete={(value) => {
                setDragging((current) => {
                  const next = { ...current };
                  delete next[input.inputName];
                  return next;
                });
                obs
                  .call('SetInputVolume', { inputName: input.inputName, inputVolumeDb: value })
                  .catch((error: Error) => Alert.alert('OBS', error.message));
              }}
            />
          </View>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: theme.color.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: theme.space(2),
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'stretch' },
  strip: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
    justifyContent: 'center',
  },
  stripCompact: { paddingVertical: theme.space(1.5) },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2.5) },
  meterRow: { marginTop: theme.space(1.5) },
  muteButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1, color: theme.color.text, fontSize: fontSize.sm, fontWeight: '700' },
  level: {
    color: theme.color.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    padding: theme.space(4),
  },
  emptyText: { color: theme.color.textMuted, fontSize: fontSize.sm },
});
