import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig, sameCredentials } from '../src/config.js';

test('the defaults: French names, a safety refresh every 5 minutes', () => {
  assert.deepEqual(normalizeConfig(), {
    email: '',
    password: '',
    refreshMs: 5 * 60 * 1000,
    allowDoorControl: false,
    language: 'fr',
  });
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('values are cleaned, unknown choices fall back to the defaults', () => {
  const config = normalizeConfig({
    email: '  Jean@Example.com ',
    password: ' pass with spaces ',
    refresh_minutes: 15,
    language: 'it',
  });
  assert.equal(config.email, 'Jean@Example.com');
  assert.equal(config.password, ' pass with spaces ');
  assert.equal(config.refreshMs, 15 * 60 * 1000);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ refresh_minutes: '2' }).refreshMs, 5 * 60 * 1000);
  assert.equal(normalizeConfig(null).email, '');
});

test('credentials: both needed, the e-mail compared without case', () => {
  assert.equal(isConfigured(normalizeConfig({ email: 'a@b.c' })), false);
  assert.equal(isConfigured(normalizeConfig({ email: 'a@b.c', password: 'x' })), true);
  const a = normalizeConfig({ email: 'A@b.c', password: 'x' });
  assert.equal(sameCredentials(a, normalizeConfig({ email: 'a@B.c', password: 'x' })), true);
  assert.equal(sameCredentials(a, normalizeConfig({ email: 'a@b.c', password: 'y' })), false);
});

test('the control of garage doors and gates is off unless explicitly on', () => {
  assert.equal(normalizeConfig({}).allowDoorControl, false);
  assert.equal(normalizeConfig({ allow_door_control: 'yes' }).allowDoorControl, false);
  assert.equal(normalizeConfig({ allow_door_control: true }).allowDoorControl, true);
  assert.equal(normalizeConfig({ allow_door_control: 'true' }).allowDoorControl, true);
});
