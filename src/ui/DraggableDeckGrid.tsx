import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { DeckButton } from '../store/decks';

/**
 * Finger travel before a press turns into a drag. Generous on purpose: with no
 * edit mode to arm it, a press that drifts slightly mid-show must still fire
 * the button rather than rearrange the deck.
 */
const DRAG_THRESHOLD = 24;

type Props = {
  buttons: DeckButton[];
  columns: number;
  tile: number;
  gap: number;
  /** Dragging is only possible while the deck is in edit mode. */
  editing: boolean;
  renderTile: (button: DeckButton, isDragging: boolean) => ReactNode;
  /** Extra slot after the last button, e.g. the "add button" tile. */
  trailing?: ReactNode;
  onReorder: (orderedIds: string[]) => void;
  onDragStateChange?: (dragging: boolean) => void;
  horizontal?: boolean;
  rows?: number;
};

/**
 * Absolutely-positioned deck grid with drag-to-reorder.
 *
 * A single PanResponder sits on the container and only claims the gesture once
 * the finger has actually moved, so taps still reach the buttons underneath and
 * the surrounding ScrollView keeps working until a drag really starts.
 */
export function DraggableDeckGrid({
  buttons,
  columns,
  tile,
  gap,
  editing,
  renderTile,
  trailing,
  onReorder,
  onDragStateChange,
  horizontal,
  rows = 1,
}: Props) {
  const step = tile + gap;

  /** Visual order during a drag; mirrors `buttons` the rest of the time. */
  const [order, setOrder] = useState<string[]>(() => buttons.map((button) => button.id));
  const [dragId, setDragId] = useState<string | null>(null);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  // Mirrors of the state the gesture callbacks need without re-creating them.
  const orderRef = useRef(order);
  const dragIdRef = useRef<string | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const geometryRef = useRef({ step, columns, count: buttons.length, horizontal, rows });

  orderRef.current = order;
  geometryRef.current = { step, columns, count: buttons.length, horizontal, rows };

  useEffect(() => {
    if (dragIdRef.current) return;
    setOrder(buttons.map((button) => button.id));
  }, [buttons]);

  const byId = useMemo(() => {
    const map = new Map<string, DeckButton>();
    buttons.forEach((button) => map.set(button.id, button));
    return map;
  }, [buttons]);

  const slotOf = (index: number) => {
    if (horizontal) {
      return {
        x: Math.floor(index / rows) * step,
        y: (index % rows) * step,
      };
    }
    return {
      x: (index % columns) * step,
      y: Math.floor(index / columns) * step,
    };
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          editing &&
          (Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD),

        onPanResponderGrant: (event, gesture) => {
          const { step: currentStep, columns: currentColumns, count, horizontal: isHoriz, rows: currentRows } = geometryRef.current;
          // Where the finger went down, before it started moving.
          const startX = event.nativeEvent.locationX - gesture.dx;
          const startY = event.nativeEvent.locationY - gesture.dy;
          const column = Math.floor(startX / currentStep);
          const row = Math.floor(startY / currentStep);
          
          let index = 0;
          if (isHoriz) {
            index = column * currentRows + row;
            if (row < 0 || row >= currentRows || index < 0 || index >= count) return;
          } else {
            index = row * currentColumns + column;
            if (column < 0 || column >= currentColumns || index < 0 || index >= count) return;
          }

          const id = orderRef.current[index];
          if (!id) return;

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
          dragIdRef.current = id;
          originRef.current = {
            x: isHoriz ? Math.floor(index / currentRows) * currentStep : (index % currentColumns) * currentStep,
            y: isHoriz ? (index % currentRows) * currentStep : Math.floor(index / currentColumns) * currentStep,
          };
          pan.setValue({ x: 0, y: 0 });
          setDragId(id);
          onDragStateChange?.(true);
        },

        onPanResponderMove: (_event, gesture) => {
          const id = dragIdRef.current;
          if (!id) return;
          pan.setValue({ x: gesture.dx, y: gesture.dy });

          const { step: currentStep, columns: currentColumns, count, horizontal: isHoriz, rows: currentRows } = geometryRef.current;
          // Aim from the centre of the dragged tile rather than the fingertip.
          const centreX = originRef.current.x + gesture.dx + currentStep / 2;
          const centreY = originRef.current.y + gesture.dy + currentStep / 2;
          
          let target = 0;
          if (isHoriz) {
            const column = Math.max(0, Math.floor(centreX / currentStep));
            const row = Math.max(0, Math.min(currentRows - 1, Math.floor(centreY / currentStep)));
            target = Math.max(0, Math.min(count - 1, column * currentRows + row));
          } else {
            const column = Math.max(0, Math.min(currentColumns - 1, Math.floor(centreX / currentStep)));
            const row = Math.max(0, Math.floor(centreY / currentStep));
            target = Math.max(0, Math.min(count - 1, row * currentColumns + column));
          }

          const current = orderRef.current;
          const from = current.indexOf(id);
          if (from === -1 || from === target) return;

          const next = current.slice();
          next.splice(from, 1);
          next.splice(target, 0, id);
          orderRef.current = next;
          Haptics.selectionAsync().catch(() => undefined);
          setOrder(next);
        },

        onPanResponderRelease: () => finishDrag(),
        onPanResponderTerminate: () => finishDrag(),
      }),
    // `editing` is the only value the responder reads directly; everything else
    // goes through refs so the responder is not rebuilt mid-gesture.
    [editing], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const finishDrag = () => {
    const id = dragIdRef.current;
    dragIdRef.current = null;
    pan.setValue({ x: 0, y: 0 });
    setDragId(null);
    onDragStateChange?.(false);
    if (id) onReorder(orderRef.current);
  };

  const calcRows = Math.max(1, Math.ceil((buttons.length + (trailing ? 1 : 0)) / columns));
  const calcCols = Math.max(1, Math.ceil((buttons.length + (trailing ? 1 : 0)) / rows));
  
  const totalHeight = horizontal ? rows * step - gap : calcRows * step - gap;
  const totalWidth = horizontal ? calcCols * step - gap : columns * step - gap;

  return (
    <View
      style={{ width: totalWidth, height: Math.max(totalHeight, tile) }}
      {...responder.panHandlers}
    >
      {order.map((id, index) => {
        const button = byId.get(id);
        if (!button) return null;
        const slot = slotOf(index);
        const isDragging = id === dragId;

        return (
          <Animated.View
            key={id}
            style={[
              styles.tile,
              { left: slot.x, top: slot.y, width: tile, height: tile },
              isDragging && {
                zIndex: 10,
                elevation: 8,
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { scale: 1.06 },
                ],
              },
            ]}
            pointerEvents={dragId && !isDragging ? 'none' : 'auto'}
          >
            {renderTile(button, isDragging)}
          </Animated.View>
        );
      })}

      {trailing ? (
        <View
          style={[
            styles.tile,
            {
              left: slotOf(order.length).x,
              top: slotOf(order.length).y,
              width: tile,
              height: tile,
            },
          ]}
        >
          {trailing}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { position: 'absolute' },
});
