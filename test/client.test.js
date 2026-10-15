// -----------------------------------------------------------------------------
// The DiO cloud client against the fake cloud: login, stored session,
// refused session, refused credentials, lost connection, dead socket.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DioClient } from '../src/dio/client.js';
import { createSessionStore } from '../src/dio/session-store.js';
import { EMAIL, PASSWORD, createFakeDio } from './helpers/fakeDio.js';
import { createRecordingLogger, until } from './helpers/world.js';

async function setup(t, { dir, dio = createFakeDio(), timing = {} } = {}) {
  const dataDir = dir ?? (await mkdtemp(join(tmpdir(), 'chacon-dio-client-')));
  if (!dir) {
    t.after(() => rm(dataDir, { recursive: true, force: true }));
  }
  const logger = createRecordingLogger();
  const client = new DioClient({
    store: createSessionStore({ dir: dataDir, logger }),
    logger,
    fetch: dio.fetch,
    WebSocket: dio.WebSocket,
    timing: {
      requestTimeoutMs: 200,
      connectTimeoutMs: 200,
      retryDelaysMs: [10, 20],
      stableSessionMs: 0,
      keepaliveMs: 60 * 60 * 1000,
      ...timing,
    },
  });
  const events = [];
  for (const name of ['online', 'offline', 'connect-failed', 'rejected']) {
    client.on(name, () => events.push(name));
  }
  t.after(() => client.stop());
  return { dio, client, logger, events, dataDir };
}

test('logs in, stores the session, and reads the account', async (t) => {
  const { dio, client, dataDir } = await setup(t);
  client.start({ email: EMAIL, password: PASSWORD });
  await until(() => client.online, { label: 'online' });

  assert.equal(dio.logins.length, 1);
  assert.equal(dio.logins[0].email, EMAIL);
  // The socket is opened with the token, never with the credentials.
  assert.equal(dio.socketUrls.length, 1);
  assert.match(dio.socketUrls[0], /\?sessionToken=r:\d+$/);
  assert.doesNotMatch(dio.socketUrls[0], /password|email/);

  const devices = await client.listDevices();
  assert.equal(devices.length, 6);
  const states = await client.readStates([devices[0].id, devices[1].id, 'unknown']);
  assert.deepEqual([...states.keys()], [devices[0].id, devices[1].id]);
  assert.equal(states.get(devices[0].id).position, 75);

  // The session file: the token and a hash of the e-mail, never the password,
  // readable by the container user only.
  const file = join(dataDir, 'dio-session.json');
  const content = await readFile(file, 'utf8');
  assert.match(content, /"token":"r:\d+"/);
  assert.ok(!content.includes(PASSWORD));
  assert.ok(!content.includes(EMAIL));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test('a stored session is reused: no login, no password sent', async (t) => {
  const dio = createFakeDio();
  const dir = await mkdtemp(join(tmpdir(), 'chacon-dio-client-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const first = await setup(t, { dir, dio });
  first.client.start({ email: EMAIL, password: PASSWORD });
  await until(() => first.client.online);
  first.client.stop();
  const installationId = dio.logins[0].installationId;

  const second = await setup(t, { dir, dio });
  second.client.start({ email: EMAIL, password: PASSWORD });
  await until(() => second.client.online);
  assert.equal(dio.logins.length, 1, 'no second login');
  assert.equal(dio.socketUrls.length, 2);

  // Another account never reuses the session, the installation id stays.
  dio.accounts.set('other@example.com', 'pw');
  second.client.stop();
  const third = await setup(t, { dir, dio });
  third.client.start({ email: 'other@example.com', password: 'pw' });
  await until(() => third.client.online);
  assert.equal(dio.logins.length, 2);
  assert.equal(dio.logins[1].installationId, installationId);
});

test('a session the cloud no longer accepts is replaced by a new login', async (t) => {
  const dio = createFakeDio();
  const dir = await mkdtemp(join(tmpdir(), 'chacon-dio-client-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = await setup(t, { dir, dio });
  first.client.start({ email: EMAIL, password: PASSWORD });
  await until(() => first.client.online);
  first.client.stop();

  dio.validTokens.clear(); // the session expired
  const { client, events } = await setup(t, { dir, dio });
  client.start({ email: EMAIL, password: PASSWORD });
  await until(() => client.online);
  assert.equal(dio.logins.length, 2);
  assert.deepEqual(events, ['online']);
});

test('refused credentials stop the client: no retry that could lock the account', async (t) => {
  const { dio, client, events } = await setup(t);
  client.start({ email: EMAIL, password: 'wrong' });
  await until(() => events.includes('rejected'), { label: 'rejected' });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(dio.logins.length, 1);
  assert.equal(dio.socketUrls.length, 0);
  assert.equal(client.online, false);
});

test('an unreachable cloud is retried, then reached', async (t) => {
  const { dio, client, events } = await setup(t);
  dio.unreachable = true;
  client.start({ email: EMAIL, password: PASSWORD });
  await until(() => events.filter((e) => e === 'connect-failed').length >= 2);
  dio.unreachable = false;
  await until(() => client.online, { label: 'online' });
});

test('a lost connection is reopened, and the states keep coming', async (t) => {
  const { dio, client, events } = await setup(t);
  const states = [];
  client.on('state', (id, state) => states.push([id, state]));
  client.start({ email: EMAIL, password: PASSWORD });
  await until(() => client.online);

  dio.drop();
  await until(() => events.includes('offline'), { label: 'offline' });
  await until(() => client.online, { label: 'online again' });
  assert.deepEqual(events, ['online', 'offline', 'online']);
  assert.equal(dio.logins.length, 1, 'the stored session is reused');

  dio.pushState('L4HActuator_0a1b2c3d4e5f60718293a4b5', [{ rt: 'oic.r.openlevel', openLevel: 40 }]);
  await until(() => states.length === 1);
  assert.deepEqual(states[0], [
    'L4HActuator_0a1b2c3d4e5f60718293a4b5',
    { connected: true, position: 40 },
  ]);
});

test('a request without answer fails, and the dead socket is reopened', async (t) => {
  const { dio, client, events } = await setup(t);
  client.start({ email: EMAIL, password: PASSWORD });
  await until(() => client.online);
  dio.silent = true;
  await assert.rejects(client.listDevices(), /no answer from the DiO cloud to GET \/device/);
  await until(() => events.includes('offline'));
  dio.silent = false;
  await until(() => client.online);
  assert.equal((await client.listDevices()).length, 6);
});

test('an error status of the cloud rejects the request', async (t) => {
  const { client } = await setup(t);
  client.start({ email: EMAIL, password: PASSWORD });
  await until(() => client.online);
  await assert.rejects(
    client.request({ method: 'POST', path: '/device/nope/action/switch', parameters: {} }),
    /answered 404 to POST \/device\/nope\/action\/switch/,
  );
  await assert.rejects(new DioClientLike().request(), /not connected/);
});

test('an idle socket is checked by a small request', async (t) => {
  const { dio, client } = await setup(t, { timing: { keepaliveMs: 40 } });
  client.start({ email: EMAIL, password: PASSWORD });
  await until(() => client.online);
  await until(() => dio.requests.some((request) => request.path === '/user'), {
    label: 'keepalive',
  });
});

test('logout closes the session and forgets it', async (t) => {
  const { dio, client, dataDir } = await setup(t);
  client.start({ email: EMAIL, password: PASSWORD });
  await until(() => client.online);
  await client.logout();
  assert.ok(dio.requests.some((request) => request.path === '/session/logout'));
  assert.equal(client.online, false);
  const content = JSON.parse(await readFile(join(dataDir, 'dio-session.json'), 'utf8'));
  assert.equal(content.token, null);
});

class DioClientLike extends DioClient {
  constructor() {
    super({ store: null, logger: createRecordingLogger() });
  }
  request() {
    return super.request({ method: 'GET', path: '/device', parameters: {} });
  }
}
