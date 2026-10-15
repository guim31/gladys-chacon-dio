// -----------------------------------------------------------------------------
// The "move all DiO shutters" scene action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';

const SALON = 'L4HActuator_0a1b2c3d4e5f60718293a4b5';

test('the scene action commands every shutter added to Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;

  const open = await fake.sceneAction('move_shutters', { command: 'open' });
  assert.deepEqual(open, { success: true, data: { outputs: { commanded: 1, failed: 1 } } });

  const half = await fake.sceneAction('move_shutters', { command: 'position', position: 50 });
  assert.equal(half.success, true);
  const last = world.dio.requests
    .filter((r) => r.path === `/device/${SALON}/action/openlevel`)
    .at(-1);
  assert.deepEqual(last.parameters, { openLevel: 50 });

  for (const fields of [
    { command: 'position' },
    { command: 'position', position: 150 },
    { command: 'tilt' },
  ]) {
    const ack = await fake.sceneAction('move_shutters', fields);
    assert.equal(ack.success, false, JSON.stringify(fields));
  }
});

test('no shutter added to Gladys: nothing to do, no error', async (t) => {
  const world = await createWorld({ addAll: false });
  t.after(() => world.stop());
  const ack = await world.gladys.fake.sceneAction('move_shutters', { command: 'close' });
  assert.deepEqual(ack, { success: true, data: { outputs: { commanded: 0, failed: 0 } } });
  assert.ok(!world.dio.requests.some((r) => r.path.includes('/action/')));
});

test('every shutter failing fails the action', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  world.dio.states[SALON] = null;
  const ack = await world.gladys.fake.sceneAction('move_shutters', { command: 'stop' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /No shutter could be commanded \(2 failed\)/);
});
