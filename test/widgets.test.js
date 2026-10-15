// -----------------------------------------------------------------------------
// The "DiO shutters" widget: its content fits the core's vocabulary and budget
// in every case (validateWidgetContent: [] means rendered exactly as sent),
// and its buttons command every shutter added to Gladys.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildShuttersContent, describeShutter } from '../src/widgets.js';
import { LANGS } from '../src/i18n.js';
import { createWorld, until } from './helpers/world.js';

const SALON = 'L4HActuator_0a1b2c3d4e5f60718293a4b5';

test('every content fits the widget vocabulary and budget, in every language', () => {
  const many = Array.from({ length: 14 }, (_, index) => ({
    name: `Volet ${String(index).padStart(2, '0')} avec un nom vraiment très très long`,
    state: { connected: true, position: index * 7, movement: 'stop' },
  }));
  for (const language of LANGS) {
    for (const options of [
      { configured: false, online: false, shutters: [] },
      { configured: true, online: true, shutters: [] },
      { configured: true, online: true, shutters: many },
      { configured: true, online: false, shutters: many },
    ]) {
      const content = buildShuttersContent({ ...options, language });
      assert.deepEqual(
        validateWidgetContent(content),
        [],
        `${language} ${JSON.stringify(options).slice(0, 60)}`,
      );
    }
  }
  const content = buildShuttersContent({
    configured: true,
    online: true,
    shutters: many,
    language: 'fr',
  });
  assert.equal(content.components.find((c) => c.type === 'status').items.length, 10);
  // Offline cloud: no button that could not work.
  const offline = buildShuttersContent({
    configured: true,
    online: false,
    shutters: many,
    language: 'fr',
  });
  assert.ok(!offline.components.some((c) => c.type === 'button'));
});

test('a shutter reads as open, closed, a position, moving or offline', () => {
  const read = (state) => describeShutter(state, 'fr').value;
  assert.equal(read({ connected: true, position: 100, movement: 'stop' }), 'Ouvert');
  assert.equal(read({ connected: true, position: 0, movement: 'stop' }), 'Fermé');
  assert.equal(read({ connected: true, position: 45, movement: 'stop' }), '45 %');
  assert.equal(read({ connected: true, position: 45, movement: 'up' }), 'Monte');
  assert.equal(read({ connected: true, position: 45, movement: 'down' }), 'Descend');
  assert.equal(read({ connected: false, position: 45 }), 'Hors ligne');
  assert.equal(read(undefined), 'Inconnu');
});

test('the widget lists the shutters added to Gladys, and its buttons move them all', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const fake = world.gladys.fake;
  const ack = await fake.widgetGet('shutters', { settings: {}, language: 'fr', units: {} });
  assert.equal(ack.success, true);
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value]),
    [
      ['Volet chambre', 'Hors ligne'],
      ['Volet salon', '75 %'],
    ],
  );

  const result = await fake.widgetAction('shutters', 'close_all', {}, { settings: {} });
  assert.equal(result.success, true);
  // The module that does not answer fails, the other one moves.
  const toast = result.data.message ?? result.data;
  assert.equal(toast.fr, '1 volet(s) commandé(s), 1 en échec.');
  const moves = world.dio.requests.filter((r) => r.path.endsWith('/action/mvtlinear'));
  assert.deepEqual(
    moves.map((r) => [r.path, r.parameters.movement]),
    [
      [`/device/${SALON}/action/mvtlinear`, 'down'],
      ['/device/L4HActuator_1b2c3d4e5f60718293a4b5c6/action/mvtlinear', 'down'],
    ],
  );
  // A shutter state change nudges the open dashboards.
  await until(() => fake.widgetRefreshes.includes('shutters'));
});
