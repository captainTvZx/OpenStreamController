import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { AudioInput, Scene } from '../obs/types';
import { DeckAction, defaultVisualsFor } from '../actions/actions';

export type DeckButton = {
  id: string;
  label: string;
  /** Ionicons glyph name. */
  icon: string;
  color: string;
  action: DeckAction;
};

export type Deck = {
  id: string;
  name: string;
  /** Columns while the device is upright. */
  columns: number;
  /** Columns while the device is on its side — the main tablet layout. */
  landscapeColumns: number;
  buttons: DeckButton[];
};

export type Orientation = 'portrait' | 'landscape';

export const columnsFor = (deck: Deck, orientation: Orientation) =>
  orientation === 'landscape' ? deck.landscapeColumns ?? deck.columns + 2 : deck.columns;

const createId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function makeButton(action: DeckAction, overrides: Partial<DeckButton> = {}): DeckButton {
  const visuals = defaultVisualsFor(action);
  return {
    id: createId(),
    label: visuals.label,
    icon: visuals.icon,
    color: visuals.color,
    action,
    ...overrides,
  };
}

/** The deck a fresh install starts with, before OBS is reachable. */
export function makeStarterDeck(name = 'Main'): Deck {
  return {
    id: createId(),
    name,
    columns: 3,
    landscapeColumns: 5,
    buttons: [
      makeButton({ type: 'toggleStream' }),
      makeButton({ type: 'toggleRecord' }),
      makeButton({ type: 'pauseRecord' }),
      makeButton({ type: 'toggleVirtualCam' }),
      makeButton({ type: 'toggleReplayBuffer' }),
      makeButton({ type: 'saveReplay' }),
      makeButton({ type: 'toggleStudioMode' }),
      makeButton({ type: 'studioTransition' }),
    ],
  };
}

/**
 * Builds a deck from what OBS actually has: every scene, then the usual
 * broadcast controls, then a mute button per audio input.
 */
export function buildDeckFromObs(scenes: Scene[], audioInputs: AudioInput[], name = 'OBS'): Deck {
  const sceneButtons = scenes.map((scene) =>
    makeButton({ type: 'scene', sceneName: scene.sceneName }, { label: scene.sceneName }),
  );
  const muteButtons = audioInputs.map((input) =>
    makeButton({ type: 'toggleMute', inputName: input.inputName }, { label: input.inputName }),
  );

  return {
    id: createId(),
    name,
    columns: 3,
    landscapeColumns: 5,
    buttons: [
      ...sceneButtons,
      makeButton({ type: 'toggleStream' }),
      makeButton({ type: 'toggleRecord' }),
      makeButton({ type: 'pauseRecord' }),
      makeButton({ type: 'toggleVirtualCam' }),
      makeButton({ type: 'toggleReplayBuffer' }),
      makeButton({ type: 'saveReplay' }),
      ...muteButtons,
    ],
  };
}

type DeckStoreState = {
  decks: Deck[];
  activeDeckId?: string;
  hydrated: boolean;

  activeDeck: () => Deck | undefined;
  deckById: (id: string) => Deck | undefined;
  setActiveDeck: (id: string) => void;
  addDeck: (deck?: Deck) => Deck;
  replaceDeck: (deck: Deck) => void;
  renameDeck: (id: string, name: string) => void;
  duplicateDeck: (id: string) => Deck | undefined;
  setColumns: (id: string, columns: number, orientation: Orientation) => void;
  removeDeck: (id: string) => void;

  addButton: (deckId: string, button: DeckButton) => void;
  updateButton: (deckId: string, buttonId: string, patch: Partial<DeckButton>) => void;
  removeButton: (deckId: string, buttonId: string) => void;
  moveButton: (deckId: string, buttonId: string, direction: -1 | 1) => void;
  reorderButtons: (deckId: string, orderedIds: string[]) => void;
};

export const useDeckStore = create<DeckStoreState>()(
  persist(
    (set, get) => ({
      decks: [],
      activeDeckId: undefined,
      hydrated: false,

      activeDeck: () => {
        const { decks, activeDeckId } = get();
        return decks.find((deck) => deck.id === activeDeckId) ?? decks[0];
      },

      deckById: (id) => get().decks.find((deck) => deck.id === id),

      setActiveDeck: (id) => set({ activeDeckId: id }),

      addDeck(deck) {
        const created = deck ?? makeStarterDeck(`Deck ${get().decks.length + 1}`);
        set((state) => ({ decks: [...state.decks, created], activeDeckId: created.id }));
        return created;
      },

      replaceDeck(deck) {
        set((state) => ({
          decks: state.decks.map((existing) => (existing.id === deck.id ? deck : existing)),
        }));
      },

      renameDeck(id, name) {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((state) => ({
          decks: state.decks.map((deck) => (deck.id === id ? { ...deck, name: trimmed } : deck)),
        }));
      },

      duplicateDeck(id) {
        const source = get().decks.find((deck) => deck.id === id);
        if (!source) return undefined;
        const copy: Deck = {
          ...source,
          id: createId(),
          name: `${source.name} copy`,
          buttons: source.buttons.map((button) => ({ ...button, id: createId() })),
        };
        set((state) => ({ decks: [...state.decks, copy], activeDeckId: copy.id }));
        return copy;
      },

      setColumns(id, columns, orientation) {
        const clamped = Math.min(8, Math.max(2, columns));
        set((state) => ({
          decks: state.decks.map((deck) =>
            deck.id === id
              ? { ...deck, ...(orientation === 'landscape' ? { landscapeColumns: clamped } : { columns: clamped }) }
              : deck,
          ),
        }));
      },

      removeDeck(id) {
        set((state) => {
          const decks = state.decks.filter((deck) => deck.id !== id);
          return {
            decks,
            activeDeckId: state.activeDeckId === id ? decks[0]?.id : state.activeDeckId,
          };
        });
      },

      addButton(deckId, button) {
        set((state) => ({
          decks: state.decks.map((deck) =>
            deck.id === deckId ? { ...deck, buttons: [...deck.buttons, button] } : deck,
          ),
        }));
      },

      updateButton(deckId, buttonId, patch) {
        set((state) => ({
          decks: state.decks.map((deck) =>
            deck.id === deckId
              ? {
                  ...deck,
                  buttons: deck.buttons.map((button) =>
                    button.id === buttonId ? { ...button, ...patch } : button,
                  ),
                }
              : deck,
          ),
        }));
      },

      removeButton(deckId, buttonId) {
        set((state) => ({
          decks: state.decks.map((deck) =>
            deck.id === deckId
              ? { ...deck, buttons: deck.buttons.filter((button) => button.id !== buttonId) }
              : deck,
          ),
        }));
      },

      reorderButtons(deckId, orderedIds) {
        set((state) => ({
          decks: state.decks.map((deck) => {
            if (deck.id !== deckId) return deck;
            const byId = new Map(deck.buttons.map((button) => [button.id, button]));
            const reordered = orderedIds
              .map((id) => byId.get(id))
              .filter((button): button is DeckButton => Boolean(button));
            // Anything the caller did not mention keeps its place at the end,
            // so a stale id list can never drop buttons.
            const missing = deck.buttons.filter((button) => !orderedIds.includes(button.id));
            return { ...deck, buttons: [...reordered, ...missing] };
          }),
        }));
      },

      moveButton(deckId, buttonId, direction) {
        set((state) => ({
          decks: state.decks.map((deck) => {
            if (deck.id !== deckId) return deck;
            const index = deck.buttons.findIndex((button) => button.id === buttonId);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= deck.buttons.length) return deck;
            const buttons = deck.buttons.slice();
            [buttons[index], buttons[target]] = [buttons[target], buttons[index]];
            return { ...deck, buttons };
          }),
        }));
      },
    }),
    {
      name: 'osc.decks',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ decks: state.decks, activeDeckId: state.activeDeckId }),
      // v1 decks only had a single column count; give them a wider landscape grid.
      migrate: (persisted: any, version) => {
        if (version >= 2 || !persisted) return persisted;
        return {
          ...persisted,
          decks: (persisted.decks ?? []).map((deck: Deck) => ({
            ...deck,
            landscapeColumns: Math.min(8, (deck.columns ?? 3) + 2),
          })),
        };
      },
      onRehydrateStorage: () => () => {
        // Never show an empty first run: seed a deck if storage had none.
        if (useDeckStore.getState().decks.length === 0) {
          const starter = makeStarterDeck();
          useDeckStore.setState({ decks: [starter], activeDeckId: starter.id });
        }
        useDeckStore.setState({ hydrated: true });
      },
    },
  ),
);
