import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { OBS_DEFAULT_PORT } from '../obs/protocol';

export type SavedConnection = {
  id: string;
  name: string;
  host: string;
  port: number;
  /** wss:// instead of ws:// — only needed behind a TLS proxy. */
  useTls: boolean;
  autoReconnect: boolean;
  lastUsedAt?: number;
};

export type ConnectionDraft = Omit<SavedConnection, 'id' | 'lastUsedAt'> & { password?: string };

export const connectionUrl = (connection: Pick<SavedConnection, 'host' | 'port' | 'useTls'>) =>
  `${connection.useTls ? 'wss' : 'ws'}://${connection.host}:${connection.port}`;

export const newConnectionDraft = (): ConnectionDraft => ({
  name: '',
  host: '',
  port: OBS_DEFAULT_PORT,
  useTls: false,
  autoReconnect: true,
  password: '',
});

/**
 * Passwords never enter the persisted JSON blob; they live in the OS keychain /
 * Android keystore, keyed by connection id.
 */
const passwordKey = (id: string) => `osc_password_${id.replace(/[^A-Za-z0-9._-]/g, '')}`;

const createId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

type ConnectionStoreState = {
  connections: SavedConnection[];
  lastConnectionId?: string;
  hydrated: boolean;

  byId: (id: string) => SavedConnection | undefined;
  add: (draft: ConnectionDraft) => Promise<SavedConnection>;
  update: (id: string, draft: Partial<ConnectionDraft>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  markUsed: (id: string) => void;
  getPassword: (id: string) => Promise<string | undefined>;
  setPassword: (id: string, password?: string) => Promise<void>;
};

export const useConnectionStore = create<ConnectionStoreState>()(
  persist(
    (set, get) => ({
      connections: [],
      lastConnectionId: undefined,
      hydrated: false,

      byId: (id) => get().connections.find((connection) => connection.id === id),

      async add(draft) {
        const connection: SavedConnection = {
          id: createId(),
          name: draft.name.trim() || draft.host,
          host: draft.host.trim(),
          port: draft.port || OBS_DEFAULT_PORT,
          useTls: draft.useTls,
          autoReconnect: draft.autoReconnect,
        };
        set((state) => ({ connections: [...state.connections, connection] }));
        await get().setPassword(connection.id, draft.password);
        return connection;
      },

      async update(id, draft) {
        set((state) => ({
          connections: state.connections.map((connection) =>
            connection.id === id
              ? {
                  ...connection,
                  ...('name' in draft ? { name: (draft.name ?? '').trim() || connection.host } : {}),
                  ...('host' in draft ? { host: (draft.host ?? '').trim() } : {}),
                  ...('port' in draft ? { port: draft.port || OBS_DEFAULT_PORT } : {}),
                  ...('useTls' in draft ? { useTls: Boolean(draft.useTls) } : {}),
                  ...('autoReconnect' in draft ? { autoReconnect: Boolean(draft.autoReconnect) } : {}),
                }
              : connection,
          ),
        }));
        if ('password' in draft) {
          await get().setPassword(id, draft.password);
        }
      },

      async remove(id) {
        set((state) => ({
          connections: state.connections.filter((connection) => connection.id !== id),
          lastConnectionId: state.lastConnectionId === id ? undefined : state.lastConnectionId,
        }));
        await get().setPassword(id, undefined);
      },

      markUsed(id) {
        set((state) => ({
          lastConnectionId: id,
          connections: state.connections.map((connection) =>
            connection.id === id ? { ...connection, lastUsedAt: Date.now() } : connection,
          ),
        }));
      },

      async getPassword(id) {
        try {
          const value = await SecureStore.getItemAsync(passwordKey(id));
          return value ?? undefined;
        } catch {
          return undefined;
        }
      },

      async setPassword(id, password) {
        try {
          if (password) {
            await SecureStore.setItemAsync(passwordKey(id), password);
          } else {
            await SecureStore.deleteItemAsync(passwordKey(id));
          }
        } catch {
          /* keychain unavailable (e.g. web) — the app still works without a saved password */
        }
      },
    }),
    {
      name: 'osc.connections',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Present before it is needed: without a migrate, any future version bump
      // would discard every saved computer and log an error instead.
      migrate: (persisted) => persisted as ConnectionStoreState,
      partialize: (state) => ({
        connections: state.connections,
        lastConnectionId: state.lastConnectionId,
      }),
      onRehydrateStorage: () => () => {
        useConnectionStore.setState({ hydrated: true });
      },
    },
  ),
);
