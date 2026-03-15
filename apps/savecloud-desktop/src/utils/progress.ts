/** Formatea velocidad en bytes/segundo a string legible (KB/s, MB/s). */
export function formatSpeed(bps: number | null): string {
  if (bps == null || bps <= 0) return "—";
  const mbps = bps / (1024 * 1024);
  if (mbps < 1) {
    const kbps = bps / 1024;
    return `${kbps.toFixed(1)} KB/s`;
  }
  return `${mbps.toFixed(1)} MB/s`;
}

/** Formatea un ETA en segundos a string legible (Xm Ys). */
export function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${rem}s`;
}
