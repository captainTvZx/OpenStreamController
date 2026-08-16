import { OBS_DEFAULT_PORT } from './protocol';

export type ConnectInfo = {
  host: string;
  port: number;
  password?: string;
};

/**
 * Parses the connect string behind the QR code in OBS under
 * Tools → WebSocket Server Settings → Show Connect Info.
 *
 * OBS builds it as `obsws://<ip>:<port>/<percent-encoded password>`, dropping
 * the trailing segment entirely when authentication is disabled. Plain
 * `ws://host:port` and a bare `host:port` are accepted too, so a QR generated
 * by something else still has a chance of working.
 */
export function parseObsConnectString(raw: string): ConnectInfo | null {
  const value = raw.trim();
  if (!value) return null;

  const withScheme = value.match(/^(?:obsws|ws|wss):\/\/(.+)$/i);
  const body = withScheme ? withScheme[1] : /^[^/\s]+:\d+(?:\/.*)?$/.test(value) ? value : null;
  if (!body) return null;

  const separator = body.indexOf('/');
  const address = separator === -1 ? body : body.slice(0, separator);
  const passwordPart = separator === -1 ? '' : body.slice(separator + 1);

  const [host, portText] = splitHostPort(address);
  if (!host) return null;

  const port = portText ? Number(portText) : OBS_DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  let password: string | undefined;
  if (passwordPart) {
    try {
      password = decodeURIComponent(passwordPart);
    } catch {
      // Not valid percent-encoding — take the raw text rather than failing.
      password = passwordPart;
    }
  }

  return { host, port, password };
}

function splitHostPort(address: string): [string, string | undefined] {
  const index = address.lastIndexOf(':');
  if (index === -1) return [address, undefined];
  return [address.slice(0, index), address.slice(index + 1)];
}
