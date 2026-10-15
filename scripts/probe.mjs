#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real DiO cloud, read-only, with the integration's own client.
//
//   node scripts/probe.mjs
//     A fake account: the login must be refused (wrong e-mail or password),
//     and a socket opened with a made-up session token must be refused too.
//     Proves the endpoints, the answer formats and the refusal paths.
//
//   DIO_EMAIL=… DIO_PASSWORD=… node scripts/probe.mjs
//     A real account: logs in, lists the devices and reads their states, then
//     closes the session. Nothing is sent to the devices. Prints only what
//     the integration needs to know: per device, its kind, its DiO type, its
//     model and the resource types (`rt`) of its state — never a name, an
//     id, an e-mail, a token or an address.
//
// Needs Node 22 or later (global fetch and WebSocket) and Internet access.
// Exit code 0 when everything behaved as expected, 1 otherwise.
// -----------------------------------------------------------------------------

import { DioClient, DioRejectedError } from '../src/dio/client.js';
import { createSessionStore } from '../src/dio/session-store.js';
import { WS_URL, kindOf, readStatesRequest } from '../src/dio/protocol.js';

const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const print = (line) => process.stdout.write(`${line}\n`);

function newClient() {
  // Memory only: the probe writes nothing on disk.
  const store = createSessionStore({ dir: null, logger: quiet });
  return new DioClient({ store, logger: quiet, timing: { retryDelaysMs: [600000] } });
}

/** Resolve with the first of these client events. */
function firstEvent(client, names, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ name: 'timeout' }), timeoutMs);
    for (const name of names) {
      client.once(name, (detail) => {
        clearTimeout(timer);
        resolve({ name, detail });
      });
    }
  });
}

async function probeFakeAccount() {
  let ok = true;
  print('1. Login with a fake account (must be refused)');
  const client = newClient();
  client.credentials = {
    email: `probe-${Date.now()}@example.com`,
    password: 'not-a-real-password',
  };
  try {
    await client.login();
    print('   UNEXPECTED: the cloud gave a session to a fake account');
    ok = false;
  } catch (err) {
    if (err instanceof DioRejectedError) {
      print('   OK: refused as wrong credentials');
    } else {
      print(`   UNEXPECTED: ${err.message}`);
      ok = false;
    }
  }

  print('2. Socket with a made-up session token (must be refused)');
  const socket = new WebSocket(`${WS_URL}?sessionToken=r:00000000000000000000000000000000`);
  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('no answer in 20 s'), 20000);
    socket.addEventListener('message', (event) => {
      clearTimeout(timer);
      try {
        const message = JSON.parse(String(event.data));
        resolve(message.name === 'connection' ? `connection/${message.action}` : 'other message');
      } catch {
        resolve('unreadable message');
      }
    });
    socket.addEventListener('close', (event) => {
      clearTimeout(timer);
      resolve(`closed (code ${event.code})`);
    });
  });
  try {
    socket.close();
  } catch {
    // Already closed.
  }
  if (outcome === 'connection/invalid') {
    print('   OK: connection/invalid');
  } else {
    print(`   UNEXPECTED: ${outcome}`);
    ok = false;
  }
  return ok;
}

async function probeRealAccount(email, password) {
  const client = newClient();
  const connected = firstEvent(client, ['online', 'rejected', 'connect-failed']);
  client.start({ email, password });
  const event = await connected;
  if (event.name !== 'online') {
    print(`Connection: ${event.name} ${event.detail?.message ?? ''}`);
    client.stop();
    return false;
  }
  print('Connection: OK (session token, socket accepted)');
  try {
    const devices = await client.listDevices();
    print(`Devices: ${devices.length}`);
    const raw = await client.request(readStatesRequest(devices.map((device) => device.id)));
    devices.forEach((device, index) => {
      const state = raw?.[device.id];
      const links = Array.isArray(state?.links)
        ? state.links.map((link) => link.rt).join(', ')
        : String(state);
      print(
        `  #${index + 1} kind=${kindOf(device.type) ?? 'unsupported'} type=${device.type} ` +
          `model=${device.model} firmware=${device.firmware} rc=${state?.rc} links=[${links}]`,
      );
    });
    return true;
  } catch (err) {
    print(`Reading failed: ${err.message}`);
    return false;
  } finally {
    await client.logout();
  }
}

const { DIO_EMAIL: email, DIO_PASSWORD: password } = process.env;
const ok = email && password ? await probeRealAccount(email, password) : await probeFakeAccount();
print(ok ? 'Probe: everything as expected.' : 'Probe: something differs, see above.');
process.exit(ok ? 0 : 1);
