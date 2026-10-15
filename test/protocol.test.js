// -----------------------------------------------------------------------------
// The DiO protocol as pure functions, on the fixtures of the documented
// captures (test/fixtures/dio/).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  KIND,
  classifyMessage,
  kindOf,
  moveRequest,
  openLevelRequest,
  parseDevice,
  parseDeviceState,
  parseLinks,
  parseLoginResponse,
  readStatesRequest,
  socketUrl,
  switchRequest,
} from '../src/dio/protocol.js';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/dio/${name}.json`, import.meta.url), 'utf8'));

test('device types map to the kinds this integration publishes', () => {
  assert.equal(kindOf('.dio1.wifi.shutter.mvt_linear.'), KIND.SHUTTER);
  assert.equal(kindOf('.dio1.wifi.genericSwitch.switch.'), KIND.LIGHT);
  assert.equal(kindOf('.dio1.wifi.plug.switch.'), KIND.PLUG);
  assert.equal(kindOf('.wifi.doorBell.camera.videostream.'), KIND.DOORBELL);
  assert.equal(kindOf('.dio1.camera.unknown'), null);
  assert.equal(kindOf(undefined), null);
});

test('the device list of the account parses, unknown kinds kept with kind null', async () => {
  const { data } = await fixture('devices');
  const devices = data.map(parseDevice);
  assert.deepEqual(
    devices.map((d) => [d.name, d.kind, d.model]),
    [
      ['Volet salon', 'shutter', 'CERSwd-3B'],
      ['Volet chambre', 'shutter', 'CERSwd-3B'],
      ['Plafonnier cuisine', 'light', 'CERNwd-3B'],
      ['Prise congélateur', 'plug', 'DiO plug'],
      ['Sonnette portail', 'doorbell', 'DIOVDP-B03'],
      ['Caméra garage', null, 'CERNwd-3B'],
    ],
  );
  assert.equal(parseDevice({ name: 'no id' }), null);
  assert.equal(parseDevice({ id: '  ' }), null);
  // No name: the model, then the id.
  assert.equal(parseDevice({ id: 'X_1', modelName: 'CERSwd-3B' }).name, 'CERSwd-3B');
  assert.equal(parseDevice({ id: 'X_1' }).name, 'X_1');
});

test('the device states parse from the links', async () => {
  const { data } = await fixture('states');
  const state = (id) => parseDeviceState(data[id]);
  assert.deepEqual(state('L4HActuator_0a1b2c3d4e5f60718293a4b5'), {
    connected: true,
    movement: 'stop',
    position: 75,
    door: false,
  });
  // A module with an old firmware answers null: offline, like the DiO app shows it.
  assert.deepEqual(state('L4HActuator_1b2c3d4e5f60718293a4b5c6'), { connected: false });
  assert.deepEqual(state('L4HActuator_2c3d4e5f60718293a4b5c6d7'), { connected: true, on: true });
  assert.deepEqual(state('L4HActuator_3d4e5f60718293a4b5c6d7e8'), { connected: true, on: false });
  assert.deepEqual(state('Tuya_bf00112233445566778899'), {
    connected: true,
    lastEvent: { type: 'ring', ts: '2026-05-22T08:20:08.667Z' },
  });
});

test('a partial or odd link list never invents a value', () => {
  assert.deepEqual(parseLinks([{ rt: 'oic.r.openlevel', openLevel: 69 }]), { position: 69 });
  assert.deepEqual(parseLinks([{ rt: 'oic.r.openlevel', openLevel: 140 }]), { position: 100 });
  assert.deepEqual(parseLinks([{ rt: 'oic.r.openlevel', openLevel: 'x' }]), {});
  assert.deepEqual(parseLinks([{ rt: 'oic.r.movement.linear', movement: 'sideways' }]), {});
  assert.deepEqual(parseLinks([{ rt: 'oic.r.switch.binary', value: 2 }]), {});
  assert.deepEqual(parseLinks([null, 'x', { rt: 'gw.r.quietmode', value: 1 }]), {});
  // The calibration says whether the module drives a garage door or a gate.
  assert.deepEqual(parseLinks([{ rt: 'gw.r.shutter.calibration', door: true }]), { door: true });
  assert.deepEqual(parseLinks([{ rt: 'gw.r.shutter.calibration', door: 1 }]), {});
  assert.deepEqual(parseLinks(undefined), {});
});

test('the server messages are sorted out', () => {
  assert.deepEqual(classifyMessage({ name: 'connection', action: 'success', data: '' }), {
    kind: 'connection',
    success: true,
  });
  assert.deepEqual(classifyMessage({ name: 'connection', action: 'invalid', data: '' }), {
    kind: 'connection',
    success: false,
  });
  assert.deepEqual(classifyMessage({ id: 8, status: 200 }), {
    kind: 'response',
    id: 8,
    status: 200,
    data: undefined,
  });
  // The logout answer carries a name too.
  assert.equal(
    classifyMessage({ id: 13, status: 200, name: 'disconnection', action: 'success' }).kind,
    'response',
  );
  const pushed = classifyMessage({
    name: 'deviceState',
    action: 'update',
    data: { di: 'L4HActuator_1', rc: 1, links: [{ rt: 'oic.r.openlevel', openLevel: 69 }] },
  });
  assert.deepEqual(pushed, {
    kind: 'state',
    id: 'L4HActuator_1',
    state: { connected: true, position: 69 },
  });
  assert.equal(classifyMessage({ name: 'device', action: 'update', data: {} }).kind, 'other');
  assert.equal(classifyMessage(null).kind, 'other');
});

test('the requests follow the documented paths', () => {
  assert.deepEqual(readStatesRequest(['a', 'b']), {
    method: 'POST',
    path: '/device/states',
    parameters: { devices: ['a', 'b'] },
  });
  assert.deepEqual(moveRequest('L4HActuator_1', 'down'), {
    method: 'POST',
    path: '/device/L4HActuator_1/action/mvtlinear',
    parameters: { movement: 'down' },
  });
  assert.deepEqual(openLevelRequest('L4HActuator_1', 74.6), {
    method: 'POST',
    path: '/device/L4HActuator_1/action/openlevel',
    parameters: { openLevel: 75 },
  });
  assert.deepEqual(switchRequest('L4HActuator_2', true).parameters, { value: 1 });
  assert.deepEqual(switchRequest('L4HActuator_2', false).parameters, { value: 0 });
  assert.throws(() => moveRequest('x', 'left'));
  assert.throws(() => openLevelRequest('x', 101));
  assert.throws(() => openLevelRequest('x', -1));
});

test('the socket URL carries the token only, its colon kept', () => {
  assert.equal(
    socketUrl('r:9deb0bfeb982314029166810e940f3ab'),
    'wss://l4hfront-prod.chacon.cloud/ws?sessionToken=r:9deb0bfeb982314029166810e940f3ab',
  );
  assert.match(socketUrl('r:a&b=c'), /sessionToken=r:a%26b%3Dc$/);
});

test('the login answers are told apart', () => {
  assert.deepEqual(parseLoginResponse(200, { status: 200, data: { sessionToken: 'r:1' } }), {
    token: 'r:1',
  });
  // Wrong password: HTTP 200, status 400 in the body.
  assert.deepEqual(parseLoginResponse(200, { status: 400, data: 'Invalid username/password.' }), {
    rejected: true,
  });
  assert.deepEqual(parseLoginResponse(401, null), { rejected: true });
  assert.ok(parseLoginResponse(503, null).error);
  assert.ok(parseLoginResponse(200, { status: 200, data: {} }).error);
});
