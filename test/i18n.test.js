// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code, the four documentation files (same sections). German says "du",
// never the polite "Sie"; Spanish says "usted".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { NAMES, STATUS, TEXT, LANGS as TEXT_LANGS } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)(?!\p{L})/u;
// Spanish: "usted", so never the familiar "tú" forms.
const FAMILIAR_SPANISH = /(?<!\p{L})(tú|tu|tus|te|ti|contigo)(?!\p{L})/iu;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  if (lang === 'es' && FAMILIAR_SPANISH.test(text)) {
    found.push(`${path} uses the familiar form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      const limit = typeof max === 'function' ? max(key) : max;
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, limit));
    }
  }
  return found;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(NAMES), LANGS);
  assert.deepEqual(TEXT_LANGS, LANGS);
  const options = manifest.config_schema.find((field) => field.key === 'language').options;
  assert.deepEqual(
    options.map((option) => option.value),
    LANGS,
  );
});

test('the name is the brand, the same in every language', () => {
  assert.equal(manifest.name, 'Chacon DiO');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 40, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the catalog description holds 10 characters at least in every language', () => {
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('the feature names exist in every language', () => {
  assert.deepEqual(tableProblems(NAMES, 'NAMES', MAX.featureName), []);
});

test('the status messages exist in every language', () => {
  const found = Object.entries(STATUS).flatMap(([key, value]) =>
    problems(value, `STATUS.${key}`, MAX.message),
  );
  assert.deepEqual(found, []);
});

test('the texts of the code exist in every language', () => {
  // Rendered with sample values; the widget buttons and rows are short.
  const SHORT = new Set(['openAll', 'stopAll', 'closeAll']);
  const ROW = new Set(['open', 'closed', 'opening', 'closing', 'offline', 'unknown']);
  const render = (value) => (typeof value === 'function' ? value(12, 3) : value);
  const max = (key) => (SHORT.has(key) ? MAX.short : ROW.has(key) ? 40 : MAX.message);
  assert.deepEqual(tableProblems(TEXT, 'TEXT', max, render), []);
});

// --- Documentation -------------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

const headings = (markdown, level) =>
  markdown.split('\n').filter((line) => line.startsWith(`${'#'.repeat(level)} `));

test('the four documentation files have the same sections', () => {
  for (const level of [2, 3]) {
    const counts = LANGS.map((lang) => headings(docs[lang], level).length);
    assert.deepEqual(
      counts,
      LANGS.map(() => counts[0]),
      `level ${level} headings: ${LANGS.map((l, i) => `${l} ${counts[i]}`).join(', ')}`,
    );
  }
  assert.ok(headings(docs.en, 2).length >= 8, 'the documentation covers the required sections');
});

test('the documentation says the hardware was not available, and the affiliation', () => {
  const said = {
    en: [/without the hardware/i, /not affiliated with Chacon/i],
    fr: [/sans le matériel/i, /sans lien avec Chacon/i],
    de: [/ohne die Hardware/i, /nicht mit Chacon verbunden/i],
    es: [/sin el hardware/i, /sin relación con Chacon/i],
  };
  for (const lang of LANGS) {
    for (const pattern of said[lang]) {
      assert.match(docs[lang], pattern, `docs/${lang}.md`);
    }
  }
});

test('the German documentation says "du", the Spanish one "usted"', () => {
  assert.doesNotMatch(docs.de, POLITE_GERMAN);
  assert.doesNotMatch(docs.es, FAMILIAR_SPANISH);
});

test('the guard catches a missing language, an empty text and the wrong forms', () => {
  assert.equal(problems({ en: 'Light', fr: 'Éclairage', de: 'Licht' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Light', fr: 'Éclairage', de: '', es: 'Luz' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Gerät', 'Ihre IP', 'mit Ihrem', 'Ihnen']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  for (const familiar of ['Abre tu app', 'si tú quieres']) {
    assert.equal(
      problems({ en: 'a', fr: 'a', de: 'a', es: familiar }, 'x', 60).length,
      1,
      familiar,
    );
  }
  // Words that only contain the letters stay allowed.
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'tuya' }, 'x', 60),
    [],
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_actions[0].fields[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_actions[0].fields[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});
