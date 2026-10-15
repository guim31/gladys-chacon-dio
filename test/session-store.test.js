import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accountKey, createSessionStore } from '../src/dio/session-store.js';
import { createRecordingLogger } from './helpers/world.js';

test('the token is kept per account, the e-mail only as a hash', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'chacon-dio-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createSessionStore({ dir, logger: createRecordingLogger() });
  const id = await store.installationId();
  await store.save('Jean@Example.com', 'r:abc');
  assert.equal(await store.load('jean@example.com '), 'r:abc');
  assert.equal(await store.load('other@example.com'), null);

  const reread = createSessionStore({ dir, logger: createRecordingLogger() });
  assert.equal(await reread.load('jean@example.com'), 'r:abc');
  assert.equal(await reread.installationId(), id);
  const file = await readFile(join(dir, 'dio-session.json'), 'utf8');
  assert.ok(!/example\.com/i.test(file));
  assert.ok(file.includes(accountKey('jean@example.com')));

  await reread.clear();
  assert.equal(await reread.load('jean@example.com'), null);
  assert.equal(await reread.installationId(), id, 'the installation id survives');
});

test('an unreadable or unwritable /data never stops the integration', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'chacon-dio-store-'));
  t.after(async () => {
    await chmod(dir, 0o700);
    await rm(dir, { recursive: true, force: true });
  });
  await writeFile(join(dir, 'dio-session.json'), '{not json');
  const logger = createRecordingLogger();
  const store = createSessionStore({ dir, logger });
  assert.equal(await store.load('a@b.c'), null);
  await chmod(dir, 0o500);
  await store.save('a@b.c', 'r:1');
  assert.equal(await store.load('a@b.c'), 'r:1', 'kept in memory');

  const memory = createSessionStore({ dir: null, logger });
  await memory.save('a@b.c', 'r:2');
  assert.equal(await memory.load('a@b.c'), 'r:2');
});
