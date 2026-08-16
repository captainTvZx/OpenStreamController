/**
 * obs-websocket 5.x protocol constants.
 * Reference: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
 */

export const OBS_DEFAULT_PORT = 4455;
export const OBS_RPC_VERSION = 1;

export enum OpCode {
  Hello = 0,
  Identify = 1,
  Identified = 2,
  Reidentify = 3,
  Event = 5,
  Request = 6,
  RequestResponse = 7,
  RequestBatch = 8,
  RequestBatchResponse = 9,
}

export const EventSubscription = {
  None: 0,
  General: 1 << 0,
  Config: 1 << 1,
  Scenes: 1 << 2,
  Inputs: 1 << 3,
  Transitions: 1 << 4,
  Filters: 1 << 5,
  Outputs: 1 << 6,
  SceneItems: 1 << 7,
  MediaInputs: 1 << 8,
  Vendors: 1 << 9,
  Ui: 1 << 10,
  /** Every low-volume category above. */
  All: (1 << 11) - 1,
  InputVolumeMeters: 1 << 16,
  InputActiveStateChanged: 1 << 17,
  InputShowStateChanged: 1 << 18,
  SceneItemTransformChanged: 1 << 19,
} as const;

/** Close codes obs-websocket uses to explain a rejected session. */
export const CloseCode = {
  DontClose: 4000,
  UnknownReason: 4004,
  MessageDecodeError: 4002,
  MissingDataField: 4003,
  InvalidDataFieldType: 4005,
  InvalidDataFieldValue: 4006,
  UnknownOpCode: 4007,
  NotIdentified: 4008,
  AuthenticationFailed: 4009,
  UnsupportedRpcVersion: 4010,
  SessionInvalidated: 4011,
  UnsupportedFeature: 4012,
} as const;

export function describeCloseCode(code?: number): string | undefined {
  switch (code) {
    case CloseCode.AuthenticationFailed:
      return 'Wrong password.';
    case CloseCode.UnsupportedRpcVersion:
      return 'OBS is too old for this app. Update OBS to 28 or newer.';
    case CloseCode.SessionInvalidated:
      return 'OBS closed the session.';
    case CloseCode.NotIdentified:
      return 'Handshake failed before identifying.';
    case undefined:
      return undefined;
    default:
      return code >= 4000 ? `OBS closed the connection (code ${code}).` : undefined;
  }
}

export type HelloMessage = {
  obsWebSocketVersion: string;
  rpcVersion: number;
  authentication?: { challenge: string; salt: string };
};

export type IdentifiedMessage = {
  negotiatedRpcVersion: number;
};

export type RequestStatus = {
  result: boolean;
  code: number;
  comment?: string;
};

/** Thrown when OBS accepts the request but reports a failure status. */
export class ObsRequestError extends Error {
  readonly code: number;
  readonly requestType: string;

  constructor(requestType: string, status: RequestStatus) {
    super(status.comment || `${requestType} failed (code ${status.code})`);
    this.name = 'ObsRequestError';
    this.code = status.code;
    this.requestType = requestType;
  }
}
