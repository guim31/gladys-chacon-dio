// -----------------------------------------------------------------------------
// The "Diagnostic" action: what the DiO cloud really says, to be pasted on a
// forum or in a GitHub issue. Read-only, and safe to share: the device ids
// become #1, #2…, identifiers, addresses and tokens are masked, the links
// (snapshot URLs, signed) lose everything after their host.
// -----------------------------------------------------------------------------

import { LANGS, TEXT } from './i18n.js';

/** The pushed messages kept for the diagnostic. */
export const PUSHED_KEPT = 20;
const MAX_STRING = 160;
// A longer string of a pushed message (a picture in base64, say) is not kept.
const MAX_KEPT_STRING = 200;

// Keys whose value identifies the account, the device, the place or the
// network, compared lowercased without `_` and `-`, by their end:
// `ownerEmail`, `mac_address`, `lan_ip`, `homeId`, `local_key`…
const MASKED_ENDINGS = [
  'id',
  'ids',
  'uid',
  'uuid',
  'owner',
  'user',
  'username',
  'login',
  'email',
  'mail',
  'phone',
  'mac',
  'macaddress',
  'macaddr',
  'ip',
  'ipaddr',
  'ipaddress',
  'ssid',
  'bssid',
  'key',
  'secret',
  'password',
  'passwd',
  'token',
  'session',
  'auth',
  'authorization',
  'cookie',
  'sign',
  'signature',
  'serial',
  'serialnumber',
  'lat',
  'latitude',
  'lon',
  'lng',
  'longitude',
];
// `n` is the network name of a module, ending with its MAC (`CERSwd-3B_0A1B2C`).
const MASKED_EXACT = ['n', 'sn', 'di'];

const isMaskedKey = (key) => {
  const name = String(key).toLowerCase().replace(/[_-]/g, '');
  return MASKED_EXACT.includes(name) || MASKED_ENDINGS.some((end) => name.endsWith(end));
};

// Values that identify someone or something whatever their key.
const VALUE_PATTERNS = [
  // Any link: its scheme and host only, never `user:pass@`, never an IP host.
  [
    /\b([a-z][a-z0-9+.-]*):\/\/(?:[^/\s@"]*@)?([^/\s?#"]+)[^\s"]*/gi,
    (_, scheme, host) =>
      /^[\d.:[\]]+$/.test(host) ? `${scheme}://***/…` : `${scheme}://${host}/…`,
  ],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '***'],
  [/\bBearer\s+\S+/gi, 'Bearer ***'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, '***'],
  [/\b([0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi, '***'],
  [/\b(\d{1,3}\.){3}\d{1,3}\b/g, '***'],
  [/\b([0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, '***'],
  // Long tokens mixing letters and digits: Tuya ids, hex keys, serials, base64.
  [/(?=[A-Za-z0-9+/=]*\d)(?=[A-Za-z0-9+/=]*[A-Za-z])[A-Za-z0-9+/=]{16,}/g, '***'],
];

/** A text with the identifying values masked, the known device ids aliased. */
export function maskText(value, aliases = new Map()) {
  let text = value;
  for (const [id, alias] of aliases) {
    text = text.split(id).join(alias);
  }
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  // A default name ends with a part of the MAC (`DIOVDP_0A1B2C3D`).
  text = text.replace(/([A-Za-z][\w]*[_-])(?=[0-9A-Fa-f]*\d)[0-9A-Fa-f]{4,}\b/g, '$1***');
  return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
}

/**
 * A copy of a raw DiO message, safe to share.
 * @param {unknown} value
 * @param {Map<string, string>} aliases DiO id → alias (`#1`), replaced everywhere
 * @param {string} [key] the key of `value` in its parent (an array passes its own on)
 */
export function sanitize(value, aliases, key = '') {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string' && aliases.has(value)) {
    return aliases.get(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, aliases, key));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        sanitize(child, aliases, childKey),
      ]),
    );
  }
  if (isMaskedKey(key)) {
    return '***';
  }
  if (typeof value === 'number') {
    return value;
  }
  return typeof value === 'string' ? maskText(value, aliases) : '?';
}

/**
 * A pushed message as kept in memory: its whole structure, the long strings
 * (a picture in base64, say) replaced by their length.
 */
export function keepable(message) {
  if (typeof message === 'string') {
    return message.length > MAX_KEPT_STRING ? `<${message.length} characters>` : message;
  }
  if (Array.isArray(message)) {
    return message.map(keepable);
  }
  if (message && typeof message === 'object') {
    return Object.fromEntries(
      Object.entries(message).map(([key, value]) => [key, keepable(value)]),
    );
  }
  return message;
}

const clock = (at) => new Date(at).toISOString().replace('T', ' ').slice(0, 19);

/**
 * The text of the report, in the four languages.
 * @param {object} options
 * @param {{ id: string, name: string, kind: string|null, type: string, model: string }[]} options.devices
 * @param {Map<string, unknown>} options.rawStates the raw `/device/states` answer, by id
 * @param {{ at: number, message: unknown }[]} options.pushed the kept pushed messages, oldest first
 * @param {number} options.now
 * @returns {Record<string, string>}
 */
export function buildReport({ devices, rawStates, pushed, now }) {
  const aliases = new Map(devices.map((dio, index) => [dio.id, `#${index + 1}`]));
  const json = (value) => JSON.stringify(sanitize(value, aliases));
  return Object.fromEntries(
    LANGS.map((lang) => {
      const t = TEXT[lang];
      const lines = [`${t.diagTitle} — ${clock(now)} UTC`, ''];
      devices.forEach((dio, index) => {
        const model = dio.model ? ` (${dio.model})` : '';
        // The default name of a module often ends with a part of its MAC.
        lines.push(`#${index + 1} ${maskText(dio.name)}${model} — ${dio.type || '?'}`);
        const raw = rawStates.has(dio.id) ? json(rawStates.get(dio.id)) : t.diagNoState;
        lines.push(`  ${raw}`);
      });
      lines.push('', t.diagPushed(pushed.length));
      if (pushed.length === 0) {
        lines.push(t.diagNoPush);
      }
      for (const entry of pushed) {
        lines.push(`${clock(entry.at)} ${json(entry.message)}`);
      }
      return [lang, lines.join('\n')];
    }),
  );
}
