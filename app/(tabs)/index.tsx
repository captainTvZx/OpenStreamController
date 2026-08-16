import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isActionActive, runAction, subtitleFor } from '../../src/actions/actions';
import { useObsStore } from '../../src/obs/obsStore';
import { buildDeckFromObs, DeckButton, useDeckStore } from '../../src/store/decks';
import { BUTTON_SIZE_PX, PanelSize, useUiStore } from '../../src/store/ui';
import { DeckButtonTile } from '../../src/ui/DeckButtonTile';
import { DraggableDeckGrid } from '../../src/ui/DraggableDeckGrid';
import { EmptyState, PrimaryButton } from '../../src/ui/components';
import { HealthFooter } from '../../src/ui/HealthFooter';
import { MixerPanel } from '../../src/ui/MixerPanel';
import { ProgramPreview } from '../../src/ui/ProgramPreview';
import { PromptDialog } from '../../src/ui/PromptDialog';
import { ScenesPanel } from '../../src/ui/ScenesPanel';
import { StatusBarStrip } from '../../src/ui/StatusBarStrip';
import { deckGrid, useLayout } from '../../src/ui/useLayout';
import { fontSize, theme, tint } from '../../src/ui/theme';

const GAP = theme.space(2.5);
const PADDING = theme.space(3);
/** Breathing room under the last row, inside the grid's scroll view. */
const GRID_BOTTOM_PADDING = theme.space(3);

/**
 * Stacked layout: how much of the screen height the preview may claim. Sizing
 * by height keeps the buttons' share of the screen predictable.
 */
const PREVIEW_HEIGHT_SHARE: Record<PanelSize, number> = { s: 0.2, m: 0.3, l: 0.42 };

/** Side layout: width of the left rail as a share of the screen — L is half. */
const RAIL_WIDTH_SHARE: Record<PanelSize, number> = { s: 0.34, m: 0.42, l: 0.5 };

type Prompt =
  | { kind: 'renameDeck'; deckId: string; current: string }
  | { kind: 'newDeck'; suggestion: string }
  | null;

export default function DeckScreen() {
  const router = useRouter();
  const layout = useLayout();

  const decks = useDeckStore((state) => state.decks);
  const activeDeckId = useDeckStore((state) => state.activeDeckId);
  const deck = useMemo(
    () => decks.find((candidate) => candidate.id === activeDeckId) ?? decks[0],
    [decks, activeDeckId],
  );

  const connected = useObsStore((state) => state.phase === 'connected');
  const obsState = useObsStore();

  // The scene, audio and health panels are always on screen now, so only the
  // preview's size preference is still read here.
  const previewSize = useUiStore((state) => state.previewSize);

  const [busyButtonId, setBusyButtonId] = useState<string | null>(null);
  const [failedButtonId, setFailedButtonId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [dragging, setDragging] = useState(false);
  /**
   * The box the grid actually got, measured after layout. Deriving it from the
   * screen width instead means double-counting padding and gaps, which sizes
   * the tiles too large and clips the last column.
   */
  const [gridArea, setGridArea] = useState({ width: 0, height: 0 });

  // Source-toggle buttons need the item list of the scenes they point at.
  useEffect(() => {
    if (!connected || !deck) return;
    const scenes = new Set(
      deck.buttons
        .map((button) => (button.action.type === 'toggleSource' ? button.action.sceneName : null))
        .filter((name): name is string => Boolean(name)),
    );
    scenes.forEach((sceneName) => {
      if (!obsState.sceneItems[sceneName]) {
        useObsStore.getState().loadSceneItems(sceneName).catch(() => undefined);
      }
    });
  }, [connected, deck, obsState.sceneItems]);

  // The "add" tile is always on screen, so it always counts towards the grid.
  // Counting it only while editing made the whole deck reflow on entering edit
  // mode, which is exactly the jump this avoids.
  const buttonCount = (deck?.buttons.length ?? 0) + 1;

  const contentWidth = layout.width - PADDING * 2;
  // The rail exists to hold the big scene: without a preview it would just be
  // empty space stealing width from the buttons. Narrow screens always stack.
  // Wide screens always use the side-by-side workspace. Narrow devices fall
  // back to the stacked layout only because there is no usable second column.
  const sideLayout = layout.isWide;
  // User explicitly requested 50-50 split, so we enforce 0.5 here regardless of previewSize.
  const railWidth = Math.round(layout.width * 0.5);
  const previewMaxHeight = Math.round(layout.height * PREVIEW_HEIGHT_SHARE[previewSize]);
  // In stacked mode Live, deck, Scenes and Audio no longer compete for one
  // viewport. The body scrolls while Health stays anchored below it.
  const stackedGridHeight = Math.max(440, Math.round(layout.height * 0.68));

  // Everything inside the grid's scroll view sits within its padding.
  const availableWidth =
    gridArea.width > 0
      ? gridArea.width - PADDING * 2
      : (sideLayout ? contentWidth - railWidth : contentWidth) - PADDING * 2;
  const topBlockHeight = gridArea.height > 0 ? (gridArea.height - PADDING) / 2 : 0;
  const availableHeight = topBlockHeight > 0 ? topBlockHeight - GRID_BOTTOM_PADDING : 0;

  // Compute tile size based on available width, letting it fill as many buttons as fit per row
  const { tile, columns: gridColumns, rows: gridRows } = deckGrid({
      availableWidth,
      height: availableHeight,
      // Use buttonCount as max columns to allow more buttons per row
      columns: 5,
      count: Math.max(1, buttonCount),
      gap: GAP,
      fixedColumns: true,
      maxTile: layout.isTablet ? 220 : 120,
    });
  // Let the section below follow the actual grid rather than an arbitrary
  // half-screen split. The parent gap supplies the consistent breathing room.
  const gridContentHeight = gridRows * tile + Math.max(0, gridRows - 1) * GAP;

  const measureGridArea = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    // Ignore sub-pixel jitter so this never ping-pongs with the tile size.
    if (Math.abs(width - gridArea.width) > 2 || Math.abs(height - gridArea.height) > 2) {
      setGridArea({ width: Math.floor(width), height: Math.floor(height) });
    }
  };

  const handlePress = useCallback(
    async (button: DeckButton) => {
      if (!connected) {
        Alert.alert('Not connected', 'Connect to a computer running OBS first.');
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      setBusyButtonId(button.id);
      try {
        await runAction(button.action);
        setFailedButtonId(null);
      } catch (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        setFailedButtonId(button.id);
        setTimeout(() => setFailedButtonId((current) => (current === button.id ? null : current)), 1500);
        Alert.alert(button.label, error instanceof Error ? error.message : String(error));
      } finally {
        setBusyButtonId(null);
      }
    },
    [connected],
  );

  /** Long press is how a button gets edited now that there is no edit mode. */
  const handleLongPress = useCallback(
    (button: DeckButton) => {
      if (!deck) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      router.push({ pathname: '/button/[id]', params: { id: button.id, deckId: deck.id } });
    },
    [deck, router],
  );

  const generateFromObs = useCallback(() => {
    const state = useObsStore.getState();
    if (!state.scenes.length) {
      Alert.alert('Nothing to import', 'Connect to OBS first so the scenes can be read.');
      return;
    }
    useDeckStore.getState().addDeck(buildDeckFromObs(state.scenes, state.audioInputs, 'OBS'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

  const deleteDeck = useCallback((deckId: string, name: string) => {
    Alert.alert('Delete deck', `Delete “${name}” and its buttons?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => useDeckStore.getState().removeDeck(deckId),
      },
    ]);
  }, []);

  const openDeckMenu = useCallback(
    (deckId: string, name: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      Alert.alert(name, 'Deck options', [
        { text: 'Rename', onPress: () => setPrompt({ kind: 'renameDeck', deckId, current: name }) },
        { text: 'Duplicate', onPress: () => useDeckStore.getState().duplicateDeck(deckId) },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDeck(deckId, name) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [deleteDeck],
  );

  const submitPrompt = (value: string) => {
    if (!prompt) return;
    if (prompt.kind === 'renameDeck') {
      useDeckStore.getState().renameDeck(prompt.deckId, value);
    } else {
      const created = useDeckStore.getState().addDeck();
      useDeckStore.getState().renameDeck(created.id, value);
    }
    setPrompt(null);
  };

  const reorder = (orderedIds: string[]) => {
    if (!deck) return;
    useDeckStore.getState().reorderButtons(deck.id, orderedIds);
  };

  const gridBlock = (
    <View
      style={[
        styles.gridArea,
        !sideLayout && { height: stackedGridHeight, flex: 0 },
        { gap: PADDING },
      ]}
      onLayout={measureGridArea}
    >
      <View
        style={[
          styles.deckPanel,
          {
          height: deck && deck.buttons.length > 0 ? gridContentHeight + PADDING * 2 : undefined,
          flex: deck && deck.buttons.length > 0 ? undefined : 1,
          },
        ]}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.gridScroll} showsVerticalScrollIndicator={false}>
          {deck && deck.buttons.length === 0 ? (
            <EmptyState
              icon="grid-outline"
              title="This deck is empty"
              description="Add buttons one by one, or generate a deck from the scenes already in OBS."
              action={
                <View style={{ gap: theme.space(2) }}>
                  <PrimaryButton
                    label="Add button"
                    icon="add"
                    onPress={() =>
                      router.push({ pathname: '/button/[id]', params: { id: 'new', deckId: deck.id } })
                    }
                  />
                  <PrimaryButton
                    label="Generate from OBS"
                    icon="sparkles"
                    variant="ghost"
                    onPress={generateFromObs}
                  />
                </View>
              }
            />
          ) : null}
          {/* Button grid */}
          {deck && deck.buttons.length > 0 ? (
            <DraggableDeckGrid
              buttons={deck.buttons}
              columns={gridColumns}
              rows={gridRows}
              tile={tile}
              gap={GAP}
              // Reordering is always available; it takes a deliberate drag to
              // start, so an ordinary press still just fires the button.
              editing
              onReorder={reorder}
              onDragStateChange={setDragging}
              trailing={
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/button/[id]', params: { id: 'new', deckId: deck.id } })
                  }
                  style={[styles.addTile, { width: tile, height: tile }]}
                >
                  <Ionicons name="add" size={Math.min(28, tile * 0.3)} color={theme.color.accent} />
                </Pressable>
              }
              renderTile={(button, isDragging) => (
                <DeckButtonTile
                  button={button}
                  size={tile}
                  subtitle={subtitleFor(button.action, obsState)}
                  active={isActionActive(button.action, obsState) === true}
                  busy={busyButtonId === button.id}
                  failed={failedButtonId === button.id}
                  disabled={!connected}
                  onPress={() => handlePress(button)}
                  onLongPress={() => handleLongPress(button)}
                />
              )}
            />
          ) : null}
        </ScrollView>
      </View>
      <View style={styles.scenesPanel}>
        <ScenesPanel />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBarStrip />

      <View style={styles.deckBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deckChips}>
          {decks.map((candidate) => {
            const selected = candidate.id === deck?.id;
            return (
              <Pressable
                key={candidate.id}
                onPress={() => useDeckStore.getState().setActiveDeck(candidate.id)}
                onLongPress={() => openDeckMenu(candidate.id, candidate.name)}
                delayLongPress={350}
                style={[
                  styles.deckChip,
                  selected && {
                    borderColor: theme.color.accent,
                    backgroundColor: tint(theme.color.accent, 0.15),
                  },
                ]}
              >
                <Text style={[styles.deckChipText, selected && { color: theme.color.text }]}>
                  {candidate.name}
                </Text>
                {selected ? (
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={13}
                    color={theme.color.accent}
                    onPress={() => openDeckMenu(candidate.id, candidate.name)}
                  />
                ) : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setPrompt({ kind: 'newDeck', suggestion: `Deck ${decks.length + 1}` })}
            style={styles.deckChip}
          >
            <Ionicons name="add" size={15} color={theme.color.textMuted} />
          </Pressable>
        </ScrollView>

      </View>

      {sideLayout ? (
        /* Left rail holds the scene and the faders; the right side is all buttons. */
        <View style={styles.sideLayout}>
          <View style={{ width: '50%', paddingRight: theme.space(1.5) }}>
            <View style={{ flex: 1, gap: PADDING }}>
              <View style={styles.panelFrame}>
                <ProgramPreview width={contentWidth / 2 - theme.space(1.5) - PADDING * 2} maxHeight={Math.round(layout.height * 0.55)} />
              </View>
              <View style={[styles.panelFrame, { flex: 1 }]}>
                <MixerPanel style={{ flex: 1 }} width={contentWidth / 2 - theme.space(1.5) - PADDING * 2} columns={2} compact title="Audio" />
              </View>
            </View>
          </View>

          <View style={{ width: '50%', paddingLeft: theme.space(1.5) }}>
            {gridBlock}
          </View>
        </View>
      ) : (
        /* Stacked panels scroll together; the health strip remains below. */
        <ScrollView style={styles.stackedScroll} contentContainerStyle={styles.stackedContent}>
          <View style={styles.previewBlock}>
            <View style={styles.panelFrame}>
              <ProgramPreview width={contentWidth - PADDING * 2} maxHeight={previewMaxHeight} />
            </View>
          </View>

          {gridBlock}

          <View style={styles.bottomPanel}>
            <View style={styles.panelFrame}>
              <MixerPanel width={contentWidth - PADDING * 2} columns={layout.isWide ? 4 : 2} compact title="Audio" />
            </View>
          </View>
        </ScrollView>
      )}

      {/* Health always spans the full width along the bottom of the screen. */}
      <View style={styles.healthBar}>
        <HealthFooter width={contentWidth} />
      </View>

      <PromptDialog
        visible={prompt !== null}
        title={prompt?.kind === 'renameDeck' ? 'Rename deck' : 'New deck'}
        description={prompt?.kind === 'renameDeck' ? undefined : 'Decks keep separate button layouts.'}
        placeholder="Deck name"
        initialValue={prompt?.kind === 'renameDeck' ? prompt.current : prompt?.suggestion ?? ''}
        confirmLabel={prompt?.kind === 'renameDeck' ? 'Rename' : 'Create'}
        onCancel={() => setPrompt(null)}
        onSubmit={submitPrompt}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.background },
  deckBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PADDING,
    paddingVertical: theme.space(1.5),
    gap: theme.space(1.5),
  },
  deckChips: { gap: theme.space(1.5), paddingRight: theme.space(1.5), alignItems: 'center' },
  deckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1),
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    paddingHorizontal: theme.space(2.5),
    paddingVertical: theme.space(1),
    minHeight: 28,
  },
  deckChipText: { color: theme.color.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  previewBlock: { paddingHorizontal: PADDING, marginBottom: PADDING },
  stackedScroll: { flex: 1 },
  stackedContent: { paddingBottom: PADDING },
  sideLayout: { flex: 1, flexDirection: 'row', paddingHorizontal: PADDING, paddingBottom: PADDING },
  healthBar: { paddingHorizontal: PADDING, paddingBottom: PADDING },
  gridArea: { flex: 1 },
  deckPanel: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: PADDING,
    overflow: 'hidden',
  },
  panelFrame: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: PADDING,
    overflow: 'hidden',
  },
  gridScroll: {
    paddingHorizontal: 0,
    paddingBottom: GRID_BOTTOM_PADDING,
    alignItems: 'flex-start',
  },
  addTile: {
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
    borderColor: theme.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scenesPanel: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  bottomPanel: { paddingHorizontal: PADDING, paddingBottom: theme.space(1) },
});
