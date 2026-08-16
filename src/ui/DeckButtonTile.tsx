import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeckButton } from '../store/decks';
import { fontSize, theme, tint } from './theme';

type Props = {
  button: DeckButton;
  size: number;
  /** Live detail such as a stream timecode or a fader level. */
  subtitle?: string;
  active?: boolean;
  busy?: boolean;
  failed?: boolean;
  editing?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onRemove?: () => void;
};

function DeckButtonTileComponent({
  button,
  size,
  subtitle,
  active,
  busy,
  failed,
  editing,
  disabled,
  onPress,
  onLongPress,
  onRemove,
}: Props) {
  const color = failed ? theme.color.live : button.color;
  const iconName = (button.icon || 'ellipse') as keyof typeof Ionicons.glyphMap;

  return (
    <View style={{ width: size, height: size }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        disabled={disabled}
        style={({ pressed }) => [
          styles.tile,
          {
            backgroundColor: active ? tint(color, 0.28) : theme.color.surface,
            borderColor: active ? color : theme.color.border,
            borderWidth: active ? 2 : StyleSheet.hairlineWidth,
            opacity: disabled ? 0.4 : pressed ? 0.65 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={color} />
        ) : (
          <Ionicons name={iconName} size={Math.min(30, size * 0.3)} color={active ? color : tint(color, 0.85)} />
        )}
        <Text
          style={[styles.label, { color: active ? theme.color.text : theme.color.textMuted }]}
          numberOfLines={subtitle ? 1 : 2}
        >
          {button.label}
        </Text>
        {/* Tiny tiles have no room for a second line. */}
        {subtitle && size >= 84 ? (
          <Text style={[styles.subtitle, { color: color }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {active ? <View style={[styles.activeDot, { backgroundColor: color }]} /> : null}
      </Pressable>

      {editing ? (
        <Pressable onPress={onRemove} style={styles.removeBadge} hitSlop={8}>
          <Ionicons name="close" size={14} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    padding: theme.space(2),
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: -theme.space(1),
    fontVariant: ['tabular-nums'],
  },
  activeDot: {
    position: 'absolute',
    top: theme.space(2),
    right: theme.space(2),
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.color.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const DeckButtonTile = memo(DeckButtonTileComponent);
