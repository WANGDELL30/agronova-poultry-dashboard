// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\b`, 'i').exec(css);
  if (!match?.[1]) throw new Error(`no hex token --${name}`);
  return match[1];
}

/** WCAG 2.x relative luminance of an opaque #rrggbb colour. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('focus ring (AUDIT D12)', () => {
  it('is an opaque token used by every focus outline', () => {
    const outlines = [...css.matchAll(/outline:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(outlines.filter((value) => value !== 'none')).toEqual(
      expect.arrayContaining(['3px solid var(--focus-ring)']),
    );
    expect(outlines.some((value) => value?.includes('rgba'))).toBe(false);
  });

  it('has at least 3:1 contrast against the light page backgrounds', () => {
    const ring = token('focus-ring');
    for (const background of ['page', 'surface', 'surface-soft', 'surface-green', 'green-soft']) {
      expect(contrast(ring, token(background)), background).toBeGreaterThanOrEqual(3);
    }
  });
});
