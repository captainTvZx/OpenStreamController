import * as Network from 'expo-network';

import { OBS_DEFAULT_PORT, OpCode } from './protocol';

export type DiscoveredHost = {
  host: string;
  port: number;
  obsWebSocketVersion: string;
  requiresPassword: boolean;
};

export type ScanProgress = {
  scanned: number;
  total: number;
  found: DiscoveredHost[];
};

const PROBE_TIMEOUT_MS = 1200;
const CONCURRENCY = 24;

/** Returns the device's /24 prefix, e.g. "192.168.1." */
export async function getSubnetPrefix(): Promise<string | undefined> {
  try {
    const ip = await Network.getIpAddressAsync();
    if (!ip || ip === '0.0.0.0') return undefined;
    const parts = ip.split('.');
    if (parts.length !== 4) return undefined;
    return `${parts[0]}.${parts[1]}.${parts[2]}.`;
  } catch {
    return undefined;
  }
}

/**
 * Opens a socket and waits for the obs-websocket Hello frame. Anything that is
 * not OBS either refuses the connection or fails to greet us in time.
 */
export function probeHost(host: string, port = OBS_DEFAULT_PORT): Promise<DiscoveredHost | null> {
  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket;

    const finish = (result: DiscoveredHost | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* nothing to close */
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

    try {
      ws = new WebSocket(`ws://${host}:${port}`);
    } catch {
      clearTimeout(timer);
      resolve(null);
      return;
    }

    ws.onmessage = (message: WebSocketMessageEvent) => {
      try {
        const payload = JSON.parse(String(message.data));
        if (payload.op === OpCode.Hello) {
          finish({
            host,
            port,
            obsWebSocketVersion: payload.d?.obsWebSocketVersion ?? 'unknown',
            requiresPassword: Boolean(payload.d?.authentication),
          });
          return;
        }
      } catch {
        /* not obs-websocket */
      }
      finish(null);
    };

    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
  });
}

/**
 * Sweeps the local /24 for OBS instances. `onProgress` fires as hosts complete
 * so the UI can show results while the scan is still running.
 */
export async function scanLocalNetwork(options: {
  port?: number;
  prefix?: string;
  onProgress?: (progress: ScanProgress) => void;
  shouldStop?: () => boolean;
}): Promise<DiscoveredHost[]> {
  const port = options.port ?? OBS_DEFAULT_PORT;
  const prefix = options.prefix ?? (await getSubnetPrefix());
  if (!prefix) throw new Error('Could not read this device’s Wi-Fi address. Enter the IP manually.');

  const hosts = Array.from({ length: 254 }, (_, index) => `${prefix}${index + 1}`);
  const found: DiscoveredHost[] = [];
  let scanned = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < hosts.length) {
      if (options.shouldStop?.()) return;
      const host = hosts[cursor++];
      const result = await probeHost(host, port);
      scanned += 1;
      if (result) found.push(result);
      options.onProgress?.({ scanned, total: hosts.length, found: [...found] });
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return found;
}
