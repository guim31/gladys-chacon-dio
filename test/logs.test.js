// -----------------------------------------------------------------------------
// Quiet logs: a normal cycle (refresh, pushed states, a ring, the widget)
// writes nothing at info; and no secret of the configuration — the password,
// the session token, the e-mail — ever reaches the logs, whatever happens.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, until } from './helpers/world.js';
import { EMAIL, PASSWORD } from './helpers/fakeDio.js';

const SALON = 'L4HActuator_0a1b2c3d4e5f60718293a4b5';
const SONNETTE = 'Tuya_bf00112233445566778899';

test('a normal cycle writes nothing at info', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  const infoBefore = world.logger.at('info').length;

  await world.app.refresh();
  world.dio.pushState(SALON, [{ rt: 'oic.r.openlevel', openLevel: 12 }]);
  world.dio.pushState(SONNETTE, [
    { rt: 'gw.r.lastEvent', type: 'ring', ts: new Date().toISOString(), data: {} },
  ]);
  world.dio.push({ name: 'device', action: 'update', data: { id: SALON, name: 'Renamed' } });
  await until(() => fake.lastState(`ext:test-integration:shutter:${SALON}:position`) === 12);
  await fake.widgetGet('shutters', { language: 'fr' });
  await fake.poll(world.device('Volet salon'));
  await world.app.refresh();
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.deepEqual(world.logger.at('info').slice(infoBefore), []);
  assert.deepEqual(world.logger.at('warn'), []);
  assert.deepEqual(world.logger.at('error'), []);
});

test('no secret in the logs: start, refused password, lost cloud, debug level included', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  // Everything that writes something: a command, a lost connection, a
  // dead request, a wrong password, another account.
  await fake.setValue(world.device('Volet salon'), world.feature('Volet salon', 'movement'), 1);
  world.dio.drop();
  await until(() => world.client.online === false);
  await until(() => world.client.online);
  world.dio.silent = true;
  await world.app.refresh().catch(() => {});
  world.dio.silent = false;
  await fake.configUpdated({ email: EMAIL, password: 'wrong-password-123' });
  await until(() => fake.connectionStatus?.message?.en?.startsWith('DiO refused'));

  const all = world.logger.lines.map((line) => line.text).join('\n');
  const tokens = [...world.dio.validTokens];
  assert.ok(tokens.length > 0);
  for (const secret of [PASSWORD, 'wrong-password-123', EMAIL, ...tokens]) {
    assert.ok(!all.includes(secret), `a secret reached the logs: ${secret.slice(0, 4)}…`);
  }
  // And it was a real run, at every level.
  assert.ok(world.logger.at('debug').length > 0);
  assert.ok(world.logger.at('info').length > 0);
  assert.ok(world.logger.at('error').length > 0);
});
