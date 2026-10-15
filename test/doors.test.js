// -----------------------------------------------------------------------------
// Garage doors and gates on a shutter module: opening one from afar is
// unlocking a door. Read-only by default, recognized by the `door` flag of the
// module's calibration or by its name; never moved by the "all shutters"
// scene action or widget, even when their control is allowed.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDoor } from '../src/devices.js';
import { CREDENTIALS, createWorld, until } from './helpers/world.js';

const GARAGE = 'L4HActuator_6a7b8c9d0e1f2a3b4c5d6e7f';
const PORTAIL = 'L4HActuator_7b8c9d0e1f2a3b4c5d6e7f80';
const SALON = 'L4HActuator_0a1b2c3d4e5f60718293a4b5';

/** A shutter module of the account, with its state. */
function addModule(dio, id, name, { door = false } = {}) {
  dio.devices.push({
    id,
    name,
    modelName: 'CERSwd-3B',
    softwareVersion: '1.0.6',
    type: '.dio1.wifi.shutter.mvt_linear.',
  });
  dio.states[id] = {
    rc: 1,
    di: id,
    links: [
      { rt: 'oic.r.movement.linear', movement: 'stop' },
      { rt: 'oic.r.openlevel', openLevel: 0 },
      { rt: 'gw.r.shutter.calibration', up_ms: 18000, down_ms: 17500, door },
    ],
  };
}

async function doorWorld(t, config = CREDENTIALS) {
  const world = await createWorld({ config, connect: false });
  t.after(() => world.stop());
  // "Garage" by its calibration flag, "Entrée" (a gate) by its name only.
  addModule(world.dio, GARAGE, 'Entrée voitures', { door: true });
  addModule(world.dio, PORTAIL, 'Portail');
  await world.gladys.connect();
  await until(() => world.gladys.fake.discoveredDevices.length > 0);
  await world.add();
  await until(() => world.gladys.fake.states.length > 0);
  return world;
}

const readOnly = (device) => device.features.map((feature) => feature.read_only);

test('a door is recognized by the calibration flag or by its name, not by "porte"', () => {
  const shutter = (name) => ({ kind: 'shutter', name });
  assert.equal(isDoor(shutter('Entrée voitures'), { door: true }), true);
  for (const name of [
    'Garage',
    'Porte de garage',
    'Portail',
    'Portillon',
    'Garagentor',
    'Hoftor',
    'Gate',
    'Puerta del garaje',
    'Verja',
    'Portón',
  ]) {
    assert.equal(isDoor(shutter(name), {}), true, name);
  }
  for (const name of [
    'Volet porte-fenêtre',
    'Volet salon',
    'Patio door',
    'Rollladen Küche',
    'Store terrasse',
    'Persiana puerta balcón',
  ]) {
    assert.equal(isDoor(shutter(name), { door: false }), false, name);
  }
  // Only shutter modules: a plug named "Garage" is a plug.
  assert.equal(isDoor({ kind: 'plug', name: 'Prise garage' }, {}), false);
});

test('by default, doors and gates are read-only and refuse every command', async (t) => {
  const world = await doorWorld(t);
  const fake = world.gladys.fake;
  assert.deepEqual(readOnly(world.device('Entrée voitures')), [true, true]);
  assert.deepEqual(readOnly(world.device('Portail')), [true, true]);
  assert.deepEqual(readOnly(world.device('Volet salon')), [false, false]);
  // Their position is still followed.
  assert.equal(fake.lastState(`ext:test-integration:shutter:${GARAGE}:position`), 0);

  for (const [name, key, value] of [
    ['Entrée voitures', 'movement', 1],
    ['Entrée voitures', 'position', 100],
    ['Portail', 'movement', 1],
  ]) {
    const ack = await fake.setValue(world.device(name), world.feature(name, key), value);
    assert.equal(ack.success, false, `${name} ${key}`);
    assert.match(ack.error, /Garage door or gate/);
  }
  assert.ok(!world.dio.requests.some((r) => r.path.includes(GARAGE) || r.path.includes(PORTAIL)));
  assert.ok(world.logger.at('info').includes('"Portail" is a garage door or a gate: read-only'));
});

test('a device created writable before it was known as a door is still refused', async (t) => {
  const world = await doorWorld(t);
  const writable = structuredClone(world.device('Portail'));
  for (const feature of writable.features) {
    feature.read_only = false;
  }
  await world.gladys.fake.deviceUpdated(writable);
  const ack = await world.gladys.fake.setValue(writable, writable.features[1], 1);
  assert.equal(ack.success, false);
});

test('the "all shutters" action and widget never move a door, even when allowed', async (t) => {
  const world = await doorWorld(t, { ...CREDENTIALS, allow_door_control: true });
  const fake = world.gladys.fake;
  const ack = await fake.sceneAction('move_shutters', { command: 'open' });
  assert.equal(ack.success, true);
  const moved = world.dio.requests
    .filter((r) => r.path.endsWith('/action/mvtlinear'))
    .map((r) => r.path);
  assert.ok(moved.includes(`/device/${SALON}/action/mvtlinear`));
  assert.ok(!moved.some((path) => path.includes(GARAGE) || path.includes(PORTAIL)));

  const widget = await fake.widgetGet('shutters', { language: 'fr' });
  const rows = widget.data.content.components.find((c) => c.type === 'status').items;
  assert.ok(!rows.some((row) => ['Entrée voitures', 'Portail'].includes(row.label)));
});

test('the option allows the control of a door, as a shutter, never as a switch', async (t) => {
  const world = await doorWorld(t);
  const fake = world.gladys.fake;
  await fake.configUpdated({ ...fake.config, allow_door_control: true });
  const portail = world.device('Portail');
  assert.deepEqual(readOnly(portail), [false, false]);
  assert.deepEqual(
    portail.features.map((f) => `${f.category}/${f.type}`),
    ['shutter/position', 'shutter/state'],
  );
  const ack = await fake.setValue(portail, world.feature('Portail', 'movement'), 1);
  assert.equal(ack.success, true);
  assert.ok(world.logger.at('info').includes('Command: "Portail" up'));

  // Turned off again: read-only again.
  await fake.configUpdated({ ...fake.config, allow_door_control: false });
  assert.deepEqual(readOnly(world.device('Portail')), [true, true]);
});

test('a module recalibrated as a door is republished read-only', async (t) => {
  const world = await doorWorld(t);
  assert.deepEqual(readOnly(world.device('Volet salon')), [false, false]);
  world.dio.pushState(SALON, [{ rt: 'gw.r.shutter.calibration', door: true }]);
  await until(() => readOnly(world.device('Volet salon')).every(Boolean), { label: 'republished' });
  const ack = await world.gladys.fake.setValue(
    world.device('Volet salon'),
    world.feature('Volet salon', 'movement'),
    1,
  );
  assert.equal(ack.success, false);
});
