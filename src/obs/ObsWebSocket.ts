import * as Crypto from 'expo-crypto';

import {
  describeCloseCode,
  EventSubscription,
  HelloMessage,
  IdentifiedMessage,
  ObsRequestError,
  OBS_RPC_VERSION,
  OpCode,
  RequestStatus,
} from './protocol';

export type ClientStatus = 'disconnected' | 'connecting' | 'connected';

type EventListener = (eventType: string, eventData: Record<string, any>) => void;
type CloseListener = (info: { code?: number; reason?: string; wasIntentional: boolean }) => void;

type PendingRequest = {
  resolve: (data: Record<string, any>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  requestType: string;
};

const CONNECT_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 10000;

/** base64(sha256(value)) — the digest shape obs-websocket uses for auth. */
async function sha256Base64(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
}

/**
 * Minimal obs-websocket 5.x client built on the React Native WebSocket global.
 *
 * obs-websocket-js is not used on purpose: it pulls in Node crypto/ws shims that
 * do not exist in Hermes. The handshake here is small enough to own.
 */
export class ObsWebSocket {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventListeners = new Set<EventListener>();
  private closeListeners = new Set<CloseListener>();
  private nextRequestId = 1;
  private intentionalClose = false;

  status: ClientStatus = 'disconnected';
  obsWebSocketVersion?: string;
  negotiatedRpcVersion?: number;

  get isConnected(): boolean {
    return this.status === 'connected';
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  /**
   * Opens the socket and completes the Hello → Identify → Identified handshake.
   * Resolves once OBS has accepted the session.
   */
  connect(
    url: string,
    password?: string,
    eventSubscriptions: number = EventSubscription.All,
  ): Promise<void> {
    this.disconnect();
    this.intentionalClose = false;
    this.status = 'connecting';

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          this.status = 'disconnected';
          // Leave no half-open socket behind on a failed handshake.
          if (this.ws === ws) this.ws = null;
          try {
            ws.close();
          } catch {
            /* already closing */
          }
          reject(error);
        } else {
          this.status = 'connected';
          resolve();
        }
      };

      const timer = setTimeout(
        () => finish(new Error('Timed out reaching OBS. Check the IP address and that OBS is running.')),
        CONNECT_TIMEOUT_MS,
      );

      try {
        ws = new WebSocket(url);
      } catch (error) {
        clearTimeout(timer);
        this.status = 'disconnected';
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      this.ws = ws;

      ws.onmessage = (message: WebSocketMessageEvent) => {
        let payload: { op: number; d: any };
        try {
          payload = JSON.parse(String(message.data));
        } catch {
          return;
        }

        if (payload.op === OpCode.Hello) {
          this.handleHello(ws, payload.d as HelloMessage, password, eventSubscriptions).catch((error) =>
            finish(error instanceof Error ? error : new Error(String(error))),
          );
          return;
        }

        if (payload.op === OpCode.Identified) {
          const data = payload.d as IdentifiedMessage;
          this.negotiatedRpcVersion = data.negotiatedRpcVersion;
          finish();
          return;
        }

        this.handleMessage(payload);
      };

      ws.onerror = () => {
        // RN gives no useful detail here; the close handler carries the code.
        finish(new Error('Could not reach OBS. Check the IP address, port and Wi-Fi network.'));
      };

      ws.onclose = (event: WebSocketCloseEvent) => {
        const reason = describeCloseCode(event?.code) ?? event?.reason;
        finish(new Error(reason || 'OBS closed the connection.'));
        this.handleClose(ws, event);
      };
    });
  }

  private async handleHello(
    ws: WebSocket,
    hello: HelloMessage,
    password: string | undefined,
    eventSubscriptions: number,
  ): Promise<void> {
    this.obsWebSocketVersion = hello.obsWebSocketVersion;

    const identify: Record<string, unknown> = {
      rpcVersion: OBS_RPC_VERSION,
      eventSubscriptions,
    };

    if (hello.authentication) {
      if (!password) {
        throw new Error('This OBS requires a password. Add it to the connection.');
      }
      const { challenge, salt } = hello.authentication;
      const secret = await sha256Base64(password + salt);
      identify.authentication = await sha256Base64(secret + challenge);
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op: OpCode.Identify, d: identify }));
    }
  }

  private handleMessage(payload: { op: number; d: any }): void {
    if (payload.op === OpCode.Event) {
      const { eventType, eventData } = payload.d;
      this.eventListeners.forEach((listener) => listener(eventType, eventData ?? {}));
      return;
    }

    if (payload.op === OpCode.RequestResponse) {
      const { requestId, requestType, requestStatus, responseData } = payload.d as {
        requestId: string;
        requestType: string;
        requestStatus: RequestStatus;
        responseData?: Record<string, any>;
      };
      const pending = this.pending.get(requestId);
      if (!pending) return;
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      if (requestStatus.result) {
        pending.resolve(responseData ?? {});
      } else {
        pending.reject(new ObsRequestError(requestType, requestStatus));
      }
      return;
    }

    if (payload.op === OpCode.RequestBatchResponse) {
      const { requestId, results } = payload.d as { requestId: string; results: any[] };
      const pending = this.pending.get(requestId);
      if (!pending) return;
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      pending.resolve({ results });
    }
  }

  private handleClose(ws: WebSocket, event?: WebSocketCloseEvent): void {
    if (this.ws !== ws) return;
    this.ws = null;
    const wasConnected = this.status !== 'disconnected';
    this.status = 'disconnected';
    this.failAllPending(new Error('Connection to OBS was lost.'));
    if (!wasConnected) return;
    const info = {
      code: event?.code,
      reason: describeCloseCode(event?.code) ?? event?.reason,
      wasIntentional: this.intentionalClose,
    };
    this.closeListeners.forEach((listener) => listener(info));
  }

  private failAllPending(error: Error): void {
    this.pending.forEach((request) => {
      clearTimeout(request.timer);
      request.reject(error);
    });
    this.pending.clear();
  }

  /** Sends a single request and resolves with its responseData. */
  call<T extends Record<string, any> = Record<string, any>>(
    requestType: string,
    requestData?: Record<string, unknown>,
  ): Promise<T> {
    const ws = this.ws;
    if (!ws || this.status !== 'connected') {
      return Promise.reject(new Error('Not connected to OBS.'));
    }

    const requestId = String(this.nextRequestId++);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${requestType} timed out.`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(requestId, {
        resolve: resolve as (data: Record<string, any>) => void,
        reject,
        timer,
        requestType,
      });

      try {
        ws.send(
          JSON.stringify({
            op: OpCode.Request,
            d: { requestType, requestId, requestData },
          }),
        );
      } catch (error) {
        this.pending.delete(requestId);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Swaps the event subscription mask on the live session (OpCode 3) instead of
   * reconnecting. Used to switch the high-volume meter events on and off.
   */
  setEventSubscriptions(eventSubscriptions: number): void {
    const ws = this.ws;
    if (!ws || this.status !== 'connected') return;
    try {
      ws.send(JSON.stringify({ op: OpCode.Reidentify, d: { eventSubscriptions } }));
    } catch {
      /* the close handler deals with a dead socket */
    }
  }

  /** Fire-and-forget variant for UI taps where a failure only needs logging. */
  send(requestType: string, requestData?: Record<string, unknown>): void {
    this.call(requestType, requestData).catch(() => {
      /* surfaced through state polling instead */
    });
  }

  /** Runs several requests in one round trip. Results keep the input order. */
  async callBatch(
    requests: { requestType: string; requestData?: Record<string, unknown> }[],
    haltOnFailure = false,
  ): Promise<({ status: RequestStatus; data: Record<string, any> })[]> {
    const ws = this.ws;
    if (!ws || this.status !== 'connected') {
      throw new Error('Not connected to OBS.');
    }

    const requestId = String(this.nextRequestId++);
    const response = await new Promise<{ results: any[] }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Batch request timed out.'));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(requestId, {
        resolve: resolve as (data: Record<string, any>) => void,
        reject,
        timer,
        requestType: 'RequestBatch',
      });

      ws.send(
        JSON.stringify({
          op: OpCode.RequestBatch,
          d: {
            requestId,
            haltOnFailure,
            requests: requests.map((request, index) => ({
              requestType: request.requestType,
              requestId: `${requestId}:${index}`,
              requestData: request.requestData,
            })),
          },
        }),
      );
    });

    return (response.results ?? []).map((result) => ({
      status: result.requestStatus as RequestStatus,
      data: (result.responseData ?? {}) as Record<string, any>,
    }));
  }

  disconnect(): void {
    const ws = this.ws;
    this.intentionalClose = true;
    this.failAllPending(new Error('Disconnected.'));
    this.status = 'disconnected';
    this.ws = null;
    if (!ws) return;
    ws.onmessage = null as any;
    ws.onerror = null as any;
    ws.onclose = null as any;
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }
}
