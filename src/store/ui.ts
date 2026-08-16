import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Frame rates offered for the live preview. Anything above ~15 asks a lot of
 * OBS and the network; the capture loop self-paces, so a rate OBS cannot keep
 * up with simply lands lower than requested rather than breaking.
 */
export const PREVIEW_FPS_CHOICES = [1, 5, 10, 15, 24, 30, 60] as const;

/** `auto` fits the buttons to whatever space is left on screen. */
export type ButtonSize = 'auto' | 's' | 'm' | 'l';
export type PanelSize = 's' | 'm' | 'l';

/**
 * `stacked` runs preview → buttons → audio → health down the screen.
 * `side` puts the preview and the monitoring panels in a left rail with the
 * buttons filling the right — the layout a tablet in landscape wants.
 */
export type DeckLayout = 'stacked' | 'side';

export const BUTTON_SIZE_PX: Record<Exclude<ButtonSize, 'auto'>, number> = {
  s: 74,
  m: 104,
  l: 150,
};

type UiState = {
  /** Live program preview panel on the deck. */
  previewOpen: boolean;
  previewFps: number;
  previewSize: PanelSize;
  /** Audio faders panel on the deck. */
  mixerOpen: boolean;
  /** Deck button sizing. */
  buttonSize: ButtonSize;
  /** OBS health row under the deck. */
  healthVisible: boolean;
  /** How the deck arranges its panels on wide screens. */
  deckLayout: DeckLayout;

  setDeckLayout: (layout: DeckLayout) => void;
  setPreviewOpen: (open: boolean) => void;
  setPreviewFps: (fps: number) => void;
  setPreviewSize: (size: PanelSize) => void;
  setMixerOpen: (open: boolean) => void;
  setButtonSize: (size: ButtonSize) => void;
  setHealthVisible: (visible: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      previewOpen: true,
      previewFps: 5,
      previewSize: 'm' as PanelSize,
      mixerOpen: true,
      buttonSize: 'auto' as ButtonSize,
      healthVisible: true,
      deckLayout: 'side' as DeckLayout,

      setDeckLayout: (deckLayout) => set({ deckLayout }),
      setPreviewOpen: (previewOpen) => set({ previewOpen }),
      setPreviewFps: (previewFps) => set({ previewFps }),
      setPreviewSize: (previewSize) => set({ previewSize }),
      setMixerOpen: (mixerOpen) => set({ mixerOpen }),
      setButtonSize: (buttonSize) => set({ buttonSize }),
      setHealthVisible: (healthVisible) => set({ healthVisible }),
    }),
    {
      name: 'osc.ui',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      // Every version so far only added fields, and persist's default merge
      // fills missing ones from the defaults above. Without a migrate function
      // zustand throws the whole stored blob away on a version bump and logs an
      // error, which is how a version bump silently reset everyone's settings.
      migrate: (persisted) => ({
        ...(persisted as UiState),
        // These monitoring panels are now permanent parts of the deck.
        previewOpen: true,
        mixerOpen: true,
        healthVisible: true,
      }),
    },
  ),
);
