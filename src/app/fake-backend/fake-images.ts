/**
 * Deterministic placeholder images for the fake backend: a small SVG data URI derived from a seed
 * string, so the same prompt always gives the same picture. Dev only.
 */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function fakeImage(seed: string, label: string): string {
  const h = hashString(seed);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 80)) % 360;
  const cx = 20 + (h % 60);
  const cy = 20 + ((h >>> 8) % 60);
  const r = 12 + ((h >>> 16) % 20);
  const text = label.slice(0, 18).replace(/[<>&"']/g, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" fill="hsl(${hue} 55% 45%)"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hue2} 70% 70%)"/>` +
    `<rect x="0" y="82" width="100" height="18" fill="rgb(0 0 0 / 0.55)"/>` +
    `<text x="50" y="94" font-family="monospace" font-size="7" fill="white" text-anchor="middle">${text}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
