import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useObsStore } from '../obs/obsStore';
import { PreviewStatus, useProgramPreview } from '../obs/useProgramPreview';
import { PREVIEW_FPS_CHOICES, useUiStore } from '../store/ui';
import { fontSize, theme, tint } from './theme';

/** Capture width sent to OBS — a little above display size keeps it crisp. */
const captureWidth = (displayWidth: number) => Math.min(960, Math.max(240, Math.round(displayWidth * 1.5)));

/** Room the scene name and badge need under each box. */
const CAPTION_HEIGHT = 30;
const MIN_BOX_WIDTH = 150;

/**
 * Live view of what OBS is putting out. In studio mode the preview scene is
 * shown alongside the program scene, so you can see what you are cutting to.
 */
export function ProgramPreview({
  width,
  maxHeight,
}: {
  width: number;
  /** Vertical space the whole panel may take, boxes and captions included. */
  maxHeight: number;
}) {
  const isFocused = useIsFocused();
  const connected = useObsStore((state) => state.phase === 'connected');
  const programScene = useObsStore((state) => state.currentProgramScene);
  const previewScene = useObsStore((state) => state.currentPreviewScene);
  const studioMode = useObsStore((state) => state.studioMode);
  const stream = useObsStore((state) => state.stream);
  const record = useObsStore((state) => state.record);

  const fps = useUiStore((state) => state.previewFps);
  const setFps = useUiStore((state) => state.setPreviewFps);

  const showBoth = studioMode && Boolean(previewScene) && previewScene !== programScene;
  const gap = theme.space(2);

  // In studio mode the two boxes sit side by side when there is width for it,
  // which also keeps the panel short. Otherwise they stack.
  const sideBySide = showBoth && width > 420;
  const boxRows = sideBySide || !showBoth ? 1 : 2;
  const widthLimit = sideBySide ? (width - gap) / 2 : width;

  // Fit the boxes into the vertical budget: 16:9 plus the caption underneath.
  const heightPerBox = (maxHeight - gap * (boxRows - 1)) / boxRows - CAPTION_HEIGHT;
  const boxWidth = Math.max(
    MIN_BOX_WIDTH,
    Math.min(widthLimit, Math.floor((heightPerBox * 16) / 9)),
  );

  // Only capture while this screen is actually on top.
  const enabled = connected && isFocused;

  return (
    <View style={{ width }}>
      <View style={styles.headerRow}>
        <Text style={styles.panelTitle}>Live</Text>
        <View style={styles.fpsRow}>
          {PREVIEW_FPS_CHOICES.map((choice) => (
            <Pressable
              key={choice}
              onPress={() => setFps(choice)}
              style={[
                styles.fpsChip,
                fps === choice && {
                  borderColor: theme.color.accent,
                  backgroundColor: tint(theme.color.accent, 0.18),
                },
              ]}
            >
              <Text style={[styles.fpsText, fps === choice && { color: theme.color.text }]}>
                {choice}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.fpsUnit}>fps</Text>
        </View>
      </View>

      <View
        style={[
          styles.boxes,
          { gap, flexDirection: sideBySide ? 'row' : 'column', alignItems: 'center' },
        ]}
      >
        {showBoth ? (
          <PreviewBox
            sourceName={previewScene}
            label="PREVIEW"
            accent={theme.color.good}
            width={boxWidth}
            enabled={enabled}
            fps={fps}
          />
        ) : null}

        <PreviewBox
          sourceName={programScene}
          label={stream.active || record.active ? 'PROGRAM · ON AIR' : 'PROGRAM'}
          accent={stream.active || record.active ? theme.color.live : theme.color.accent}
          width={boxWidth}
          enabled={enabled}
          fps={fps}
        />
      </View>
    </View>
  );
}

function PreviewBox({
  sourceName,
  label,
  accent,
  width,
  enabled,
  fps,
}: {
  sourceName?: string;
  label: string;
  accent: string;
  width: number;
  enabled: boolean;
  fps: number;
}) {
  const { frame, status } = useProgramPreview({
    sourceName,
    enabled,
    fps,
    width: captureWidth(width),
  });

  return (
    <View style={[styles.box, { width, borderColor: accent }]}>
      <View style={[styles.canvas, { height: (width * 9) / 16 }]}>
        {frame ? (
          <Image source={{ uri: frame }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : (
          <Placeholder status={status} />
        )}
      </View>

      <View style={styles.caption}>
        <View style={[styles.badge, { backgroundColor: tint(accent, 0.22), borderColor: accent }]}>
          <Text style={[styles.badgeText, { color: accent }]}>{label}</Text>
        </View>
        <Text style={styles.sceneName} numberOfLines={1}>
          {sourceName ?? '—'}
        </Text>
      </View>
    </View>
  );
}

function Placeholder({ status }: { status: PreviewStatus }) {
  if (status === 'loading') {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={theme.color.textMuted} />
      </View>
    );
  }

  return (
    <View style={styles.placeholder}>
      <Ionicons
        name={status === 'unavailable' ? 'eye-off-outline' : 'tv-outline'}
        size={26}
        color={theme.color.textMuted}
      />
      <Text style={styles.placeholderText}>
        {status === 'unavailable'
          ? 'OBS could not render this scene to an image.'
          : 'Connect to OBS to see the output.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space(2),
    gap: theme.space(2),
  },
  panelTitle: {
    color: theme.color.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  fpsRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1), flexShrink: 1 },
  fpsChip: {
    minWidth: 22,
    alignItems: 'center',
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    paddingHorizontal: theme.space(1.5),
    paddingVertical: 2,
  },
  fpsText: { color: theme.color.textMuted, fontSize: 10, fontWeight: '700' },
  fpsUnit: { color: theme.color.textMuted, fontSize: 10, fontWeight: '700', marginLeft: 2 },
  boxes: { width: '100%', justifyContent: 'center' },
  box: {
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    backgroundColor: theme.color.surface,
  },
  canvas: { width: '100%', backgroundColor: '#000' },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    padding: theme.space(4),
  },
  placeholderText: { color: theme.color.textMuted, fontSize: fontSize.xs, textAlign: 'center' },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    paddingHorizontal: theme.space(2.5),
    paddingVertical: theme.space(2),
  },
  badge: {
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: theme.space(2),
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  sceneName: { flex: 1, color: theme.color.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
});
