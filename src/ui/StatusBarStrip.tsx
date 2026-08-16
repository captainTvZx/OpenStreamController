import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useObsStore } from '../obs/obsStore';
import { useConnectionStore } from '../store/connections';
import { ComputerSheet } from './ComputerSheet';
import { fontSize, theme, tint } from './theme';

const PHASE_COLOR: Record<string, string> = {
  idle: theme.color.textMuted,
  connecting: theme.color.warn,
  reconnecting: theme.color.warn,
  connected: theme.color.good,
  error: theme.color.live,
};

const PHASE_LABEL: Record<string, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  connected: 'Connected',
  error: 'Connection failed',
};

/** Compact connection + output status header shared by every tab. */
export function StatusBarStrip() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const phase = useObsStore((state) => state.phase);
  const stream = useObsStore((state) => state.stream);
  const record = useObsStore((state) => state.record);
  const stats = useObsStore((state) => state.stats);
  const activeConnectionId = useObsStore((state) => state.activeConnectionId);
  const connectionName = useConnectionStore(
    (state) => state.connections.find((connection) => connection.id === activeConnectionId)?.name,
  );

  const color = PHASE_COLOR[phase] ?? theme.color.textMuted;
  const connectionCount = useConnectionStore((state) => state.connections.length);

  return (
    <>
    <Pressable style={styles.container} onPress={() => setSheetOpen(true)}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {connectionName ?? 'OpenStreamController'}
        </Text>
        <Text style={[styles.subtitle, { color }]} numberOfLines={1}>
          {PHASE_LABEL[phase] ?? phase}
          {phase === 'connected' && stats ? ` · ${Math.round(stats.activeFps)} fps · CPU ${stats.cpuUsage.toFixed(0)}%` : ''}
        </Text>
      </View>

      {stream.active ? (
        <Badge color={theme.color.live} icon="radio" label={stream.timecode} />
      ) : null}
      {record.active ? (
        <Badge
          color={record.paused ? theme.color.warn : theme.color.record}
          icon={record.paused ? 'pause' : 'ellipse'}
          label={record.timecode}
        />
      ) : null}
      {connectionCount > 1 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{connectionCount}</Text>
        </View>
      ) : null}
      <Ionicons name="swap-horizontal" size={16} color={theme.color.textMuted} />
    </Pressable>

    <ComputerSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

function Badge({ color, icon, label }: { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: tint(color, 0.18), borderColor: color }]}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2.5),
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    backgroundColor: theme.color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { color: theme.color.text, fontSize: fontSize.md, fontWeight: '700' },
  subtitle: { fontSize: fontSize.xs, marginTop: 1, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: theme.space(2),
    paddingVertical: theme.space(1),
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surfaceRaised,
  },
  countText: { color: theme.color.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
});
