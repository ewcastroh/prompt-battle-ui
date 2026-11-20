import { en, es } from '../../../testing/transloco-testing';

/** Same check as scripts/check-i18n-keys.mjs (which also runs in CI), kept in the unit suite. */
function flatten(
  node: object,
  prefix = '',
  out = new Map<string, unknown>(),
): Map<string, unknown> {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out.set(path, value);
    }
  }
  return out;
}

const params = (text: unknown) =>
  [...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort();

describe('translation files (es.json / en.json)', () => {
  const esKeys = flatten(es);
  const enKeys = flatten(en);

  it('have identical keys', () => {
    expect([...enKeys.keys()].sort()).toEqual([...esKeys.keys()].sort());
  });

  it('have only non-empty string values', () => {
    for (const [file, keys] of [
      ['es', esKeys],
      ['en', enKeys],
    ] as const) {
      for (const [key, value] of keys) {
        expect(typeof value === 'string' && value.trim() !== '', `${file}: ${key}`).toBe(true);
      }
    }
  });

  it('use the same interpolation params for each key', () => {
    for (const [key, value] of esKeys) {
      expect(params(enKeys.get(key)), key).toEqual(params(value));
    }
  });
});
