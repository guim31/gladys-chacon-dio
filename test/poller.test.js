// -----------------------------------------------------------------------------
// The container refreshes the devices by itself: the core cannot be trusted to
// call onPoll (GladysAssistant/Gladys#3198). The core's onPoll stays as a
// fallback, skipped while the timer is on time.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../src/poller.js';
import { createRecordingLogger, createWorld, until } from './helpers/world.js';

const PRISE = 'L4HActuator_3d4e5f60718293a4b5c6d7e8';
const plugPower = `ext:test-integration:plug:${PRISE}:power`;
const reads = (world) => world.dio.requests.filter((r) => r.path === '/device/states').length;

test('the states are refreshed by the timer, without any onPoll', async (t) => {
  const world = await createWorld({ timers: true, dio: { pushAfterAction: false } });
  t.after(() => world.stop());
  // A change the cloud did not push (lost during a reconnection, say).
  world.dio.states[PRISE].links[1].value = 1;
  // One-minute period in the config: make the timer quick for the test.
  world.gladys.fake.config.refresh_minutes = '1';
  const before = reads(world);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  await world.gladys.fake.configUpdated({ ...world.gladys.fake.config });
  // The restart refreshes at once...
  assert.equal(reads(world), before + 1);
  assert.equal(world.gladys.fake.lastState(plugPower), 1);
  // ...then every period, with no onPoll from the core.
  world.dio.states[PRISE].links[1].value = 0;
  t.mock.timers.tick(60 * 1000);
  t.mock.timers.reset();
  await until(() => world.gladys.fake.lastState(plugPower) === 0, { label: 'timer refresh' });
  assert.equal(reads(world), before + 2);
  assert.ok(
    !world.gladys.fake.wsMessages.some((message) => /poll/i.test(message.type ?? '')),
    'no poll came from the core',
  );
});

test('the core onPoll is a fallback, skipped while the timer is on time', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const before = reads(world);
  const device = world.device('Prise congélateur');
  assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
  assert.equal(reads(world), before, 'just refreshed: skipped');
});

test('the poller: half a period between timer refreshes, 90 % for the core', async () => {
  let clock = 0;
  let count = 0;
  const poller = createPoller({
    refresh: async () => {
      count += 1;
    },
    periodMs: () => 1000,
    logger: createRecordingLogger(),
    timers: false,
    now: () => clock,
  });
  await poller.restart();
  assert.equal(count, 1);
  clock = 800;
  await poller.fromCore();
  assert.equal(count, 1, 'core poll at 80 % of a period: skipped');
  clock = 950;
  await poller.fromCore();
  assert.equal(count, 2, 'core poll past 90 %: the timer stalled, refresh');
  await poller.now();
  assert.equal(count, 3, 'forced');
});

test('a failing refresh is logged once, and its recovery once', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  world.dio.silent = true;
  await assert.rejects(world.app.refresh());
  await until(() => world.client.online === false);
  world.dio.silent = false;
  await until(() => world.client.online);
  await until(() => world.logger.at('info').includes('Reading the DiO devices works again'));
  assert.equal(
    world.logger.at('warn').filter((line) => line.startsWith('Reading the DiO devices failed'))
      .length,
    1,
  );
});
