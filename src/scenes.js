// -----------------------------------------------------------------------------
// Scene triggers and actions (Gladys 5.1+). Keys are forever once published.
//
// - Trigger `device_connection_changed`: a DiO device lost or found its link
//   to the cloud (Wi-Fi, power cut). Nothing else in Gladys says it: the
//   features keep their last value. "The freezer plug went offline" is the
//   scene it is for.
// - Action `move_shutters`: open, close, stop or set the position of every
//   DiO shutter added to Gladys, at once — the "group" of the DiO app. Gladys'
//   own scene actions control one shutter at a time.
// -----------------------------------------------------------------------------

export const TRIGGER = {
  CONNECTION_CHANGED: 'device_connection_changed',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGER);

export const CONNECTION = { OFFLINE: 'offline', ONLINE: 'online' };

export const SHUTTER_COMMANDS = ['open', 'close', 'stop', 'position'];

/**
 * The scene action handlers, by key. Each receives the app (src/app.js) and
 * the resolved fields, and returns the declared outputs.
 */
export const SCENE_ACTIONS = {
  async move_shutters(app, fields) {
    const command = fields?.command;
    if (!SHUTTER_COMMANDS.includes(command)) {
      throw new Error(`Unknown command "${command}"`);
    }
    let position;
    if (command === 'position') {
      position = Number(fields.position);
      if (fields.position === undefined || fields.position === null || fields.position === '') {
        throw new Error('The position is required with the "position" command');
      }
      if (!Number.isFinite(position) || position < 0 || position > 100) {
        throw new Error(`Position out of range: ${fields.position}`);
      }
    }
    const { commanded, failed } = await app.moveShutters(command, position, 'scene');
    if (commanded === 0 && failed > 0) {
      throw new Error(`No shutter could be commanded (${failed} failed)`);
    }
    return { commanded, failed };
  },
};
