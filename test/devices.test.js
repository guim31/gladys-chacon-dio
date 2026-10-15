// -----------------------------------------------------------------------------
// The integration end to end: the SDK's fake Gladys, the fake DiO cloud, and
// the real client and app in between.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, until } from './helpers/world.js';

const SALON = 'L4HActuator_0a1b2c3d4e5f60718293a4b5';
const CUISINE = 'L4HActuator_2c3d4e5f60718293a4b5c6d7';
const PRISE = 'L4HActuator_3d4e5f60718293a4b5c6d7e8';
const SONNETTE = 'Tuya_bf00112233445566778899';

const featureId = (kind, id, key) => `ext:test-integration:${kind}:${id}:${key}`;
const deviceId = (kind, id) => `ext:test-integration:${kind}:${id}`;

test('one Gladys device per supported DiO device, the unknown type left out', async (t) => {
  const world = await createWorld({ addAll: false });
  t.after(() => world.stop());
  const devices = world.gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => [device.name, device.external_id, device.model]),
    [
      ['Volet salon', deviceId('shutter', SALON), 'CERSwd-3B'],
      ['Volet chambre', deviceId('shutter', 'L4HActuator_1b2c3d4e5f60718293a4b5c6'), 'CERSwd-3B'],
      ['Plafonnier cuisine', deviceId('light', CUISINE), 'CERNwd-3B'],
      ['Prise congélateur', deviceId('plug', PRISE), 'DiO plug'],
      ['Sonnette portail', deviceId('doorbell', SONNETTE), 'DIOVDP-B03'],
    ],
  );
  assert.deepEqual(
    world.device('Volet salon').features.map((f) => [f.name, f.category, f.type]),
    [
      ['Position', 'shutter', 'position'],
      ['Mouvement', 'shutter', 'state'],
    ],
  );
  assert.deepEqual(
    devices.slice(2).map((device) => device.features.map((f) => `${f.category}/${f.type}`)),
    [['light/binary'], ['switch/binary'], ['doorbell/ring']],
  );
  // The unsupported device is said once, at info, with what identifies it.
  assert.deepEqual(
    world.logger.at('info').filter((line) => line.includes('not supported')),
    ['DiO device not supported yet: model "CERNwd-3B", type ".dio1.camera.unknown" (ignored)'],
  );
  // Nothing published before the user adds the devices.
  assert.deepEqual(world.gladys.fake.states, []);
});

test('the states of the added devices are published, and the pills', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  await until(() => fake.lastState(featureId('plug', PRISE, 'power')) !== undefined);
  assert.equal(fake.lastState(featureId('shutter', SALON, 'position')), 75);
  assert.equal(fake.lastState(featureId('shutter', SALON, 'movement')), 0);
  assert.equal(fake.lastState(featureId('light', CUISINE, 'power')), 1);
  assert.equal(fake.lastState(featureId('plug', PRISE, 'power')), 0);
  assert.equal(fake.lastState(featureId('doorbell', SONNETTE, 'ring')), 0);

  const pill = (id) => fake.transports.filter((entry) => entry.device_external_id === id).at(-1);
  assert.equal(pill(deviceId('shutter', SALON)).transport, 'cloud');
  // The module with an old firmware: offline for the cloud.
  assert.equal(
    pill(deviceId('shutter', 'L4HActuator_1b2c3d4e5f60718293a4b5c6')).transport,
    'unreachable',
  );
  assert.equal(fake.connectionStatus.connected, true);
});

test('commands go to the cloud, and the pushed state comes back', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  const send = (name, key, value) =>
    fake.setValue(world.device(name), world.feature(name, key), value);
  const lastRequest = () => world.dio.requests.at(-1);

  assert.deepEqual(await send('Prise congélateur', 'power', 1), { success: true });
  assert.deepEqual(lastRequest(), {
    method: 'POST',
    path: `/device/${PRISE}/action/switch`,
    parameters: { value: 1 },
    id: lastRequest().id,
  });
  await until(() => fake.lastState(featureId('plug', PRISE, 'power')) === 1);

  await send('Plafonnier cuisine', 'power', 0);
  assert.deepEqual(lastRequest().parameters, { value: 0 });
  await until(() => fake.lastState(featureId('light', CUISINE, 'power')) === 0);

  // Gladys' shutter buttons: 1 open, 0 stop, -1 close.
  await send('Volet salon', 'movement', -1);
  assert.equal(lastRequest().path, `/device/${SALON}/action/mvtlinear`);
  assert.deepEqual(lastRequest().parameters, { movement: 'down' });
  await until(() => fake.lastState(featureId('shutter', SALON, 'position')) === 0);
  assert.equal(fake.lastState(featureId('shutter', SALON, 'movement')), -1);
  await send('Volet salon', 'movement', 0);
  assert.deepEqual(lastRequest().parameters, { movement: 'stop' });
  await send('Volet salon', 'movement', 1);
  assert.deepEqual(lastRequest().parameters, { movement: 'up' });

  await send('Volet salon', 'position', 30);
  assert.equal(lastRequest().path, `/device/${SALON}/action/openlevel`);
  assert.deepEqual(lastRequest().parameters, { openLevel: 30 });
  await until(() => fake.lastState(featureId('shutter', SALON, 'position')) === 30);

  // One info line per user command, with the device name.
  assert.ok(world.logger.at('info').includes('Command: "Volet salon" position 30 %'));
});

test('a refused command is acked as failed', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  const ack = await fake.setValue(
    world.device('Volet salon'),
    world.feature('Volet salon', 'position'),
    120,
  );
  assert.equal(ack.success, false);
  const ring = await fake.setValue(
    world.device('Sonnette portail'),
    world.feature('Sonnette portail', 'ring'),
    1,
  );
  assert.equal(ring.success, false);
  // The module that does not answer: the cloud refuses the action.
  const chambre = await fake.setValue(
    world.device('Volet chambre'),
    world.feature('Volet chambre', 'movement'),
    1,
  );
  assert.equal(chambre.success, false);
});

test('without a push after a command, the device is read again', async (t) => {
  const world = await createWorld({ dio: { pushAfterAction: false } });
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  await fake.setValue(
    world.device('Prise congélateur'),
    world.feature('Prise congélateur', 'power'),
    1,
  );
  await until(() => fake.lastState(featureId('plug', PRISE, 'power')) === 1, {
    label: 'confirmation read',
  });
});

test('a change made from the DiO app or the wall switch is followed in real time', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  world.dio.pushState(SALON, [
    { rt: 'oic.r.movement.linear', movement: 'up' },
    { rt: 'oic.r.openlevel', openLevel: 42 },
  ]);
  await until(() => fake.lastState(featureId('shutter', SALON, 'position')) === 42);
  assert.equal(fake.lastState(featureId('shutter', SALON, 'movement')), 1);
  // A push with one link keeps the others.
  world.dio.pushState(SALON, [{ rt: 'oic.r.movement.linear', movement: 'stop' }]);
  await until(() => fake.lastState(featureId('shutter', SALON, 'movement')) === 0);
  assert.equal(fake.lastState(featureId('shutter', SALON, 'position')), 42);
});

test('only changes are published', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  const count = fake.states.length;
  await world.app.refresh();
  await world.app.refresh();
  assert.equal(fake.states.length, count, 'nothing changed, nothing sent');
  world.dio.states[PRISE].links[1].value = 1;
  await world.app.refresh();
  assert.deepEqual(fake.states.slice(count), [
    { device_feature_external_id: featureId('plug', PRISE, 'power'), state: 1 },
  ]);
});

test('a doorbell ring is a 1 then 0 pulse; an old ring is not replayed', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  const ring = featureId('doorbell', SONNETTE, 'ring');
  // The fixture's last ring dates from May: history, not a ring now.
  assert.equal(
    fake.states.filter((s) => s.device_feature_external_id === ring && s.state === 1).length,
    0,
  );

  const ts = new Date().toISOString();
  const event = {
    rt: 'gw.r.lastEvent',
    href: 'lastEvent',
    type: 'ring',
    ts,
    data: { reason: null },
  };
  world.dio.pushState(SONNETTE, [event]);
  await until(() => fake.lastState(ring) === 1, { label: 'ring' });
  await until(() => fake.lastState(ring) === 0, { label: 'end of the pulse' });

  // The same event read again by a refresh: no second ring.
  world.dio.states[SONNETTE].links[2] = event;
  await world.app.refresh();
  assert.equal(
    fake.states.filter((s) => s.device_feature_external_id === ring && s.state === 1).length,
    1,
  );
});

test('a device going offline fires the scene trigger and turns its pill', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  world.dio.pushState(PRISE, [{ rt: 'oic.r.switch.binary', value: 0 }], 0);
  await until(() => fake.sceneEvents.length === 1, { label: 'offline event' });
  assert.deepEqual(fake.sceneEvents[0], {
    key: 'device_connection_changed',
    data: { device: deviceId('plug', PRISE), state: 'offline', device_name: 'Prise congélateur' },
  });
  await until(
    () =>
      fake.transports.filter((e) => e.device_external_id === deviceId('plug', PRISE)).at(-1)
        ?.transport === 'unreachable',
  );

  world.dio.pushState(PRISE, [{ rt: 'oic.r.switch.binary', value: 0 }], 1);
  await until(() => fake.sceneEvents.length === 2, { label: 'online event' });
  assert.equal(fake.sceneEvents[1].data.state, 'online');
  // A known state seen again fires nothing.
  world.dio.pushState(PRISE, [{ rt: 'oic.r.switch.binary', value: 1 }], 1);
  await until(() => fake.lastState(featureId('plug', PRISE, 'power')) === 1);
  assert.equal(fake.sceneEvents.length, 2);
});

test('the cloud lost: status, pills unreachable, then everything back', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  world.dio.drop();
  await until(() => fake.connectionStatus.connected === false, { label: 'lost status' });
  assert.equal(
    fake.connectionStatus.message.fr,
    'Connexion au cloud DiO perdue, reconnexion en cours.',
  );
  const pill = () =>
    fake.transports.filter((e) => e.device_external_id === deviceId('shutter', SALON)).at(-1);
  assert.equal(pill().transport, 'unreachable');
  await until(() => fake.connectionStatus.connected === true, { label: 'back' });
  await until(() => pill().transport === 'cloud', { label: 'pill back' });
  assert.ok(world.logger.at('info').includes('Connection to the DiO cloud is back'));
});

test('a device added later gets its states at once', async (t) => {
  const world = await createWorld({ addAll: false });
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  await world.add([world.device('Prise congélateur')]);
  assert.equal(fake.lastState(featureId('plug', PRISE, 'power')), 0);
  assert.equal(fake.lastState(featureId('shutter', SALON, 'position')), undefined);
  // The cached state of another device, sent at its creation (no new read).
  await world.app.refresh();
  const reads = world.dio.requests.filter((r) => r.path === '/device/states').length;
  await world.add([world.device('Volet salon')]);
  assert.equal(fake.lastState(featureId('shutter', SALON, 'position')), 75);
  assert.equal(world.dio.requests.filter((r) => r.path === '/device/states').length, reads + 1);
});

test('a scan reads the device list again', async (t) => {
  const world = await createWorld({ addAll: false });
  t.after(() => world.stop());
  world.dio.devices.push({
    id: 'L4HActuator_5f60718293a4b5c6d7e8f9a0',
    name: 'Volet bureau',
    modelName: 'CERSwd-3B',
    softwareVersion: '1.0.6',
    type: '.dio1.wifi.shutter.mvt_linear.',
  });
  await world.gladys.fake.scanRequest();
  assert.ok(world.device('Volet bureau'));
});

test('the feature names follow the configured language', async (t) => {
  const world = await createWorld({ addAll: false });
  t.after(() => world.stop());
  await world.gladys.fake.configUpdated({ ...world.gladys.fake.config, language: 'de' });
  assert.deepEqual(
    world.device('Volet salon').features.map((f) => f.name),
    ['Position', 'Bewegung'],
  );
  assert.equal(world.device('Prise congélateur').features[0].name, 'Steckdose');
});

test('the "list devices" action names every device, the unsupported ones too', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const ack = await world.gladys.fake.action('list_devices', {});
  assert.equal(ack.success, true);
  const message = ack.data.message ?? ack.data;
  assert.match(message.fr, /^6 appareil\(s\) sur le compte DiO :/);
  assert.match(message.fr, /• Volet chambre \(CERSwd-3B\) — hors ligne/);
  assert.match(
    message.fr,
    /• Caméra garage \(CERNwd-3B\) — pas encore pris en charge, type \.dio1\.camera\.unknown/,
  );
  assert.match(message.en, /Open an issue on GitHub/);
});

test('without credentials: a clear status, no connection attempt', async (t) => {
  const world = await createWorld({ config: { email: '', password: '' } });
  t.after(() => world.stop());
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.fr, /Saisissez l’e-mail/);
  assert.equal(world.dio.logins.length, 0);

  // The user fills them in: connection.
  await world.gladys.fake.configUpdated({
    email: 'jean.dupont@example.com',
    password: 'S3cret-Pa55word!',
  });
  await until(() => world.gladys.fake.connectionStatus.connected === true);
});

test('a wrong password: said once, retried only when the configuration is saved', async (t) => {
  const world = await createWorld({
    config: { email: 'jean.dupont@example.com', password: 'nope' },
    connect: false,
  });
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  await world.gladys.connect();
  await until(() => fake.connectionStatus?.message?.en?.startsWith('DiO refused'));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(world.dio.logins.length, 1);

  // Saved again unchanged (the password was changed in the app meanwhile).
  world.dio.accounts.set('jean.dupont@example.com', 'nope');
  await fake.configUpdated({ ...fake.config });
  await until(() => fake.connectionStatus.connected === true);
  assert.equal(world.dio.logins.length, 2);
});

test('another account: the old session is closed and the devices replaced', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  world.dio.accounts.set('autre@example.com', 'pw');
  await world.gladys.fake.configUpdated({ email: 'autre@example.com', password: 'pw' });
  assert.ok(world.dio.requests.some((request) => request.path === '/session/logout'));
  await until(() => world.dio.logins.length === 2);
  await until(() => world.client.online);
});
