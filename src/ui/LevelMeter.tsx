import { useCallback, useEffect, useRef } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { getInputLevel, InputLevel, METER_MIN_DB, subscribeInputLevel } from '../obs/audioLevels';
import { theme, tint } from './theme';

/** OBS's default meter thresholds: green below, then yellow, then red. */
const WARN_DB = -20;
const ERROR_DB = -9;

/** Width of the peak-hold tick, in px. */
const TICK_WIDTH = 2;

/** The scale is linear in dB, exactly like the meter drawn inside OBS. */
function positionFor(db: number): number {
  return Math.max(0, Math.min(1, (db - METER_MIN_DB) / -METER_MIN_DB));
}

/**
 * The live audio level for one OBS input, drawn as a coloured bar that fills as
 * the source gets louder — the same meter that sits above each fader in OBS.
 *
 * The bar is a full-width gradient with a dark shade slid over the unlit part,
 * so every update is a single `Animated.Value.setValue` and never a re-render.
 */
export function LevelMeter({
  inputName,
  muted = false,
  height = 6,
}: {
  inputName: string;
  muted?: boolean;
  height?: number;
}) {
  const trackWidth = useRef(0);
  const magnitude = useRef(new Animated.Value(0)).current;
  const peak = useRef(new Animated.Value(0)).current;
  const hold = useRef(new Animated.Value(0)).current;

  const apply = useCallback(
    (level: InputLevel) => {
      const width = trackWidth.current;
      if (width <= 0) return;
      // Each shade starts at its own edge and covers everything past it.
      magnitude.setValue(positionFor(level.db) * width);
      peak.setValue(positionFor(level.peakDb) * width);
      hold.setValue(positionFor(level.holdDb) * width);
    },
    [hold, magnitude, peak],
  );

  useEffect(() => subscribeInputLevel(inputName, apply), [apply, inputName]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      trackWidth.current = event.nativeEvent.layout.width;
      apply(getInputLevel(inputName));
    },
    [apply, inputName],
  );

  // Muting does not silence the meter in OBS either, but it stops mattering, so
  // the colours drop back to a muted grey-red wash.
  const colors = muted
    ? [tint(theme.color.good, 0.3), tint(theme.color.warn, 0.3), tint(theme.color.live, 0.3)]
    : [theme.color.good, theme.color.warn, theme.color.live];

  return (
    <View style={[styles.track, { height }]} onLayout={onLayout}>
      <View style={styles.scale}>
        <View style={{ flex: WARN_DB - METER_MIN_DB, backgroundColor: colors[0] }} />
        <View style={{ flex: ERROR_DB - WARN_DB, backgroundColor: colors[1] }} />
        <View style={{ flex: -ERROR_DB, backgroundColor: colors[2] }} />
      </View>
      {/* Between the average level and the peak the colour is only dimmed, so
          the bar reads the same way OBS's does: a solid body with a livelier
          tip riding on top of it. */}
      <Animated.View style={[styles.dim, { transform: [{ translateX: magnitude }] }]} />
      <Animated.View style={[styles.shade, { transform: [{ translateX: peak }] }]} />
      <Animated.View style={[styles.hold, { transform: [{ translateX: hold }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: 2,
    backgroundColor: theme.color.background,
    // Keeps the shade and the tick from spilling past the ends of the bar.
    overflow: 'hidden',
  },
  scale: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tint(theme.color.background, 0.45),
  },
  shade: {
    ...StyleSheet.absoluteFillObject,
    // Slightly translucent so the unlit part still hints at the colour beneath.
    backgroundColor: tint(theme.color.background, 0.86),
  },
  hold: {
    position: 'absolute',
    // Sitting one tick-width left means the mark reads as "the level reached
    // here", and silence parks it just out of sight.
    left: -TICK_WIDTH,
    top: 0,
    bottom: 0,
    width: TICK_WIDTH,
    backgroundColor: theme.color.text,
  },
});
