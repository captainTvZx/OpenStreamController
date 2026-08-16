import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { obs } from './obsStore';
import { getSourceThumbnail } from './sourceAdmin';

export type PreviewStatus = 'idle' | 'loading' | 'live' | 'unavailable';

/** Give up and show a message after this many failed captures in a row. */
const FAILURE_LIMIT = 3;

/**
 * Streams a scene as a series of JPEG stills.
 *
 * obs-websocket has no video channel, so a live view means asking for
 * screenshots repeatedly. The loop is self-paced: the next capture is only
 * scheduled once the previous one has come back, so a slow OBS or a busy
 * network simply lowers the frame rate instead of queueing requests forever.
 */
export function useProgramPreview({
  sourceName,
  enabled,
  fps,
  width,
}: {
  sourceName?: string;
  enabled: boolean;
  fps: number;
  width: number;
}): { frame: string | null; status: PreviewStatus } {
  const [frame, setFrame] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const failures = useRef(0);

  useEffect(() => {
    if (!enabled || !sourceName) {
      setStatus('idle');
      setFrame(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    failures.current = 0;
    setStatus('loading');

    const capture = async () => {
      if (cancelled) return;

      // Skip work entirely while the app is in the background.
      if (AppState.currentState !== 'active' || !obs.isConnected) {
        timer = setTimeout(capture, 500);
        return;
      }

      const startedAt = Date.now();
      const uri = await getSourceThumbnail(sourceName, width);
      if (cancelled) return;

      if (uri) {
        failures.current = 0;
        setFrame(uri);
        setStatus('live');
      } else {
        failures.current += 1;
        if (failures.current >= FAILURE_LIMIT) {
          setStatus('unavailable');
          setFrame(null);
        }
      }

      // Aim for the requested rate, but never run faster than OBS can answer.
      const elapsed = Date.now() - startedAt;
      timer = setTimeout(capture, Math.max(0, Math.round(1000 / fps) - elapsed));
    };

    capture();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, fps, sourceName, width]);

  return { frame, status };
}
