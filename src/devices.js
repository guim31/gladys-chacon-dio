// -----------------------------------------------------------------------------
// The Gladys devices: one per DiO equipment, built from the device list of the
// cloud, and the states and commands of their features.
//
// External ids are `gladys.externalIds(kind, dioId)`: the DiO id (e.g.
// `L4HActuator_…`) is the cloud id of the module, it never changes, the name
// does (the user renames it in the app).
//
// | DiO device             | Gladys feature(s)                                      |
// | ---------------------- | ------------------------------------------------------ |
// | REV-SHUTTER (shutter)  | shutter/position 0-100 % (100 = open), shutter/state   |
// | REV-LIGHT (light)      | light/binary                                           |
// | plug                   | switch/binary                                          |
// | video doorbell         | doorbell/ring (a 1 then 0 pulse at each ring)          |
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORY,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { KIND } from './dio/protocol.js';
import { NAMES } from './i18n.js';

/** Feature keys: part of the external ids, never to be renamed. */
export const FEATURE = {
  POSITION: 'position',
  MOVEMENT: 'movement',
  POWER: 'power',
  RING: 'ring',
};

// Gladys' cover state: the value of the open / stop / close buttons.
export const COVER_STATE = { OPEN: 1, STOP: 0, CLOSE: -1 };

const MOVEMENT_TO_STATE = { up: COVER_STATE.OPEN, stop: COVER_STATE.STOP, down: COVER_STATE.CLOSE };
const STATE_TO_MOVEMENT = { 1: 'up', 0: 'stop', '-1': 'down' };

export const SUPPORTED_KINDS = Object.values(KIND);

// A garage door or a gate wired to a shutter module, recognized by its name
// when the module does not say it (the `door` flag of its calibration).
// "porte" and "door" are left out on purpose: "Volet porte-fenêtre" and
// "patio door" are shutters. A false positive only makes a shutter read-only.
const DOOR_NAME =
  /(gara[gj]|portail|portillon|(?<!\p{L})gates?(?!\p{L})|verja|cancela|port[oó]n|tor(?!\p{L}))/iu;

/**
 * Is this shutter module a garage door or a gate?
 * @param {{ kind: string, name: string }} dio
 * @param {{ door?: boolean }|undefined} state its last known state
 */
export function isDoor(dio, state) {
  return dio.kind === KIND.SHUTTER && (state?.door === true || DOOR_NAME.test(dio.name));
}

const feature = (ids, key, name, fields) => ({
  name,
  external_id: ids.feature(key),
  ...fields,
});

/**
 * The Gladys device of one DiO device.
 * @param {object} gladys GladysIntegration
 * @param {{ id: string, name: string, kind: string, model: string }} dio a parsed DiO device
 * @param {string} language the language of the feature names
 * @param {{ readOnly?: boolean }} [options] read-only: a garage door or a gate whose
 *   control is not allowed in the configuration
 * @returns {object|null} null for a kind this integration does not publish
 */
export function buildDevice(gladys, dio, language, { readOnly = false } = {}) {
  const ids = gladys.externalIds(dio.kind, dio.id);
  const names = NAMES[language] ?? NAMES.fr;
  let features;
  switch (dio.kind) {
    case KIND.SHUTTER:
      features = [
        feature(ids, FEATURE.POSITION, names.position, {
          category: CATEGORY.SHUTTER,
          type: TYPE.SHUTTER.POSITION,
          unit: UNIT.PERCENT,
          min: 0,
          max: 100,
          read_only: readOnly,
          has_feedback: true,
        }),
        feature(ids, FEATURE.MOVEMENT, names.movement, {
          category: CATEGORY.SHUTTER,
          type: TYPE.SHUTTER.STATE,
          min: -1,
          max: 1,
          read_only: readOnly,
          has_feedback: true,
        }),
      ];
      break;
    case KIND.LIGHT:
      features = [
        feature(ids, FEATURE.POWER, names.light, {
          category: CATEGORY.LIGHT,
          type: TYPE.LIGHT.BINARY,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
        }),
      ];
      break;
    case KIND.PLUG:
      features = [
        feature(ids, FEATURE.POWER, names.plug, {
          category: CATEGORY.SWITCH,
          type: TYPE.SWITCH.BINARY,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
        }),
      ];
      break;
    case KIND.DOORBELL:
      features = [
        feature(ids, FEATURE.RING, names.ring, {
          category: CATEGORY.DOORBELL,
          type: TYPE.DOORBELL.RING,
          min: 0,
          max: 1,
          read_only: true,
          has_feedback: false,
        }),
      ];
      break;
    default:
      return null;
  }
  return {
    name: dio.name,
    external_id: ids.device,
    model: dio.model || undefined,
    // The container refreshes the devices itself (src/poller.js); the core's
    // poll, once a minute, is the fallback (GladysAssistant/Gladys#3198).
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features,
  };
}

/**
 * The feature states of a device for its DiO state. Only what the state
 * carries: a pushed update may hold the position of a shutter alone. The
 * doorbell ring is a pulse, published apart (see app.js).
 * @returns {{ device_feature_external_id: string, state: number }[]}
 */
export function statesOf(gladys, dio, state) {
  const ids = gladys.externalIds(dio.kind, dio.id);
  const states = [];
  const push = (key, value) =>
    states.push({ device_feature_external_id: ids.feature(key), state: value });
  switch (dio.kind) {
    case KIND.SHUTTER:
      if (state.position !== undefined) {
        push(FEATURE.POSITION, state.position);
      }
      if (state.movement !== undefined) {
        push(FEATURE.MOVEMENT, MOVEMENT_TO_STATE[state.movement]);
      }
      break;
    case KIND.LIGHT:
    case KIND.PLUG:
      if (state.on !== undefined) {
        push(FEATURE.POWER, state.on ? 1 : 0);
      }
      break;
    default:
      break;
  }
  return states;
}

/**
 * Which feature of which device a feature external id is.
 * @returns {{ kind: string, dioId: string, key: string }|null}
 */
export function parseFeatureExternalId(gladys, externalId) {
  const prefix = gladys.externalId('');
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const parts = externalId.slice(prefix.length).split(':');
  if (parts.length !== 3 || !SUPPORTED_KINDS.includes(parts[0])) {
    return null;
  }
  return { kind: parts[0], dioId: parts[1], key: parts[2] };
}

/**
 * Parse the device part of a device external id.
 * @returns {{ kind: string, dioId: string }|null}
 */
export function parseDeviceExternalId(gladys, externalId) {
  const prefix = gladys.externalId('');
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const parts = externalId.slice(prefix.length).split(':');
  if (parts.length !== 2 || !SUPPORTED_KINDS.includes(parts[0])) {
    return null;
  }
  return { kind: parts[0], dioId: parts[1] };
}

/**
 * What a command means for the DiO cloud.
 * @param {{ kind: string, key: string }} target
 * @param {number} value the value sent by Gladys
 * @returns {{ action: 'move', movement: string } | { action: 'level', level: number }
 *   | { action: 'switch', on: boolean }}
 */
export function commandFor(target, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid value ${value}`);
  }
  if (target.kind === KIND.SHUTTER && target.key === FEATURE.MOVEMENT) {
    const movement = STATE_TO_MOVEMENT[String(Math.round(number))];
    if (!movement) {
      throw new Error(`Invalid shutter command ${value}`);
    }
    return { action: 'move', movement };
  }
  if (target.kind === KIND.SHUTTER && target.key === FEATURE.POSITION) {
    if (number < 0 || number > 100) {
      throw new Error(`Shutter position out of range: ${value}`);
    }
    return { action: 'level', level: Math.round(number) };
  }
  if ((target.kind === KIND.LIGHT || target.kind === KIND.PLUG) && target.key === FEATURE.POWER) {
    return { action: 'switch', on: number >= 1 };
  }
  throw new Error(`The feature ${target.kind}/${target.key} cannot be controlled`);
}
