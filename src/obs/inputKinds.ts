/**
 * Human labels and the handful of settings worth exposing per source kind.
 *
 * OBS has dozens of input kinds with hundreds of settings between them; the app
 * surfaces the fields people actually change mid-stream (headline text, a
 * browser URL, an image path) and leaves everything else to the raw JSON editor.
 */

export type EditableField = {
  /** Key inside the source's inputSettings object. */
  key: string;
  label: string;
  hint?: string;
  type: 'text' | 'multiline' | 'url' | 'number' | 'color';
};

const KIND_LABELS: Record<string, string> = {
  browser_source: 'Browser',
  color_source_v3: 'Colour',
  color_source_v2: 'Colour',
  image_source: 'Image',
  ffmpeg_source: 'Media',
  vlc_source: 'VLC playlist',
  text_gdiplus_v2: 'Text (GDI+)',
  text_gdiplus_v3: 'Text (GDI+)',
  text_ft2_source_v2: 'Text (FreeType)',
  monitor_capture: 'Display capture',
  window_capture: 'Window capture',
  game_capture: 'Game capture',
  dshow_input: 'Camera',
  av_capture_input_v2: 'Camera',
  wasapi_input_capture: 'Mic / Aux',
  wasapi_output_capture: 'Desktop audio',
  wasapi_process_output_capture: 'Application audio',
  coreaudio_input_capture: 'Mic / Aux',
  coreaudio_output_capture: 'Desktop audio',
  scene: 'Scene',
  group: 'Group',
};

/** Turns `wasapi_output_capture` into something readable. */
export function inputKindLabel(kind?: string): string {
  if (!kind) return 'Source';
  return (
    KIND_LABELS[kind] ??
    kind
      .replace(/_v\d+$/, '')
      .replace(/_/g, ' ')
      .replace(/^\w/, (character) => character.toUpperCase())
  );
}

/**
 * Mixer icon for an audio source. A microphone and the desktop output are very
 * different things to mute by accident, so they must not look alike.
 */
export function audioIconFor(input: { inputKind: string; special?: 'desktop' | 'mic' }): {
  on: string;
  off: string;
} {
  const kind = input.inputKind ?? '';

  // Desktop / application output capture: sound coming *out* of the computer.
  if (input.special === 'desktop' || kind.includes('output_capture')) {
    return { on: 'volume-high', off: 'volume-mute' };
  }

  // Microphones and line inputs: sound going *into* OBS from a device.
  if (input.special === 'mic' || kind.includes('input_capture') || kind === 'audio_line') {
    return { on: 'mic', off: 'mic-off' };
  }

  // Everything else with an audio track — browser, media and VLC sources.
  return { on: 'musical-notes', off: 'volume-mute' };
}

export function editableFieldsFor(kind?: string): EditableField[] {
  if (!kind) return [];

  if (kind.startsWith('text_')) {
    return [
      {
        key: 'text',
        label: 'Text',
        type: 'multiline',
        hint: 'Shown live — handy for lower thirds and “be right back” cards.',
      },
    ];
  }

  switch (kind) {
    case 'browser_source':
      return [
        { key: 'url', label: 'URL', type: 'url' },
        { key: 'width', label: 'Width', type: 'number' },
        { key: 'height', label: 'Height', type: 'number' },
      ];
    case 'image_source':
      return [{ key: 'file', label: 'Image file', type: 'text', hint: 'Full path on the computer running OBS.' }];
    case 'ffmpeg_source':
      return [{ key: 'local_file', label: 'Media file', type: 'text', hint: 'Full path on the computer running OBS.' }];
    case 'color_source_v3':
    case 'color_source_v2':
      return [{ key: 'color', label: 'Colour', type: 'color' }];
    default:
      return [];
  }
}

/**
 * OBS stores colours as an unsigned integer laid out as 0xAABBGGRR — the byte
 * order is reversed compared with the usual #RRGGBB.
 */
export function hexToObsColor(hex: string): number {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  // >>> 0 keeps it an unsigned 32-bit value rather than a negative number.
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function obsColorToHex(color: number): string {
  const r = color & 0xff;
  const g = (color >> 8) & 0xff;
  const b = (color >> 16) & 0xff;
  const pair = (channel: number) => channel.toString(16).padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}
