// -----------------------------------------------------------------------------
// The integration: Gladys on one side, the DiO cloud client on the other.
//
// - Discovery: the device list of the DiO account, one Gladys device per
//   supported equipment (src/devices.js).
// - States: pushed by the cloud on the WebSocket, read again by the refresh
//   timer (src/poller.js), published only when they change, and re-sent at
//   least every 6 hours (heartbeat) so a still shutter is not "no recent
//   value" in Gladys. Only the devices the user added to Gladys are published.
// - Each device shows a transport pill: "cloud", or "unreachable" when the
//   cloud sees it offline or the cloud itself is out of reach.
// - Commands: one WebSocket request each; the cloud pushes the new state.
//
// Logs stay quiet: info is for the lifecycle (start, connection, loss and
// return, a device unsupported, one line per user command), the rest is
// debug. No e-mail, password or token is ever logged.
// -----------------------------------------------------------------------------

import { isConfigured, normalizeConfig, sameCredentials } from './config.js';
import { KIND, moveRequest, openLevelRequest, switchRequest } from './dio/protocol.js';
import {
  FEATURE,
  buildDevice,
  commandFor,
  parseDeviceExternalId,
  parseFeatureExternalId,
  statesOf,
} from './devices.js';
import { STATUS, localized, LANGS, TEXT } from './i18n.js';
import { createIssueLog } from './issues.js';
import { createPoller } from './poller.js';
import { CONNECTION, SCENE_ACTIONS, TRIGGER } from './scenes.js';
import { ACTION_COMMAND, WIDGET_KEY, buildShuttersContent } from './widgets.js';

export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
// A ring older than this, seen by a refresh after a reconnection, is history.
export const RING_FRESH_MS = 2 * 60 * 1000;
export const RING_PULSE_MS = 5000;
// No push after a command: read the device to show its real state.
export const CONFIRM_DELAY_MS = 8000;
// The core accepts one widget refresh request per 10 s.
export const WIDGET_REFRESH_GAP_MS = 10000;

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {import('./dio/client.js').DioClient} options.client
 * @param {{ debug: Function, info: Function, warn: Function, error: Function }} options.logger
 * @param {boolean} [options.timers] run the refresh timer (tests may turn it off)
 * @param {() => number} [options.now]
 * @param {Partial<{ ringPulseMs: number, confirmDelayMs: number, widgetRefreshGapMs: number }>} [options.timing]
 */
export function createApp({
  gladys,
  client,
  logger,
  timers = true,
  now = () => Date.now(),
  timing = {},
}) {
  const ringPulseMs = timing.ringPulseMs ?? RING_PULSE_MS;
  const confirmDelayMs = timing.confirmDelayMs ?? CONFIRM_DELAY_MS;
  const widgetRefreshGapMs = timing.widgetRefreshGapMs ?? WIDGET_REFRESH_GAP_MS;
  const issues = createIssueLog(logger);

  let config = null;
  let everOnline = false;
  // The cloud refused the credentials: saving the configuration, even
  // unchanged, tries again.
  let rejected = false;
  /** Every device of the account (parsed), by DiO id; the unsupported kinds too. */
  let devices = new Map();
  /** The last known state of each device, by DiO id. */
  let states = new Map();
  /** The last transport published, by device external id. */
  const transports = new Map();
  /** The last doorbell event seen, by DiO id. */
  const lastRing = new Map();
  /** When the ring pulse of a doorbell ends, by DiO id. */
  const pulseEnds = new Map();
  const unsupportedLogged = new Set();
  const pendingTimers = new Set();
  let widgetTimer = null;
  let widgetLastAt = 0;

  const poller = createPoller({
    refresh: () => refresh(),
    periodMs: () => (config ?? normalizeConfig()).refreshMs,
    logger,
    timers,
    now,
  });

  // --- Helpers ---------------------------------------------------------------

  const later = (ms, fn) => {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      fn();
    }, ms);
    timer.unref?.();
    pendingTimers.add(timer);
  };

  const idsOf = (dio) => gladys.externalIds(dio.kind, dio.id);

  /** The supported DiO devices the user added to Gladys. */
  function createdDevices() {
    const created = new Set((gladys.devices ?? []).map((device) => device.external_id));
    return [...devices.values()].filter((dio) => dio.kind && created.has(idsOf(dio).device));
  }

  async function setStatus(connected, message) {
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  async function publishStates(list) {
    if (list.length === 0) {
      return;
    }
    try {
      await gladys.publishChangedStates(list, { heartbeat: HEARTBEAT_MS });
      issues.ok('publish', 'States accepted by Gladys again');
    } catch (err) {
      issues.fail('publish', `States not accepted by Gladys (${err.message})`);
    }
  }

  async function publishTransports(entries, { force = false } = {}) {
    const changed = entries.filter(
      (entry) => force || transports.get(entry.external_id) !== entry.transport,
    );
    if (changed.length === 0) {
      return;
    }
    try {
      await gladys.publishTransports(changed);
      for (const entry of changed) {
        transports.set(entry.external_id, entry.transport);
      }
    } catch (err) {
      logger.debug(`Transports not sent (${err.message})`);
    }
  }

  const transportOf = (dio) =>
    client.online && states.get(dio.id)?.connected !== false ? 'cloud' : 'unreachable';

  function requestWidgetRefresh() {
    const send = () => {
      widgetTimer = null;
      widgetLastAt = now();
      try {
        gladys.requestWidgetRefresh(WIDGET_KEY);
      } catch (err) {
        logger.debug(`Widget refresh not requested (${err.message})`);
      }
    };
    if (widgetTimer) {
      return;
    }
    const wait = widgetLastAt + widgetRefreshGapMs - now();
    if (wait <= 0) {
      send();
    } else {
      widgetTimer = setTimeout(send, wait);
      widgetTimer.unref?.();
    }
  }

  // --- Device list -----------------------------------------------------------

  function discoveredDevices() {
    return [...devices.values()]
      .filter((dio) => dio.kind)
      .map((dio) => buildDevice(gladys, dio, config.language));
  }

  /** Read the device list of the account and publish it to Gladys. */
  async function syncDevices() {
    const list = await client.listDevices();
    devices = new Map(list.map((dio) => [dio.id, dio]));
    for (const dio of list) {
      if (!dio.kind && !unsupportedLogged.has(dio.type)) {
        unsupportedLogged.add(dio.type);
        logger.info(
          `DiO device not supported yet: model "${dio.model}", type "${dio.type}" (ignored)`,
        );
      }
    }
    logger.debug(`${list.length} device(s) on the DiO account`);
    await gladys.publishDiscoveredDevices(discoveredDevices());
  }

  // --- States ----------------------------------------------------------------

  /**
   * Take in the state of one device (pushed or read): merge, publish what
   * changed, the transport, the doorbell ring and the connection trigger.
   */
  async function applyState(id, incoming, { created, pushed = false }) {
    const dio = devices.get(id);
    if (!dio || !dio.kind) {
      logger.debug(`State of an unknown DiO device ignored`);
      return;
    }
    const previous = states.get(id);
    // When the cloud last pushed a state: a read in flight when a command is
    // sent answers with the state from before it, a push comes after.
    const merged = { ...previous, ...incoming, ...(pushed ? { pushedAt: now() } : {}) };
    states.set(id, merged);
    if (!created.has(idsOf(dio).device)) {
      return;
    }
    const ids = idsOf(dio);

    await publishStates(statesOf(gladys, dio, merged));
    await publishTransports([{ external_id: ids.device, transport: transportOf(dio) }]);

    if (previous?.connected !== undefined && previous.connected !== merged.connected) {
      const state = merged.connected ? CONNECTION.ONLINE : CONNECTION.OFFLINE;
      logger.info(`DiO device "${dio.name}" is ${state}`);
      try {
        await gladys.publishSceneEvent(TRIGGER.CONNECTION_CHANGED, {
          device: ids.device,
          state,
          device_name: dio.name,
        });
      } catch (err) {
        logger.debug(`Scene event not sent (${err.message})`);
      }
    }

    if (dio.kind === KIND.DOORBELL) {
      await checkRing(dio, incoming.lastEvent);
    }
    const seen = (state) => [state?.connected, state?.position, state?.movement].join('|');
    if (dio.kind === KIND.SHUTTER && seen(previous) !== seen(merged)) {
      requestWidgetRefresh();
    }
  }

  async function checkRing(dio, event) {
    if (!event) {
      return;
    }
    const seen = lastRing.get(dio.id);
    lastRing.set(dio.id, event.ts);
    if (event.type !== 'ring' || event.ts === seen) {
      return;
    }
    const at = Date.parse(event.ts);
    if (!Number.isFinite(at) || now() - at > RING_FRESH_MS) {
      return;
    }
    const ring = idsOf(dio).feature(FEATURE.RING);
    logger.debug(`Doorbell ring on a DiO device`);
    pulseEnds.set(dio.id, now() + ringPulseMs);
    await publishStates([{ device_feature_external_id: ring, state: 1 }]);
    later(ringPulseMs, () => {
      pulseEnds.delete(dio.id);
      publishStates([{ device_feature_external_id: ring, state: 0 }]);
    });
  }

  /** The resting state of the doorbell features (the heartbeat keeps it recent). */
  function restingStates(dios) {
    return dios
      .filter((dio) => dio.kind === KIND.DOORBELL)
      .map((dio) => ({ device_feature_external_id: idsOf(dio).feature(FEATURE.RING), state: 0 }));
  }

  /** Read every device added to Gladys, publish their states. Throws on failure. */
  async function refresh() {
    if (!client.online) {
      logger.debug('Refresh skipped: not connected to the DiO cloud');
      return;
    }
    const targets = createdDevices();
    if (targets.length === 0) {
      return;
    }
    try {
      const read = await client.readStates(targets.map((dio) => dio.id));
      issues.ok('refresh', 'Reading the DiO devices works again');
      const created = new Set(targets.map((dio) => idsOf(dio).device));
      await publishStates(restingStates(targets.filter((dio) => !pulsing(dio))));
      for (const [id, state] of read) {
        await applyState(id, state, { created });
      }
    } catch (err) {
      issues.fail('refresh', `Reading the DiO devices failed (${err.message})`);
      throw err;
    }
  }

  // A doorbell whose ring was just published: its 0 comes with the pulse end.
  const pulsing = (dio) => pulseEnds.has(dio.id);

  /** A device just added (or updated) in Gladys: send everything now. */
  async function onDeviceAdded(device) {
    const target = parseDeviceExternalId(gladys, device.external_id);
    const dio = target && devices.get(target.dioId);
    if (!dio) {
      return;
    }
    const known = states.get(dio.id);
    if (known) {
      await publishStates([...statesOf(gladys, dio, known), ...restingStates([dio])]);
      await publishTransports([{ external_id: device.external_id, transport: transportOf(dio) }], {
        force: true,
      });
    } else {
      await poller.now().catch(() => {});
    }
    if (dio.kind === KIND.SHUTTER) {
      requestWidgetRefresh();
    }
  }

  // --- Commands --------------------------------------------------------------

  async function send(dio, command) {
    let request;
    if (command.action === 'move') {
      request = moveRequest(dio.id, command.movement);
    } else if (command.action === 'level') {
      request = openLevelRequest(dio.id, command.level);
    } else {
      request = switchRequest(dio.id, command.on);
    }
    await client.request(request);
    // The cloud pushes the new state; if it does not, read it.
    const sentAt = now();
    later(confirmDelayMs, async () => {
      if ((states.get(dio.id)?.pushedAt ?? -1) >= sentAt || !client.online) {
        return;
      }
      try {
        const read = await client.readStates([dio.id]);
        const created = new Set([idsOf(dio).device]);
        for (const [id, state] of read) {
          await applyState(id, state, { created });
        }
      } catch (err) {
        logger.debug(`Confirmation read failed (${err.message})`);
      }
    });
  }

  const describe = (command) =>
    command.action === 'move'
      ? command.movement
      : command.action === 'level'
        ? `position ${command.level} %`
        : command.on
          ? 'on'
          : 'off';

  async function onSetValue(device, feature, value) {
    const target = parseFeatureExternalId(gladys, feature.external_id);
    const dio = target && devices.get(target.dioId);
    if (!dio) {
      throw new Error(`Unknown DiO device for ${feature.external_id}`);
    }
    const command = commandFor(target, value);
    if (!client.online) {
      throw new Error('Not connected to the DiO cloud');
    }
    logger.info(`Command: "${dio.name}" ${describe(command)}`);
    await send(dio, command);
  }

  /**
   * Command every DiO shutter added to Gladys (scene action, widget).
   * @param {'open'|'close'|'stop'|'position'} command
   * @param {number} [position]
   * @param {string} origin for the log line
   */
  async function moveShutters(command, position, origin) {
    const shutters = createdDevices().filter((dio) => dio.kind === KIND.SHUTTER);
    if (shutters.length === 0) {
      return { commanded: 0, failed: 0 };
    }
    if (!client.online) {
      throw new Error('Not connected to the DiO cloud');
    }
    const action =
      command === 'position'
        ? { action: 'level', level: Math.round(position) }
        : { action: 'move', movement: { open: 'up', close: 'down', stop: 'stop' }[command] };
    logger.info(`Command (${origin}): ${shutters.length} shutter(s) ${describe(action)}`);
    const results = await Promise.allSettled(shutters.map((dio) => send(dio, action)));
    const failed = results.filter((result) => result.status === 'rejected');
    for (const result of failed) {
      logger.warn(`Shutter command failed (${result.reason?.message})`);
    }
    return { commanded: results.length - failed.length, failed: failed.length };
  }

  // --- Cloud connection ------------------------------------------------------

  client.on('online', async () => {
    issues.ok('cloud', 'DiO cloud reachable again');
    logger.info(everOnline ? 'Connection to the DiO cloud is back' : 'Connected to the DiO cloud');
    everOnline = true;
    try {
      await syncDevices();
      await setStatus(true);
    } catch (err) {
      logger.error(`Publishing the DiO devices failed (${err.message})`);
      await setStatus(false, STATUS.publishFailed);
      return;
    }
    await poller.restart();
    // A device without state (no answer) still gets its pill.
    await publishTransports(
      createdDevices().map((dio) => ({
        external_id: idsOf(dio).device,
        transport: transportOf(dio),
      })),
    );
    requestWidgetRefresh();
  });

  client.on('offline', async (reason) => {
    logger.info(`Connection to the DiO cloud lost (${reason?.message ?? 'unknown reason'})`);
    await setStatus(false, STATUS.lost);
    await publishTransports(
      createdDevices().map((dio) => ({ external_id: idsOf(dio).device, transport: 'unreachable' })),
    );
    requestWidgetRefresh();
  });

  client.on('connect-failed', async (err) => {
    if (!issues.isFailing('cloud')) {
      await setStatus(false, STATUS.unreachable);
    }
    issues.fail('cloud', `DiO cloud unreachable (${err.message})`);
  });

  client.on('rejected', async () => {
    rejected = true;
    logger.error('DiO refused the e-mail or the password: waiting for a new configuration');
    await setStatus(false, STATUS.rejected);
  });

  client.on('state', async (id, state) => {
    const created = new Set(createdDevices().map((dio) => idsOf(dio).device));
    await applyState(id, state, { created, pushed: true });
  });

  // --- Configuration ---------------------------------------------------------

  /** Apply a new configuration (first one: `previous` is null). */
  async function applyConfig(previous) {
    const credentialsChanged = !previous || !sameCredentials(previous, config) || rejected;
    if (credentialsChanged) {
      rejected = false;
      if (previous && isConfigured(previous)) {
        // Another account, or a new password: close the old session.
        await client.logout();
        devices = new Map();
        states = new Map();
        transports.clear();
        lastRing.clear();
        pulseEnds.clear();
        everOnline = false;
      }
      if (!isConfigured(config)) {
        client.stop();
        poller.stop();
        logger.info('Not configured yet: waiting for the DiO e-mail and password');
        await setStatus(false, STATUS.notConfigured);
        return;
      }
      await setStatus(false, STATUS.connecting);
      // Not awaited: the client keeps the connection up on its own.
      client.start({ email: config.email, password: config.password });
      return;
    }
    if (client.online) {
      if (previous.language !== config.language) {
        // The feature names of the devices still to be added.
        await gladys.publishDiscoveredDevices(discoveredDevices()).catch((err) => {
          logger.error(`Publishing the DiO devices failed (${err.message})`);
        });
      }
      await poller.restart();
    }
  }

  // --- Registration ------------------------------------------------------------

  function register() {
    gladys.on('connected', async () => {
      try {
        const previous = config;
        config = normalizeConfig(await gladys.getConfig());
        if (previous && sameCredentials(previous, config) && client.online) {
          // Gladys restarted, the DiO session did not: sync again.
          await syncDevices();
          await setStatus(true);
          transports.clear();
          await poller.restart();
          await publishTransports(
            createdDevices().map((dio) => ({
              external_id: idsOf(dio).device,
              transport: transportOf(dio),
            })),
          );
          return;
        }
        await applyConfig(previous);
      } catch (err) {
        logger.error(`Post-connection initialization failed (${err.message})`);
        await setStatus(false, STATUS.initFailed);
      }
    });

    gladys.onConfigUpdated(async (raw) => {
      logger.info('Configuration updated');
      const previous = config;
      config = normalizeConfig(raw);
      await applyConfig(previous);
    });

    gladys.onScanRequest(async () => {
      logger.info('Scan requested: reading the DiO device list');
      if (client.online) {
        await syncDevices();
      } else if (devices.size > 0) {
        await gladys.publishDiscoveredDevices(discoveredDevices());
      }
    });

    gladys.onSetValue(onSetValue);

    gladys.onPoll(async (device) => {
      if (!parseDeviceExternalId(gladys, device.external_id)) {
        return;
      }
      await poller.fromCore();
    });
    gladys.onDeviceCreated(onDeviceAdded);
    gladys.onDeviceUpdated(onDeviceAdded);

    gladys.onAction('list_devices', async () => {
      logger.info('Action: list the DiO devices');
      return listDevicesReport();
    });

    for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
      gladys.onSceneAction(key, (fields) => handler(api, fields));
    }

    gladys.onWidgetGet(WIDGET_KEY, async ({ language } = {}) =>
      buildShuttersContent({
        configured: Boolean(config && isConfigured(config)),
        online: client.online,
        shutters: createdDevices()
          .filter((dio) => dio.kind === KIND.SHUTTER)
          .map((dio) => ({ name: dio.name, state: states.get(dio.id) })),
        language: LANGS.includes(language) ? language : (config?.language ?? 'fr'),
      }),
    );

    gladys.onWidgetAction(WIDGET_KEY, async (actionKey) => {
      const command = ACTION_COMMAND[actionKey];
      if (!command) {
        throw new Error(`Unknown widget action ${actionKey}`);
      }
      const { commanded, failed } = await moveShutters(command, undefined, 'widget');
      return failed > 0
        ? localized('movedPartly', commanded, failed)
        : localized('moved', commanded);
    });
  }

  /** The message of the "list devices" action: what the account holds, supported or not. */
  async function listDevicesReport() {
    if (!client.online) {
      return localized('reportNotConnected');
    }
    await syncDevices();
    const list = [...devices.values()];
    if (list.length === 0) {
      return localized('reportNone');
    }
    return Object.fromEntries(
      LANGS.map((lang) => {
        const t = TEXT[lang];
        const lines = list.map((dio) => {
          const notes = [];
          if (!dio.kind) {
            notes.push(`${t.reportUnsupported}, type ${dio.type || '?'}`);
          } else if (states.get(dio.id)?.connected === false) {
            notes.push(t.reportOffline);
          }
          const model = dio.model ? ` (${dio.model})` : '';
          return `• ${dio.name}${model}${notes.length ? ` — ${notes.join(', ')}` : ''}`;
        });
        const hint = list.some((dio) => !dio.kind) ? `\n\n${t.reportUnsupportedHint}` : '';
        return [lang, `${t.reportTitle(list.length)}\n${lines.join('\n')}${hint}`];
      }),
    );
  }

  function stop() {
    poller.stop();
    client.stop();
    clearTimeout(widgetTimer);
    for (const timer of pendingTimers) {
      clearTimeout(timer);
    }
    pendingTimers.clear();
  }

  const api = { register, stop, moveShutters, refresh, poller };
  return api;
}
