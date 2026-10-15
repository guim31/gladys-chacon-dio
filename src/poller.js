// -----------------------------------------------------------------------------
// The container's own refresh timer.
//
// The DiO cloud pushes the changes on the WebSocket: this timer is only the
// safety net (a push lost during a reconnection, a device back online), one
// request for all the devices at the configured pace.
//
// The devices are published with `should_poll: true` and a one-minute
// `poll_frequency`, but the core cannot be trusted to call onPoll: Gladys
// 5.2.0 skips devices created without `should_poll`, and a device keeps the
// polling fields it was created with, even once the core is fixed
// (GladysAssistant/Gladys#3198). So the container refreshes by itself, and
// the core's onPoll stays as a fallback.
//
// No double work: one refresh covers every device, the timer skips a refresh
// when the last one is less than half a period old, and the core's onPoll
// (once a minute per device) when it is less than 90 % of a period old — so
// while the timer runs, the core's polls never reach the cloud.
// -----------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {() => Promise<void>} options.refresh reads and publishes every device (throws on failure)
 * @param {() => number} options.periodMs the current refresh period
 * @param {{ debug: Function }} options.logger
 * @param {boolean} [options.timers] run the periodic timer (tests may turn it off)
 * @param {() => number} [options.now]
 */
export function createPoller({ refresh, periodMs, logger, timers = true, now = () => Date.now() }) {
  let lastAt = null;
  let inFlight = null;
  let timer = null;
  let stopped = true;

  /**
   * Refresh, unless the last refresh is less than `minGap` periods old.
   * Forced: waits for a refresh in progress (it may predate a change), then
   * refreshes again.
   */
  async function run({ force = false, minGap = 0.5 } = {}) {
    while (inFlight && force) {
      await inFlight.catch(() => {});
    }
    if (inFlight) {
      return inFlight;
    }
    if (!force && lastAt !== null && now() - lastAt < periodMs() * minGap) {
      logger.debug(`Refreshed ${now() - lastAt} ms ago, skipped`);
      return undefined;
    }
    lastAt = now();
    inFlight = refresh();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await run();
      } catch {
        // Logged by the refresh itself.
      } finally {
        schedule();
      }
    }, periodMs());
    timer.unref?.();
  }

  return {
    /** (Re)start: refresh now, then every period. Errors are swallowed (logged by refresh). */
    async restart() {
      stopped = false;
      schedule();
      await run({ force: true }).catch(() => {});
    },

    /** The core's onPoll: refresh unless the timer just did. */
    fromCore() {
      return run({ minGap: 0.9 });
    },

    /** Refresh now, whatever the last one (a device just added). */
    now() {
      return run({ force: true });
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}
