// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the fake DiO cloud, the real
// client and app in between, a recording logger, and a temporary /data.
// -----------------------------------------------------------------------------

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { DioClient } from '../../src/dio/client.js';
import { createSessionStore } from '../../src/dio/session-store.js';
import { EMAIL, PASSWORD, createFakeDio } from './fakeDio.js';

/** A logger that keeps every line, by level. */
export function createRecordingLogger() {
  const lines = [];
  const make = (name) => {
    const log =
      (level) =>
      (...args) =>
        lines.push({
          level,
          name,
          text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
        });
    return {
      debug: log('debug'),
      info: log('info'),
      warn: log('warn'),
      error: log('error'),
      child: (child) => make(name ? `${name}:${child}` : child),
    };
  };
  const logger = make('chacon-dio');
  logger.lines = lines;
  logger.at = (level) => lines.filter((line) => line.level === level).map((line) => line.text);
  return logger;
}

/** Resolve once `predicate` is true (polled), or fail after `timeoutMs`. */
export async function until(predicate, { timeoutMs = 2000, label = 'condition' } = {}) {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export const CREDENTIALS = { email: EMAIL, password: PASSWORD };

/**
 * @param {object} [options]
 * @param {object} [options.config] the integration config (credentials by default)
 * @param {boolean} [options.connect] connect Gladys and wait for the cloud
 * @param {boolean} [options.addAll] add every discovered device to Gladys
 * @param {object} [options.dio] options of the fake DiO cloud
 * @param {object} [options.timing] timing of the app
 * @param {object} [options.clientTiming] timing of the client
 */
export async function createWorld({
  config = CREDENTIALS,
  connect = true,
  addAll = true,
  dio: dioOptions,
  timing = {},
  clientTiming = {},
  timers = false,
  dataDir,
} = {}) {
  const dio = createFakeDio(dioOptions);
  const dir = dataDir ?? (await mkdtemp(join(tmpdir(), 'chacon-dio-')));
  const logger = createRecordingLogger();
  const store = createSessionStore({ dir, logger: logger.child('session') });
  const client = new DioClient({
    store,
    logger: logger.child('cloud'),
    fetch: dio.fetch,
    WebSocket: dio.WebSocket,
    timing: {
      requestTimeoutMs: 300,
      connectTimeoutMs: 300,
      retryDelaysMs: [20, 40],
      keepaliveMs: 60 * 60 * 1000,
      ...clientTiming,
    },
  });
  const gladys = createFakeGladys({ config });
  const app = createApp({
    gladys,
    client,
    logger,
    timers,
    timing: { ringPulseMs: 30, confirmDelayMs: 50, widgetRefreshGapMs: 20, ...timing },
  });
  app.register();

  const world = {
    dio,
    dir,
    logger,
    store,
    client,
    gladys,
    app,
    /** Add discovered devices to Gladys, as the user does from the Discovery tab. */
    async add(devices = gladys.fake.discoveredDevices) {
      for (const device of devices) {
        await gladys.fake.deviceCreated(device);
      }
    },
    device(name) {
      return gladys.fake.discoveredDevices.find((device) => device.name === name);
    },
    feature(name, key) {
      return world.device(name).features.find((f) => f.external_id.endsWith(`:${key}`));
    },
    async stop() {
      app.stop();
      if (!dataDir) {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };

  if (connect) {
    await gladys.connect();
    if (config.email && config.password) {
      await until(() => gladys.fake.discoveredDevices.length > 0, { label: 'discovery' });
      await until(() => gladys.fake.connectionStatus?.connected === true, { label: 'status' });
      if (addAll) {
        await world.add();
        await until(() => gladys.fake.states.length > 0, { label: 'first states' });
      }
    }
  }
  return world;
}
