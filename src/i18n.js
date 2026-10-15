// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish says "usted" (house rule, checked by
// test/i18n.test.js). Brand and product names are not translated.
// -----------------------------------------------------------------------------

/** Feature names, fixed when the user adds the device (config `language`). */
export const NAMES = {
  en: {
    position: 'Position',
    movement: 'Movement',
    light: 'Light',
    plug: 'Plug',
    ring: 'Ring',
  },
  fr: {
    position: 'Position',
    movement: 'Mouvement',
    light: 'Éclairage',
    plug: 'Prise',
    ring: 'Sonnerie',
  },
  de: {
    position: 'Position',
    movement: 'Bewegung',
    light: 'Licht',
    plug: 'Steckdose',
    ring: 'Klingeln',
  },
  es: {
    position: 'Posición',
    movement: 'Movimiento',
    light: 'Luz',
    plug: 'Enchufe',
    ring: 'Timbrazo',
  },
};

/** Connection status messages of the Configuration screen. */
export const STATUS = {
  notConfigured: {
    en: 'Enter the e-mail and password of your DiO One account.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte DiO One.',
    de: 'Gib die E-Mail-Adresse und das Passwort deines DiO-One-Kontos ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta DiO One.',
  },
  connecting: {
    en: 'Connecting to the DiO cloud…',
    fr: 'Connexion au cloud DiO…',
    de: 'Verbindung zur DiO-Cloud…',
    es: 'Conectando con la nube DiO…',
  },
  rejected: {
    en: 'DiO refused the e-mail or the password: check them, then save the configuration.',
    fr: 'DiO refuse l’e-mail ou le mot de passe : vérifiez-les, puis enregistrez la configuration.',
    de: 'DiO lehnt die E-Mail-Adresse oder das Passwort ab: prüfe sie und speichere die Konfiguration.',
    es: 'DiO rechaza el correo o la contraseña: compruébelos y guarde la configuración.',
  },
  unreachable: {
    en: 'DiO cloud unreachable. New attempt in a moment.',
    fr: 'Cloud DiO injoignable. Nouvel essai dans un instant.',
    de: 'DiO-Cloud nicht erreichbar. Neuer Versuch in Kürze.',
    es: 'Nube DiO inaccesible. Nuevo intento en un momento.',
  },
  lost: {
    en: 'Connection to the DiO cloud lost, reconnecting.',
    fr: 'Connexion au cloud DiO perdue, reconnexion en cours.',
    de: 'Verbindung zur DiO-Cloud verloren, neue Verbindung läuft.',
    es: 'Conexión con la nube DiO perdida, reconectando.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les journaux de l’intégration.',
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  publishFailed: {
    en: 'Connected to DiO, but Gladys refused the device list: check the logs.',
    fr: 'Connecté à DiO, mais Gladys refuse la liste des appareils : consultez les journaux.',
    de: 'Mit DiO verbunden, aber Gladys lehnt die Geräteliste ab: sieh in die Protokolle.',
    es: 'Conectado a DiO, pero Gladys rechaza la lista de dispositivos: consulte los registros.',
  },
};

/**
 * Texts written one language at a time (some are functions of a count or a
 * name). Same keys in every language: test/i18n.test.js checks it.
 */
export const TEXT = {
  en: {
    open: 'Open',
    closed: 'Closed',
    opening: 'Opening',
    closing: 'Closing',
    offline: 'Offline',
    unknown: 'Unknown',
    openAll: 'Open all',
    stopAll: 'Stop all',
    closeAll: 'Close all',
    noShutter: 'No DiO shutter added to Gladys yet: add them from the Discovery tab.',
    notConnected: 'The DiO cloud is not reachable right now.',
    notConfigured: 'Enter your DiO One account in the integration configuration.',
    moved: (count) => `${count} shutter(s) commanded.`,
    movedPartly: (count, failed) => `${count} shutter(s) commanded, ${failed} failed.`,
    reportTitle: (count) => `${count} device(s) on the DiO account:`,
    reportNone: 'No device on the DiO account.',
    reportUnsupported: 'not supported yet',
    reportOffline: 'offline',
    reportUnsupportedHint:
      'A device "not supported yet"? Open an issue on GitHub with its model and type.',
    reportNotConnected: 'Not connected to the DiO cloud: check the e-mail and the password.',
  },
  fr: {
    open: 'Ouvert',
    closed: 'Fermé',
    opening: 'Monte',
    closing: 'Descend',
    offline: 'Hors ligne',
    unknown: 'Inconnu',
    openAll: 'Tout ouvrir',
    stopAll: 'Tout arrêter',
    closeAll: 'Tout fermer',
    noShutter:
      'Aucun volet DiO ajouté à Gladys pour l’instant : ajoutez-les depuis l’onglet Découverte.',
    notConnected: 'Le cloud DiO est injoignable pour l’instant.',
    notConfigured: 'Saisissez votre compte DiO One dans la configuration de l’intégration.',
    moved: (count) => `${count} volet(s) commandé(s).`,
    movedPartly: (count, failed) => `${count} volet(s) commandé(s), ${failed} en échec.`,
    reportTitle: (count) => `${count} appareil(s) sur le compte DiO :`,
    reportNone: 'Aucun appareil sur le compte DiO.',
    reportUnsupported: 'pas encore pris en charge',
    reportOffline: 'hors ligne',
    reportUnsupportedHint:
      'Un appareil « pas encore pris en charge » ? Ouvrez une issue sur GitHub avec son modèle et son type.',
    reportNotConnected: 'Pas connecté au cloud DiO : vérifiez l’e-mail et le mot de passe.',
  },
  de: {
    open: 'Offen',
    closed: 'Geschlossen',
    opening: 'Fährt hoch',
    closing: 'Fährt runter',
    offline: 'Offline',
    unknown: 'Unbekannt',
    openAll: 'Alle öffnen',
    stopAll: 'Alle stoppen',
    closeAll: 'Alle schließen',
    noShutter: 'Noch kein DiO-Rollladen in Gladys hinzugefügt: füge sie im Tab „Entdecken“ hinzu.',
    notConnected: 'Die DiO-Cloud ist gerade nicht erreichbar.',
    notConfigured: 'Gib dein DiO-One-Konto in der Konfiguration der Integration ein.',
    moved: (count) => `${count} Rollladen/Rollläden angesteuert.`,
    movedPartly: (count, failed) =>
      `${count} Rollladen/Rollläden angesteuert, ${failed} fehlgeschlagen.`,
    reportTitle: (count) => `${count} Gerät(e) im DiO-Konto:`,
    reportNone: 'Kein Gerät im DiO-Konto.',
    reportUnsupported: 'noch nicht unterstützt',
    reportOffline: 'offline',
    reportUnsupportedHint:
      'Ein Gerät „noch nicht unterstützt“? Eröffne ein Issue auf GitHub mit Modell und Typ.',
    reportNotConnected: 'Nicht mit der DiO-Cloud verbunden: prüfe E-Mail-Adresse und Passwort.',
  },
  es: {
    open: 'Abierta',
    closed: 'Cerrada',
    opening: 'Subiendo',
    closing: 'Bajando',
    offline: 'Sin conexión',
    unknown: 'Desconocido',
    openAll: 'Abrir todas',
    stopAll: 'Detener todas',
    closeAll: 'Cerrar todas',
    noShutter:
      'Todavía no hay persianas DiO añadidas a Gladys: añádalas desde la pestaña Descubrimiento.',
    notConnected: 'La nube DiO no está accesible en este momento.',
    notConfigured: 'Introduzca su cuenta DiO One en la configuración de la integración.',
    moved: (count) => `${count} persiana(s) accionada(s).`,
    movedPartly: (count, failed) => `${count} persiana(s) accionada(s), ${failed} con error.`,
    reportTitle: (count) => `${count} dispositivo(s) en la cuenta DiO:`,
    reportNone: 'Ningún dispositivo en la cuenta DiO.',
    reportUnsupported: 'aún no compatible',
    reportOffline: 'sin conexión',
    reportUnsupportedHint:
      '¿Un dispositivo «aún no compatible»? Abra una issue en GitHub con su modelo y su tipo.',
    reportNotConnected: 'Sin conexión con la nube DiO: compruebe el correo y la contraseña.',
  },
};

export const LANGS = Object.keys(TEXT);

/**
 * A text of TEXT in the four languages: a multi-language object.
 * @param {string} key
 * @param {...unknown} args for the texts that are functions
 */
export function localized(key, ...args) {
  return Object.fromEntries(
    LANGS.map((lang) => {
      const value = TEXT[lang][key];
      return [lang, typeof value === 'function' ? value(...args) : value];
    }),
  );
}

/** A text of TEXT in one language (French when unknown). */
export function text(language, key, ...args) {
  const value = (TEXT[language] ?? TEXT.fr)[key];
  return typeof value === 'function' ? value(...args) : value;
}
