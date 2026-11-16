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

// Keys whose value identifies the account, the device or the network.
const MASKED_KEY =
  /^(n|uid|uuid|owner|user(id)?|email|mail|mac(address)?|ssid|ip|localkey|key|secret|serial(number)?|sn|devid|deviceid|.*token.*|.*password.*)$/i;
const ID_KEY = /^(di|id)$/i;

/**
 * A copy of a raw DiO message, safe to share.
 * @param {unknown} value
 * @param {Map<string, string>} aliases DiO id → alias (`#1`), replaced everywhere
 * @param {string} [key] the key of `value` in its parent
 */
export function sanitize(value, aliases, key = '') {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return MASKED_KEY.test(key) ? '***' : value;
  }
  if (typeof value === 'string') {
    if (MASKED_KEY.test(key)) {
      return '***';
    }
    if (aliases.has(value)) {
      return aliases.get(value);
    }
    if (ID_KEY.test(key)) {
      return '***';
    }
    let text = value;
    for (const [id, alias] of aliases) {
      text = text.split(id).join(alias);
    }
    // A link: its host only (the path and the query may hold ids or a signature).
    text = text.replace(/\b(https?|wss?):\/\/([^/\s?#]+)[^\s"]*/gi, '$1://$2/…');
    return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, aliases));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        sanitize(child, aliases, childKey),
      ]),
    );
  }
  return '?';
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
        lines.push(`#${index + 1} ${dio.name}${model} — ${dio.type || '?'}`);
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
