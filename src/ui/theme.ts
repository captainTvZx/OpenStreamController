export const theme = {
  color: {
    background: '#0B0D12',
    surface: '#151922',
    surfaceRaised: '#1C222E',
    border: '#272E3C',
    text: '#E8ECF3',
    textMuted: '#8B93A5',
    accent: '#4C8DFF',
    live: '#FF4757',
    record: '#FF6B35',
    good: '#2ED573',
    warn: '#FFC048',
  },
  radius: { sm: 8, md: 12, lg: 18, pill: 999 },
  space: (n: number) => n * 4,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
} as const;

/** Mixes a hex color with the app background — used for tinted button faces. */
export function tint(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
