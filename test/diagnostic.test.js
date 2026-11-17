// -----------------------------------------------------------------------------
// The diagnostic is pasted on a public forum: nothing identifying gets out.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, keepable, sanitize } from '../src/diagnostic.js';

const ALIASES = new Map([['Tuya_bf00112233445566778899', '#1']]);

test('identifiers, addresses, tokens and links are masked, whatever their key', () => {
  const raw = {
    di: 'Tuya_bf00112233445566778899',
    user_id: 'u-12',
    ownerId: 'o-12',
    ownerEmail: 'jean@example.com',
    mac_address: '00:11:22:33:44:55',
    macAddr: '001122334455',
    local_key: 'k3y',
    lan_ip: '192.0.2.10',
    ipAddress: '192.0.2.11',
    homeId: 123456,
    gwId: 'gw-1',
    dev_id: 'bfabcdef0123456789xy',
    sign: 'abc',
    auth: 'Bearer eyJhbGciOi.eyJzdWIi.sig',
    lat: 48.85,
    lon: 2.35,
    ids: ['bf123', 'bf456'],
    msg: 'seen from 192.0.2.12 by jean@example.com, MAC aa:bb:cc:dd:ee:ff, key 0123456789abcdef0123',
    stream: 'rtsp://admin:pw@192.0.2.13:554/stream',
    image: 'https://user:pass@bucket.example.com/a/b.jpeg?sig=x',
    rt: 'gw.r.lastEvent',
    type: 'ring',
    ts: '2026-11-16T08:20:08.667Z',
    rc: 1,
  };
  const out = JSON.stringify(sanitize(raw, ALIASES));
  for (const secret of [
    'Tuya_bf',
    'u-12',
    'o-12',
    'jean@',
    '00:11:22',
    '001122334455',
    'k3y',
    '192.0.2',
    '123456',
    'gw-1',
    'bfabcdef',
    '"abc"',
    'eyJ',
    '48.85',
    '2.35',
    'bf123',
    'aa:bb',
    '0123456789abcdef',
    'admin',
    'pw@',
    'user:pass',
    'sig=x',
  ]) {
    assert.ok(!out.includes(secret), `not masked: ${secret} in ${out}`);
  }
  const clean = sanitize(raw, ALIASES);
  assert.equal(clean.di, '#1');
  assert.equal(clean.type, 'ring');
  assert.equal(clean.ts, '2026-11-16T08:20:08.667Z');
  assert.equal(clean.rc, 1);
  assert.equal(clean.image, 'https://bucket.example.com/…');
  assert.equal(clean.stream, 'rtsp://***/…');
});

test('a default device name loses its MAC suffix; a huge push is summed up', () => {
  const report = buildReport({
    devices: [
      { id: 'X1', name: 'DIOVDP-A1B2C3', kind: 'doorbell', type: '.wifi.doorBell.', model: '' },
    ],
    rawStates: new Map(),
    pushed: [],
    now: 0,
  });
  assert.ok(!report.fr.includes('A1B2C3'), report.fr);
  const big = keepable({
    name: 'deviceState',
    action: 'update',
    data: { di: 'X1', links: [{ type: 'call', img: 'x'.repeat(10000), dp: { ring: true } }] },
  });
  assert.ok(JSON.stringify(big).length < 500);
  assert.deepEqual(big.data, {
    di: 'X1',
    links: [{ type: 'call', img: '<10000 characters>', dp: { ring: true } }],
  });
  const raw = JSON.stringify(
    sanitize({ di: 'L4HActuator_ff99ee88dd77', label: 'DIOVDP_0A1B2C3D' }, new Map()),
  );
  assert.ok(!raw.includes('ff99') && !raw.includes('0A1B2C3D'), raw);
});
