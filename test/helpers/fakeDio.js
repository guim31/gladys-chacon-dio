// -----------------------------------------------------------------------------
// A fake DiO cloud, in memory: the REST login (as a `fetch`) and the
// WebSocket (as a `WebSocket` class), answering like the real one from the
// fixtures of test/fixtures/dio/. No network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/dio/${name}.json`, import.meta.url), 'utf8'));

export const EMAIL = 'jean.dupont@example.com';
export const PASSWORD = 'S3cret-Pa55word!';

/**
 * @param {object} [options]
 * @param {number} [options.actionDelayMs] delay before the state pushed after an action
 * @param {boolean} [options.pushAfterAction] push the new state after an action
 */
export function createFakeDio({ actionDelayMs = 5, pushAfterAction = true } = {}) {
  const devices = structuredClone(fixture('devices').data);
  const states = structuredClone(fixture('states').data);

  const dio = {
    devices,
    states,
    accounts: new Map([[EMAIL, PASSWORD]]),
    /** Tokens the socket accepts. */
    validTokens: new Set(),
    /** Every login: { email, installationId } (the password is not kept). */
    logins: [],
    /** Every socket opened: its URL. */
    socketUrls: [],
    /** Every request received on a socket. */
    requests: [],
    sockets: [],
    loginStatus: null,
    unreachable: false,
    silent: false,
    tokenCounter: 0,

    get socket() {
      return dio.sockets.filter((socket) => socket.readyState === 1).at(-1);
    },

    /** The `fetch` of the client. */
    async fetch(url, init) {
      if (dio.unreachable) {
        const err = new TypeError('fetch failed');
        err.cause = { code: 'ENOTFOUND' };
        throw err;
      }
      const body = JSON.parse(init.body);
      dio.logins.push({ url, email: body.email, installationId: body.installationId });
      const reply = (status, payload) => ({
        status,
        json: async () => payload,
      });
      if (dio.loginStatus) {
        return reply(dio.loginStatus, { message: 'error' });
      }
      if (dio.accounts.get(body.email) !== body.password) {
        return reply(200, { status: 400, data: 'Invalid username/password.' });
      }
      dio.tokenCounter += 1;
      const token = `r:${String(dio.tokenCounter).padStart(32, '0')}`;
      dio.validTokens.add(token);
      return reply(200, { status: 200, data: { sessionToken: token } });
    },

    /** Push a message to the connected client. */
    push(message) {
      dio.socket?.receive(message);
    },

    /** Push a device state update. */
    pushState(id, links, rc = 1) {
      dio.push({ name: 'deviceState', action: 'update', data: { di: id, rc, links } });
    },

    /** The server side drops the connection. */
    drop(code = 1006) {
      dio.socket?.serverClose(code);
    },

    handle(socket, message) {
      dio.requests.push(message);
      if (dio.silent) {
        return;
      }
      const answer = (data, status = 200) =>
        socket.receive(
          data === undefined ? { id: message.id, status } : { id: message.id, status, data },
        );
      const actionMatch = /^\/device\/([^/]+)\/action\/(\w+)$/.exec(message.path);
      if (message.path === '/device') {
        answer(dio.devices);
      } else if (message.path === '/device/states') {
        const data = {};
        for (const id of message.parameters.devices) {
          if (id in dio.states) {
            data[id] = dio.states[id];
          }
        }
        answer(data);
      } else if (message.path === '/user') {
        answer({ id: 'user-0001', name: 'Jean', email: EMAIL });
      } else if (message.path === '/session/logout') {
        socket.receive({ id: message.id, status: 200, name: 'disconnection', action: 'success' });
      } else if (actionMatch) {
        const id = decodeURIComponent(actionMatch[1]);
        if (!(id in dio.states) || dio.states[id] === null) {
          answer(undefined, 404);
          return;
        }
        answer(undefined);
        const links = applyAction(dio.states[id], actionMatch[2], message.parameters);
        if (pushAfterAction) {
          setTimeout(() => dio.pushState(id, links, dio.states[id].rc), actionDelayMs);
        }
      } else {
        answer(undefined, 404);
      }
    },
  };

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = { open: [], message: [], close: [], error: [] };
      dio.socketUrls.push(url);
      dio.sockets.push(this);
      setImmediate(() => {
        if (dio.unreachable) {
          this.serverClose(1006);
          return;
        }
        this.readyState = 1;
        this.emit('open', {});
        const token = new URL(url).searchParams.get('sessionToken');
        this.receive({
          name: 'connection',
          action: dio.validTokens.has(token) ? 'success' : 'invalid',
          data: '',
        });
      });
    }

    addEventListener(type, listener) {
      this.listeners[type].push(listener);
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) {
        listener(event);
      }
    }

    receive(message) {
      if (this.readyState !== 1) {
        return;
      }
      this.emit('message', { data: JSON.stringify(message) });
    }

    send(data) {
      if (this.readyState !== 1) {
        throw new Error('socket not open');
      }
      const message = JSON.parse(data);
      setImmediate(() => dio.handle(this, message));
    }

    close() {
      this.serverClose(1000);
    }

    serverClose(code) {
      if (this.readyState === 3) {
        return;
      }
      this.readyState = 3;
      setImmediate(() => this.emit('close', { code }));
    }
  }

  dio.WebSocket = FakeWebSocket;
  return dio;
}

/** What an action changes in a stored state; returns the links pushed back. */
function applyAction(state, action, parameters) {
  const find = (rt) => state.links.find((link) => link.rt === rt);
  if (action === 'switch') {
    find('oic.r.switch.binary').value = parameters.value;
    return [find('oic.r.switch.binary')];
  }
  if (action === 'mvtlinear') {
    const level = find('oic.r.openlevel');
    find('oic.r.movement.linear').movement = parameters.movement;
    if (parameters.movement === 'up') {
      level.openLevel = 100;
    } else if (parameters.movement === 'down') {
      level.openLevel = 0;
    }
    return [find('oic.r.movement.linear'), level];
  }
  if (action === 'openlevel') {
    find('oic.r.openlevel').openLevel = parameters.openLevel;
    return [find('oic.r.openlevel')];
  }
  return [];
}
