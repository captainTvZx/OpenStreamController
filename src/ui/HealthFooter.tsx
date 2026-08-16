import { StyleSheet, Text, View } from 'react-native';

import { useObsStore } from '../obs/obsStore';
import { fontSize, formatBytes, theme } from './theme';

/**
 * OBS health at a glance, sitting under the deck: the numbers that tell you a
 * stream is about to go wrong before the viewers do.
 */
export function HealthFooter({ width }: { width: number }) {
  const stats = useObsStore((state) => state.stats);
  const stream = useObsStore((state) => state.stream);
  const connected = useObsStore((state) => state.phase === 'connected');

  const unavailable = !connected || !stats;

  const droppedPercent =
    !unavailable && stream.active && stream.totalFrames
      ? ((stream.skippedFrames ?? 0) / stream.totalFrames) * 100
      : 0;

  return (
    <View style={[styles.container, { width }]}>
      <Metric label="CPU" value={unavailable ? '--' : `${stats.cpuUsage.toFixed(1)}%`} warn={!unavailable && stats.cpuUsage > 70} />
      <Metric label="FPS" value={unavailable ? '--' : stats.activeFps.toFixed(0)} warn={!unavailable && stats.activeFps < 20} />
      <Metric label="Frame" value={unavailable ? '--' : `${stats.averageFrameRenderTime.toFixed(1)}ms`} />
      <Metric
        label="Skipped"
        value={unavailable ? '--' : `${stats.renderSkippedFrames}`}
        warn={!unavailable && stats.renderSkippedFrames > 0}
      />
      {!unavailable && stream.active ? (
        <Metric label="Dropped" value={`${droppedPercent.toFixed(1)}%`} warn={droppedPercent > 1} />
      ) : null}
      <Metric label="Disk" value={unavailable ? '--' : formatBytes(stats.availableDiskSpace * 1024 * 1024)} />
    </View>
  );
}

function Metric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, warn && { color: theme.color.warn }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.space(3),
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2.5),
  },
  metric: { alignItems: 'center', minWidth: 52 },
  label: {
    color: theme.color.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  value: {
    color: theme.color.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
});
