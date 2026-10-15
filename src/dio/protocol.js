// -----------------------------------------------------------------------------
// The DiO cloud protocol, as pure functions: no network here.
//
// The DiO One app talks to Chacon's cloud (l4hfront-prod.chacon.cloud): a REST
// login returns a session token, then everything goes through ONE WebSocket.
// Requests are `{ method, path, parameters, id }`, answered by `{ id, status,
// data }`; the server also pushes `deviceState` updates on its own (a shutter
// moving, a plug switched from the app or the wall button, a doorbell ring).
// A device state is a list of OCF-style "links", one per resource (`rt`).
//
// The protocol is not published by Chacon. It was documented by the
// dio-chacon-wifi-api project (cnico), whose Protocol.md this module follows;
// that library is GPL-3.0 and was only read, never copied.
// -----------------------------------------------------------------------------

export const DIO_HOST = 'l4hfront-prod.chacon.cloud';
export const LOGIN_URL = `https://${DIO_HOST}/api/session/login`;
export const WS_URL = `wss://${DIO_HOST}/ws`;

/** The device kinds this integration publishes. */
export const KIND = {
  SHUTTER: 'shutter',
  LIGHT: 'light',
  PLUG: 'plug',
  DOORBELL: 'doorbell',
};

// The `type` of a device is a dotted string, e.g. `.dio1.wifi.shutter.mvt_linear.`
// for a REV-SHUTTER, `.dio1.wifi.genericSwitch.switch.` for a REV-LIGHT,
// `.dio1.wifi.plug.switch.` for a plug, `.wifi.doorBell.camera.videostream.`
// for the video doorbell (a Tuya device behind the same cloud).
const TYPE_MARKERS = [
  ['.wifi.shutter.', KIND.SHUTTER],
  ['.wifi.genericSwitch.', KIND.LIGHT],
  ['.wifi.plug.', KIND.PLUG],
  ['.wifi.doorBell.', KIND.DOORBELL],
];

/**
 * @param {unknown} type the DiO `type` string
 * @returns {string|null} one of KIND, null for a device this integration does not know
 */
export function kindOf(type) {
  if (typeof type !== 'string') {
    return null;
  }
  return TYPE_MARKERS.find(([marker]) => type.includes(marker))?.[1] ?? null;
}

const MAX_NAME_LENGTH = 60;

/**
 * One entry of `GET /device`.
 * @returns {{ id: string, name: string, kind: string|null, type: string, model: string, firmware: string }|null}
 *   null when the entry has no usable id
 */
export function parseDevice(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.id.trim() === '') {
    return null;
  }
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const model = text(raw.modelName) || text(raw.defaultName);
  return {
    id: raw.id.trim(),
    name: (text(raw.name) || model || raw.id.trim()).slice(0, MAX_NAME_LENGTH),
    kind: kindOf(raw.type),
    type: text(raw.type),
    model,
    firmware: text(raw.softwareVersion),
  };
}

const MOVEMENTS = ['up', 'down', 'stop'];

/**
 * The known links of a device state, as flat keys. A key is present only when
 * its link is: a pushed update may carry a single link (the open level of a
 * moving shutter), and must not erase the others.
 * @param {unknown} links
 * @returns {{ position?: number, movement?: string, on?: boolean, door?: boolean,
 *   lastEvent?: { type: string, ts: string } }}
 */
export function parseLinks(links) {
  const state = {};
  if (!Array.isArray(links)) {
    return state;
  }
  for (const link of links) {
    if (!link || typeof link !== 'object') {
      continue;
    }
    switch (link.rt) {
      case 'oic.r.openlevel': {
        const level = Number(link.openLevel);
        if (Number.isFinite(level)) {
          state.position = Math.min(100, Math.max(0, Math.round(level)));
        }
        break;
      }
      case 'oic.r.movement.linear':
        if (MOVEMENTS.includes(link.movement)) {
          state.movement = link.movement;
        }
        break;
      case 'oic.r.switch.binary':
        if (link.value === 0 || link.value === 1) {
          state.on = link.value === 1;
        }
        break;
      case 'gw.r.shutter.calibration':
        // The module drives a garage door or a gate, not a shutter.
        if (typeof link.door === 'boolean') {
          state.door = link.door;
        }
        break;
      case 'gw.r.lastEvent':
        if (typeof link.type === 'string' && typeof link.ts === 'string') {
          state.lastEvent = { type: link.type, ts: link.ts };
        }
        break;
      default:
        break;
    }
  }
  return state;
}

/**
 * The state of one device, from `POST /device/states` or a `deviceState` push.
 * `rc` is 1 when the device is connected to the cloud. A device with an old
 * firmware comes back as `null`: the DiO app shows it disconnected.
 */
export function parseDeviceState(data) {
  if (!data || typeof data !== 'object') {
    return { connected: false };
  }
  return { connected: data.rc === 1, ...parseLinks(data.links) };
}

/**
 * A message pushed by the server, sorted out.
 * @returns {{ kind: 'connection', success: boolean }
 *   | { kind: 'response', id: number, status: number, data: unknown }
 *   | { kind: 'state', id: string, state: object }
 *   | { kind: 'other', name: string }}
 */
export function classifyMessage(message) {
  if (!message || typeof message !== 'object') {
    return { kind: 'other', name: 'invalid' };
  }
  if (message.name === 'connection') {
    return { kind: 'connection', success: message.action === 'success' };
  }
  if (message.id !== undefined && message.name === undefined) {
    return { kind: 'response', id: Number(message.id), status: message.status, data: message.data };
  }
  if (
    message.name === 'deviceState' &&
    message.action === 'update' &&
    typeof message.data?.di === 'string'
  ) {
    return { kind: 'state', id: message.data.di, state: parseDeviceState(message.data) };
  }
  if (message.id !== undefined) {
    // e.g. the logout answer, which carries both an id and a name.
    return { kind: 'response', id: Number(message.id), status: message.status, data: message.data };
  }
  return { kind: 'other', name: `${message.name}/${message.action}` };
}

// --- Requests ---------------------------------------------------------------

export const listDevicesRequest = () => ({ method: 'GET', path: '/device', parameters: {} });

export const readStatesRequest = (ids) => ({
  method: 'POST',
  path: '/device/states',
  parameters: { devices: ids },
});

/** @param {'up'|'down'|'stop'} movement */
export function moveRequest(id, movement) {
  if (!MOVEMENTS.includes(movement)) {
    throw new Error(`Unknown shutter movement ${movement}`);
  }
  return {
    method: 'POST',
    path: `/device/${encodeURIComponent(id)}/action/mvtlinear`,
    parameters: { movement },
  };
}

/** @param {number} level 0 (closed) to 100 (open) */
export function openLevelRequest(id, level) {
  const openLevel = Math.round(Number(level));
  if (!Number.isFinite(openLevel) || openLevel < 0 || openLevel > 100) {
    throw new Error(`Shutter position out of range: ${level}`);
  }
  return {
    method: 'POST',
    path: `/device/${encodeURIComponent(id)}/action/openlevel`,
    parameters: { openLevel },
  };
}

export const switchRequest = (id, on) => ({
  method: 'POST',
  path: `/device/${encodeURIComponent(id)}/action/switch`,
  parameters: { value: on ? 1 : 0 },
});

export const logoutRequest = () => ({ method: 'POST', path: '/session/logout', parameters: {} });

/**
 * The WebSocket URL for a session token. The token (`r:` followed by hex)
 * keeps its colon, as the app sends it.
 */
export function socketUrl(token) {
  return `${WS_URL}?sessionToken=${encodeURIComponent(token).replace(/%3A/gi, ':')}`;
}

/**
 * The answer of the REST login.
 * @returns {{ token: string } | { rejected: true } | { error: string }}
 */
export function parseLoginResponse(httpStatus, body) {
  const status = Number(body?.status ?? httpStatus);
  const token = body?.data?.sessionToken;
  if (status === 200 && typeof token === 'string' && token !== '') {
    return { token };
  }
  if ([400, 401, 403, 404].includes(status) || [400, 401, 403].includes(httpStatus)) {
    // Wrong e-mail or password: the cloud answers HTTP 200 with a status 400
    // in the body.
    return { rejected: true };
  }
  return { error: `unexpected login answer (HTTP ${httpStatus}, status ${status})` };
}
