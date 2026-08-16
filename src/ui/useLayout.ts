import { useWindowDimensions } from 'react-native';

import type { Orientation } from '../store/decks';

/** Shortest-side breakpoint where a device is treated as a tablet. */
const TABLET_BREAKPOINT = 600;

export type LayoutInfo = {
  width: number;
  height: number;
  orientation: Orientation;
  isLandscape: boolean;
  isTablet: boolean;
  /** True where side-by-side content is worth showing. */
  isWide: boolean;
  /** Column count for card/list grids. */
  listColumns: number;
  /** Width lists are capped at so text does not stretch across a tablet. */
  contentMaxWidth: number;
};

export function useLayout(): LayoutInfo {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= TABLET_BREAKPOINT;
  const isWide = width >= 820;

  return {
    width,
    height,
    orientation: isLandscape ? 'landscape' : 'portrait',
    isLandscape,
    isTablet,
    isWide,
    listColumns: width >= 1100 ? 3 : width >= 700 ? 2 : 1,
    contentMaxWidth: isTablet ? 1100 : width,
  };
}

/** Smallest tile that still reads as a button with a label. */
const MIN_TILE = 54;

export type DeckGrid = { columns: number; tile: number; gridWidth: number; rows: number };

/**
 * Grid geometry for the deck.
 *
 * With a fixed tile size the caller's column count is honoured and the grid
 * scrolls if it runs past the bottom. In auto mode the column count is chosen
 * as well: pinning columns while fitting the height makes the buttons shrink to
 * the width of one column and leaves the rest of the area empty, so the layout
 * that yields the largest tile inside the box wins instead.
 */
export function deckGrid(options: {
  /** Width the grid may use, already excluding padding and any side panel. */
  availableWidth: number;
  /** Height the grid may use. 0 while it is still being measured. */
  height: number;
  /** Column count to use for fixed sizes, and before the height is known. */
  columns: number;
  /** Keep the requested column count instead of choosing a wider/narrower grid. */
  fixedColumns?: boolean;
  count: number;
  gap: number;
  /** Fixed tile size in px, or undefined for auto-fit. */
  fixedTile?: number;
  maxTile?: number;
  /** If true, scrolls horizontally instead of vertically. */
  isHorizontal?: boolean;
}): DeckGrid {
  const { availableWidth, height, columns, count, gap, fixedTile, fixedColumns, maxTile = 190, isHorizontal } = options;

  const measure = (lineCount: number) => {
    if (isHorizontal) {
      const rows = lineCount;
      const columnsFit = Math.max(1, Math.ceil(count / rows));
      const byHeight = (height - gap * (rows - 1)) / rows;
      const byWidth = availableWidth > 0 ? (availableWidth - gap * (columnsFit - 1)) / columnsFit : Number.POSITIVE_INFINITY;
      return { columns: columnsFit, rows, tile: Math.min(byWidth, byHeight, maxTile) };
    } else {
      const columnCount = lineCount;
      const rows = Math.max(1, Math.ceil(count / columnCount));
      const byWidth = (availableWidth - gap * (columnCount - 1)) / columnCount;
      const byHeight = height > 0 ? (height - gap * (rows - 1)) / rows : Number.POSITIVE_INFINITY;
      return { columns: columnCount, rows, tile: Math.min(byWidth, byHeight, maxTile) };
    }
  };

  let chosen: { columns: number; rows: number; tile: number };

  if (fixedTile) {
    if (isHorizontal) {
      let fitRows = Math.floor((height + gap) / (fixedTile + gap));
      fitRows = Math.max(1, fitRows);
      // For horizontal we just use fitRows as the exact count of lines since it's the bounding box
      const actualColumns = Math.max(1, Math.ceil(count / fitRows));
      chosen = {
        columns: actualColumns,
        rows: fitRows,
        tile: Math.min(fixedTile, height > 0 ? height : fixedTile),
      };
    } else {
      let fitColumns = Math.floor((availableWidth + gap) / (fixedTile + gap));
      fitColumns = Math.max(1, fitColumns);
      const actualColumns = Math.min(columns, fitColumns);
      const actualRows = Math.max(1, Math.ceil(count / actualColumns));
      
      chosen = {
        columns: actualColumns,
        rows: actualRows,
        tile: Math.min(fixedTile, availableWidth) 
      };
    }
  } else if (fixedColumns && !isHorizontal) {
    // Decks use an even, percentage-like layout: every populated row has the
    // same width cards and never exceeds the requested column cap.
    chosen = measure(Math.min(columns, Math.max(1, count)));
  } else if (height <= 0 && !isHorizontal) {
    chosen = measure(columns);
  } else if (availableWidth <= 0 && isHorizontal) {
    chosen = measure(columns); // fallback
  } else {
    chosen = measure(1);
    for (let candidate = 2; candidate <= Math.max(1, count); candidate += 1) {
      const fit = measure(candidate);
      const gain = Math.floor(fit.tile) - Math.floor(chosen.tile);
      if (gain > 0) {
        chosen = fit;
        continue;
      }
      if (gain === 0) {
        const chosenEmpty = chosen.columns * chosen.rows - count;
        const candidateEmpty = fit.columns * fit.rows - count;
        if (candidateEmpty < chosenEmpty) {
          chosen = fit;
        } else if (candidateEmpty === chosenEmpty) {
           // For horizontal prefer wider (more columns), for vertical prefer wider (more columns)
           if (fit.columns > chosen.columns) chosen = fit;
        }
      }
    }
  }

  const tile = Math.max(MIN_TILE, Math.floor(chosen.tile));
  const gridWidth = Math.min(tile * chosen.columns + gap * (chosen.columns - 1), availableWidth > 0 && !isHorizontal ? availableWidth : Number.POSITIVE_INFINITY);
  return { columns: chosen.columns, tile, gridWidth, rows: chosen.rows };
}
