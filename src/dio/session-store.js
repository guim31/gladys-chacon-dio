// -----------------------------------------------------------------------------
// The DiO session token, kept in /data.
//
// Logging in again at every restart would send the password over the network
// for nothing, and a cloud that sees many logins may lock the account. The
// token is stored with a hash of the account e-mail: another account in the
// configuration never reuses it. The file is the container's own (/data is
// the only writable volume, see the Dockerfile) and readable by its user only.
//
// The installation id the login sends is kept in the same file: the DiO app
// sends one per phone, this integration one per Gladys.
// -----------------------------------------------------------------------------

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE_NAME = 'dio-session.json';

/** A stable, non-reversible key for an account (the e-mail is not case-sensitive). */
export const accountKey = (email) =>
  createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

/**
 * @param {object} options
 * @param {string|null} options.dir the folder of the file (null: memory only)
 * @param {{ debug: Function }} options.logger
 */
export function createSessionStore({ dir, logger }) {
  const path = dir ? join(dir, FILE_NAME) : null;
  let cache = null;

  async function read() {
    if (cache) {
      return cache;
    }
    cache = { version: 1, installation_id: randomUUID(), account: null, token: null };
    if (!path) {
      return cache;
    }
    try {
      const stored = JSON.parse(await readFile(path, 'utf8'));
      if (stored && typeof stored === 'object') {
        cache = {
          version: 1,
          installation_id:
            typeof stored.installation_id === 'string' && stored.installation_id
              ? stored.installation_id
              : cache.installation_id,
          account: typeof stored.account === 'string' ? stored.account : null,
          token: typeof stored.token === 'string' && stored.token ? stored.token : null,
        };
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.debug(`Session file unreadable, starting over (${err.code ?? err.name})`);
      }
    }
    return cache;
  }

  async function write() {
    if (!path) {
      return;
    }
    try {
      await mkdir(dir, { recursive: true });
      const temporary = `${path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(cache)}\n`, { mode: 0o600 });
      await rename(temporary, path);
    } catch (err) {
      // Not fatal: the token lives in memory until the next restart.
      logger.debug(`Session file not written (${err.code ?? err.name})`);
    }
  }

  return {
    /** The installation id sent with the login. */
    async installationId() {
      const stored = await read();
      if (!path || stored.account !== null || stored.token !== null) {
        return stored.installation_id;
      }
      // First use: keep the id even before any successful login.
      await write();
      return stored.installation_id;
    },

    /** The token of this account, or null. */
    async load(email) {
      const stored = await read();
      return stored.account === accountKey(email) ? stored.token : null;
    },

    async save(email, token) {
      await read();
      cache.account = accountKey(email);
      cache.token = token;
      await write();
    },

    /** Forget the token (refused by the cloud, or another account). */
    async clear() {
      const stored = await read();
      if (stored.token === null && stored.account === null) {
        return;
      }
      cache.account = null;
      cache.token = null;
      await write();
    },
  };
}
