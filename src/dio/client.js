// -----------------------------------------------------------------------------
// The DiO cloud client: login, one WebSocket, requests and pushed states.
//
// - The REST login gives a session token, stored in /data (see
//   session-store.js) and reused at the next start: the password only travels
//   when the token is missing or refused. The WebSocket is opened with the
//   token, never with the e-mail and password in its URL (the other way the
//   cloud accepts), which would end up in proxy logs.
// - A token refused at the opening of the socket is forgotten and the login
//   done again, once. Credentials refused by the login stop the client until
//   new ones are given: retrying a wrong password could lock the account.
// - A lost connection is reopened with a growing delay, from 10 s to 10 min.
// - An idle socket is checked every few minutes with a small request: a
//   connection that died silently (Wi-Fi of the server, NAT timeout) would
//   otherwise stop the pushed states without anyone noticing.
//
// Events: 'online', 'offline' (Error), 'connect-failed' (Error), 'rejected',
// 'state' (id, state).
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import {
  LOGIN_URL,
  classifyMessage,
  listDevicesRequest,
  logoutRequest,
  parseDevice,
  parseDeviceState,
  parseLoginResponse,
  readStatesRequest,
  socketUrl,
} from './protocol.js';

export class DioError extends Error {}

/** The cloud refused the e-mail or the password. */
export class DioRejectedError extends DioError {}

/** The cloud refused the session token at the opening of the socket. */
class InvalidSessionError extends DioError {}

export const DEFAULTS = {
  loginTimeoutMs: 15000,
  connectTimeoutMs: 15000,
  requestTimeoutMs: 10000,
  keepaliveMs: 4 * 60 * 1000,
  retryDelaysMs: [10000, 30000, 60000, 120000, 300000, 600000],
  // A session shorter than this does not reset the retry delay: a socket the
  // cloud closes right after accepting it must not be reopened every 10 s.
  stableSessionMs: 60000,
};

export class DioClient extends EventEmitter {
  /**
   * @param {object} options
   * @param {object} options.store the session store (session-store.js)
   * @param {{ debug: Function }} options.logger
   * @param {typeof fetch} [options.fetch]
   * @param {typeof WebSocket} [options.WebSocket]
   * @param {Partial<typeof DEFAULTS>} [options.timing]
   * @param {() => number} [options.now]
   */
  constructor({
    store,
    logger,
    fetch = globalThis.fetch,
    WebSocket = globalThis.WebSocket,
    timing = {},
    now = () => Date.now(),
  }) {
    super();
    this.store = store;
    this.logger = logger;
    this.fetch = fetch;
    this.WebSocketImpl = WebSocket;
    this.timing = { ...DEFAULTS, ...timing };
    this.now = now;

    this.credentials = null;
    this.generation = 0;
    this.socket = null;
    this.online = false;
    this.nextId = 0;
    this.pending = new Map();
    this.lastMessageAt = 0;
    this.keepaliveTimer = null;
    this.sleeping = null;
    this.finishers = new WeakMap();
  }

  /**
   * Connect with these credentials, and stay connected. Calling it again with
   * other credentials starts over.
   * @param {{ email: string, password: string }} credentials
   */
  start(credentials) {
    this.stop();
    this.credentials = { email: credentials.email, password: credentials.password };
    const generation = this.generation;
    this.running = this.run(generation);
    return this.running;
  }

  /** Close the socket and stop reconnecting. */
  stop() {
    this.generation += 1;
    this.credentials = null;
    this.wakeUp();
    this.closeSocket(new DioError('client stopped'));
  }

  /** Close the session on the cloud side too, and forget the stored token. */
  async logout() {
    if (this.online) {
      try {
        await this.request(logoutRequest());
      } catch (err) {
        this.logger.debug(`Logout not acknowledged (${err.message})`);
      }
    }
    this.stop();
    await this.store.clear();
  }

  /**
   * Send one request on the socket and wait for its answer.
   * @returns {Promise<unknown>} the `data` of the answer
   */
  request({ method, path, parameters }) {
    if (!this.online || !this.socket) {
      return Promise.reject(new DioError('not connected to the DiO cloud'));
    }
    this.nextId += 1;
    const id = this.nextId;
    const socket = this.socket;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new DioError(`no answer from the DiO cloud to ${method} ${path}`));
        // An unanswered request: the socket is most likely dead, reopen it.
        if (this.socket === socket) {
          this.closeSocket(new DioError('request timed out'));
        }
      }, this.timing.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer, label: `${method} ${path}` });
      try {
        socket.send(JSON.stringify({ method, path, parameters, id }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new DioError(`request not sent (${err.message})`));
      }
    });
  }

  /** Every device of the account, the unknown kinds included. */
  async listDevices() {
    const data = await this.request(listDevicesRequest());
    return (Array.isArray(data) ? data : []).map(parseDevice).filter(Boolean);
  }

  /**
   * @param {string[]} ids
   * @returns {Promise<Map<string, object>>} the state of each device, by id
   */
  async readStates(ids) {
    const states = new Map();
    if (ids.length === 0) {
      return states;
    }
    const data = await this.request(readStatesRequest(ids));
    for (const id of ids) {
      if (data && typeof data === 'object' && id in data) {
        states.set(id, parseDeviceState(data[id]));
      }
    }
    return states;
  }

  // --- Connection loop -------------------------------------------------------

  async run(generation) {
    let attempt = 0;
    while (generation === this.generation) {
      let startedAt = null;
      try {
        startedAt = await this.connectOnce(generation);
      } catch (err) {
        if (generation !== this.generation) {
          return;
        }
        if (err instanceof DioRejectedError) {
          this.emit('rejected');
          return;
        }
        this.emit('connect-failed', err);
      }
      if (generation !== this.generation) {
        return;
      }
      if (startedAt !== null && this.now() - startedAt >= this.timing.stableSessionMs) {
        attempt = 0;
      }
      const delays = this.timing.retryDelaysMs;
      const delay = delays[Math.min(attempt, delays.length - 1)];
      attempt += 1;
      this.logger.debug(`Reconnecting to the DiO cloud in ${Math.round(delay / 1000)} s`);
      await this.sleep(delay);
    }
  }

  /**
   * Log in if needed, open the socket, and wait until it closes.
   * @returns {Promise<number>} when the session went online
   */
  async connectOnce(generation) {
    const { email } = this.credentials;
    let token = await this.store.load(email);
    let fresh = false;
    if (!token) {
      token = await this.login();
      fresh = true;
    }
    if (generation !== this.generation) {
      throw new DioError('client stopped');
    }
    let session;
    try {
      session = await this.openSocket(token, generation);
    } catch (err) {
      if (!(err instanceof InvalidSessionError)) {
        throw err;
      }
      await this.store.clear();
      if (fresh) {
        throw new DioError('the DiO cloud refused a session it had just opened');
      }
      this.logger.debug('Stored DiO session refused, logging in again');
      token = await this.login();
      if (generation !== this.generation) {
        throw new DioError('client stopped');
      }
      session = await this.openSocket(token, generation);
    }
    const startedAt = this.now();
    this.online = true;
    this.emit('online');
    const reason = await session.closed;
    this.online = false;
    if (generation === this.generation) {
      this.emit('offline', reason);
    }
    return startedAt;
  }

  async login() {
    const { email, password } = this.credentials;
    const installationId = await this.store.installationId();
    let response;
    try {
      response = await this.fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password, installationId }),
        signal: AbortSignal.timeout(this.timing.loginTimeoutMs),
      });
    } catch (err) {
      // Never the request itself in the message: it holds the password.
      throw new DioError(`DiO login unreachable (${err.cause?.code ?? err.name})`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const outcome = parseLoginResponse(response.status, body);
    if (outcome.rejected) {
      throw new DioRejectedError('e-mail or password refused by the DiO cloud');
    }
    if (outcome.error) {
      throw new DioError(`DiO login failed: ${outcome.error}`);
    }
    await this.store.save(email, outcome.token);
    this.logger.debug('Logged in to the DiO cloud, session stored');
    return outcome.token;
  }

  /**
   * Open the socket with a token.
   * @returns {Promise<{ closed: Promise<Error> }>} once accepted: a promise of the reason it closes
   */
  openSocket(token, generation) {
    return new Promise((resolveOpen, rejectOpen) => {
      let socket;
      try {
        socket = new this.WebSocketImpl(socketUrl(token));
      } catch (err) {
        rejectOpen(new DioError(`DiO socket not opened (${err.name})`));
        return;
      }
      let accepted = false;
      let resolveClosed;
      const closed = new Promise((resolve) => {
        resolveClosed = resolve;
      });
      const openTimer = setTimeout(() => {
        this.closeSocket(
          new DioError('the DiO cloud did not accept the connection in time'),
          socket,
        );
      }, this.timing.connectTimeoutMs);
      // Settles the opening (refused) or the session (ended): promises settle once.
      const finish = (reason) => {
        clearTimeout(openTimer);
        if (accepted) {
          resolveClosed(reason);
        } else {
          rejectOpen(reason);
        }
      };
      this.finishers.set(socket, finish);

      this.socket = socket;
      socket.addEventListener('message', (event) => {
        if (this.socket !== socket) {
          return;
        }
        this.lastMessageAt = this.now();
        let message;
        try {
          message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
        } catch {
          this.logger.debug('Unreadable message from the DiO cloud, ignored');
          return;
        }
        const sorted = classifyMessage(message);
        if (sorted.kind === 'connection') {
          clearTimeout(openTimer);
          if (generation !== this.generation) {
            this.closeSocket(new DioError('client stopped'), socket);
          } else if (sorted.success) {
            accepted = true;
            this.startKeepalive(socket);
            resolveOpen({ closed });
          } else {
            this.closeSocket(new InvalidSessionError('session refused'), socket);
          }
          return;
        }
        this.handleMessage(sorted);
      });
      socket.addEventListener('error', () => {
        // The close event follows, with the reason.
        this.logger.debug('DiO socket error');
      });
      socket.addEventListener('close', (event) => {
        this.closeSocket(
          new DioError(`DiO socket closed (code ${event?.code ?? 'unknown'})`),
          socket,
        );
      });
    });
  }

  handleMessage(sorted) {
    if (sorted.kind === 'response') {
      const waiting = this.pending.get(sorted.id);
      if (!waiting) {
        this.logger.debug(`Answer ${sorted.id} from the DiO cloud matches no request`);
        return;
      }
      this.pending.delete(sorted.id);
      clearTimeout(waiting.timer);
      if (sorted.status === 200) {
        waiting.resolve(sorted.data);
      } else {
        waiting.reject(new DioError(`the DiO cloud answered ${sorted.status} to ${waiting.label}`));
      }
      return;
    }
    if (sorted.kind === 'state') {
      this.emit('state', sorted.id, sorted.state);
      return;
    }
    // A device renamed in the app, and messages this integration does not use.
    this.logger.debug(`DiO message ${sorted.name ?? sorted.kind} ignored`);
  }

  startKeepalive(socket) {
    clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = setInterval(
      () => {
        if (this.socket !== socket || !this.online) {
          return;
        }
        if (this.now() - this.lastMessageAt < this.timing.keepaliveMs) {
          return;
        }
        // The answer is not used: only that there is one (the request closes
        // the socket when it times out).
        this.request({ method: 'GET', path: '/user', parameters: {} }).catch((err) => {
          this.logger.debug(`DiO keepalive failed (${err.message})`);
        });
      },
      Math.max(1000, Math.round(this.timing.keepaliveMs / 4)),
    );
    this.keepaliveTimer.unref?.();
  }

  closeSocket(reason, socket = this.socket) {
    if (!socket) {
      return;
    }
    const finish = this.finishers.get(socket);
    this.finishers.delete(socket);
    if (this.socket === socket) {
      this.socket = null;
      this.online = false;
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
      for (const [id, waiting] of this.pending) {
        clearTimeout(waiting.timer);
        waiting.reject(reason);
        this.pending.delete(id);
      }
    }
    try {
      socket.close();
    } catch {
      // Already closed.
    }
    finish?.(reason);
  }

  sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.sleeping = null;
        resolve();
      }, ms);
      this.sleeping = { timer, resolve };
    });
  }

  wakeUp() {
    if (this.sleeping) {
      clearTimeout(this.sleeping.timer);
      this.sleeping.resolve();
      this.sleeping = null;
    }
  }
}
