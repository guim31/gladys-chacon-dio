// -----------------------------------------------------------------------------
// The "DiO shutters" dashboard widget (Gladys 5.1+): every DiO shutter added
// to Gladys at a glance (open, closed, position, moving, offline), and three
// buttons to open, stop or close them all at once — what the DiO app calls a
// group, and what Gladys has no standard control for.
//
// Pure builders: the data comes from src/app.js. Budget of the core: 1 status
// list (10 rows at most), 2 texts, 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { text } from './i18n.js';

export const WIDGET_KEY = 'shutters';

/** Widget action keys, one per button (the core drops a button whose key is taken). */
export const WIDGET_ACTION = {
  OPEN_ALL: 'open_all',
  STOP_ALL: 'stop_all',
  CLOSE_ALL: 'close_all',
};

export const ACTION_COMMAND = {
  [WIDGET_ACTION.OPEN_ALL]: 'open',
  [WIDGET_ACTION.STOP_ALL]: 'stop',
  [WIDGET_ACTION.CLOSE_ALL]: 'close',
};

const MAX_ROWS = 10;
const TTL_SECONDS = 60;

/**
 * How a shutter reads in one language.
 * @param {{ connected?: boolean, position?: number, movement?: string }|undefined} state
 * @returns {{ value: string, color: string }}
 */
export function describeShutter(state, language) {
  if (!state) {
    return { value: text(language, 'unknown'), color: WIDGET_COLORS.NEUTRAL };
  }
  if (state.connected === false) {
    return { value: text(language, 'offline'), color: WIDGET_COLORS.DANGER };
  }
  if (state.movement === 'up') {
    return { value: text(language, 'opening'), color: WIDGET_COLORS.INFO };
  }
  if (state.movement === 'down') {
    return { value: text(language, 'closing'), color: WIDGET_COLORS.INFO };
  }
  if (state.position === 100) {
    return { value: text(language, 'open'), color: WIDGET_COLORS.SUCCESS };
  }
  if (state.position === 0) {
    return { value: text(language, 'closed'), color: WIDGET_COLORS.NEUTRAL };
  }
  if (typeof state.position === 'number') {
    return { value: `${state.position} %`, color: WIDGET_COLORS.WARNING };
  }
  return { value: text(language, 'unknown'), color: WIDGET_COLORS.NEUTRAL };
}

const textOf = (language, key, variant) => ({ type: 'text', variant, text: text(language, key) });

/**
 * @param {object} options
 * @param {boolean} options.configured
 * @param {boolean} options.online
 * @param {{ name: string, state?: object }[]} options.shutters the shutters added to Gladys
 * @param {string} options.language the language of the dashboard
 */
export function buildShuttersContent({ configured, online, shutters, language }) {
  if (!configured) {
    return { ttl_seconds: TTL_SECONDS, components: [textOf(language, 'notConfigured', 'body')] };
  }
  if (shutters.length === 0) {
    return { ttl_seconds: TTL_SECONDS, components: [textOf(language, 'noShutter', 'body')] };
  }
  const components = [];
  if (!online) {
    components.push(textOf(language, 'notConnected', 'caption'));
  }
  components.push({
    type: 'status',
    items: [...shutters]
      .sort((a, b) => a.name.localeCompare(b.name, language))
      .slice(0, MAX_ROWS)
      .map(({ name, state }) => ({
        label: name.slice(0, 40),
        ...describeShutter(state, language),
      })),
  });
  if (online) {
    // The current state is told by the rows, never by a button style: the
    // `primary` style does not show in dark mode (GladysAssistant/Gladys#3153).
    components.push(
      button(language, 'openAll', 'chevrons-up', WIDGET_ACTION.OPEN_ALL),
      button(language, 'stopAll', 'square', WIDGET_ACTION.STOP_ALL),
      button(language, 'closeAll', 'chevrons-down', WIDGET_ACTION.CLOSE_ALL),
    );
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

function button(language, labelKey, icon, actionKey) {
  return {
    type: 'button',
    label: text(language, labelKey),
    icon,
    style: 'secondary',
    action: { key: actionKey },
  };
}
