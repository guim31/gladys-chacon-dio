// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Minutes between two reads of every device, the safety net of the real-time
// channel (see src/poller.js). Offered as a select: a `number` field is
// rendered without `step` by Gladys.
export const REFRESH_MINUTES = ['1', '5', '15', '30'];

export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  refresh_minutes: '5',
  language: 'fr',
};

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  return {
    email: typeof source.email === 'string' ? source.email.trim() : '',
    // Kept as typed: spaces may be part of a password.
    password: typeof source.password === 'string' ? source.password : '',
    refreshMs: Number(pick('refresh_minutes', REFRESH_MINUTES)) * 60 * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/** Both credentials are filled in. */
export const isConfigured = (config) => Boolean(config.email && config.password);

/** Same DiO account (the e-mail is not case-sensitive), same password. */
export const sameCredentials = (a, b) =>
  a.email.toLowerCase() === b.email.toLowerCase() && a.password === b.password;
