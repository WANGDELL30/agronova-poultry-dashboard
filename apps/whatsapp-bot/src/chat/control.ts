/**
 * Device control is designed but not implemented: the system has no actuators, no command
 * endpoint and no MQTT path (telemetry flows one way, device to API). A control request is
 * recognised here, with fixed rules and before the LLM sees the message, so that the user gets a
 * clear "not available" and the LLM is never in a position to trigger or claim an action.
 *
 * The enabling design (dispatcher, admin role, two-step confirmation, audit log) is in the README.
 */

export interface ControlIntent {
  action: 'on' | 'off' | 'set';
  target: string;
}

const TARGETS =
  'kipas|fan|blower|exhaust|ventilasi|lampu|pemanas|heater|brooder|pompa|pump|sprayer|sprinkler|kabut|fogger|tirai|feeder|pakan otomatis|alarm|sirine|relay';
const ON =
  'nyalakan|nyalain|hidupkan|hidupin|aktifkan|aktifin|jalankan|jalanin|buka|turn on|switch on|start';
const OFF = 'matikan|matiin|nonaktifkan|padamkan|hentikan|stop|tutup|turn off|switch off';
const SET = 'atur|setel|set|ubah|naikkan|turunkan';

const target = new RegExp(`\\b(${TARGETS})\\b`, 'i');
const verbs: ReadonlyArray<[ControlIntent['action'], RegExp]> = [
  ['off', new RegExp(`\\b(${OFF})\\b`, 'i')],
  ['on', new RegExp(`\\b(${ON})\\b`, 'i')],
  ['set', new RegExp(`\\b(${SET})\\b`, 'i')],
];
/** "kipas on", "lampu off". */
const suffix = new RegExp(`\\b(${TARGETS})\\b\\s+(on|off)\\b`, 'i');

/**
 * An imperative verb together with a device name. A question about a device ("apakah kipas
 * menyala?") has no imperative verb and is left to the normal answer path.
 */
export function detectControlIntent(text: string): ControlIntent | null {
  const device = target.exec(text)?.[1]?.toLowerCase();
  if (!device) return null;
  const short = suffix.exec(text);
  if (short) return { action: short[2]?.toLowerCase() === 'on' ? 'on' : 'off', target: device };
  for (const [action, pattern] of verbs) {
    if (pattern.test(text)) return { action, target: device };
  }
  return null;
}

export function controlUnavailableReply(intent: ControlIntent): string {
  return [
    `Kontrol perangkat (${intent.target}) lewat WhatsApp belum tersedia.`,
    'Sistem saat ini hanya membaca data sensor dan kamera; belum ada aktuator yang terhubung.',
    'Tidak ada perintah yang dikirim ke perangkat.',
  ].join(' ');
}
