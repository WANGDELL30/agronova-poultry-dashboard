import { describe, expect, it } from 'vitest';

import { controlUnavailableReply, detectControlIntent } from './control.js';

describe('detectControlIntent', () => {
  it.each([
    ['nyalakan kipas kandang 1', 'on', 'kipas'],
    ['tolong matikan lampu', 'off', 'lampu'],
    ['Kipas ON', 'on', 'kipas'],
    ['pompa off dong', 'off', 'pompa'],
    ['turn off the heater', 'off', 'heater'],
    ['atur kipas ke 50%', 'set', 'kipas'],
  ] as const)('recognises "%s"', (text, action, target) => {
    expect(detectControlIntent(text)).toEqual({ action, target });
  });

  it.each([
    'gimana kondisi kandang?',
    'apakah kipas menyala?',
    'suhu sekarang berapa',
    'matikan notifikasi',
    'lampunya terang?',
  ])('leaves "%s" to the normal answer path', (text) => {
    expect(detectControlIntent(text)).toBeNull();
  });

  it('answers that nothing was sent to any device', () => {
    const reply = controlUnavailableReply({ action: 'on', target: 'kipas' });
    expect(reply).toContain('belum tersedia');
    expect(reply).toContain('Tidak ada perintah yang dikirim');
  });
});
