# Chacon DiO

Steuere in Gladys die WLAN-Geräte **DiO** von Chacon, also die, die du mit der
App **DiO One** einrichtest: Rollläden, Steckdosen, Lichtschalter und die
Video-Türklingel. Änderungen kommen in Echtzeit an, egal ob sie aus Gladys, der
DiO-App, von einem Wandschalter oder einer Fernbedienung stammen.

> **Ohne die Hardware entwickelt: Rückmeldungen sind willkommen.** Diese
> Integration wurde nach dem öffentlich dokumentierten Protokoll der DiO-Cloud
> geschrieben und mit aufgezeichneten Antworten getestet, nicht mit echten
> Geräten. Wenn etwas nicht wie hier beschrieben funktioniert, sag es im
> [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-chacon-dio/issues).

Community-Integration, **nicht mit Chacon verbunden**. DiO und Chacon sind
Marken ihrer jeweiligen Inhaber.

## Voraussetzungen

- Gladys Assistant 5.1.0 oder neuer.
- Ein **DiO-One**-Konto (die App der DiO-WLAN-Geräte), in dem deine Geräte
  bereits eingerichtet und benannt sind. Gladys übernimmt diese Namen.
- Eine Internetverbindung: Die Integration läuft wie die App über die Cloud
  von Chacon. Ohne Internet kann Gladys deine DiO-Geräte weder lesen noch
  steuern.

Die älteren DiO-Geräte mit **433 MHz** (Fernbedienungen, Steckdosen und Module
ohne WLAN, gesteuert über die DiO-1.0-Zentrale) laufen nicht über diese Cloud:
Diese Geräte werden nicht unterstützt.

## Konfiguration

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib unter **Konfiguration** die **E-Mail-Adresse** und das **Passwort**
   deines DiO-One-Kontos ein und speichere.
3. Der Verbindungsstatus erscheint oben im Bildschirm: „Verbunden“, sobald die
   DiO-Cloud das Konto akzeptiert hat.
4. Öffne den Tab **Entdecken**: Dort sind deine DiO-Geräte aufgelistet. Füge
   die gewünschten zu Gladys hinzu und ordne sie ihren Räumen zu.

Die weiteren Einstellungen:

- **Sicherheitsabfrage**: Änderungen kommen in Echtzeit, aber zur Sicherheit
  werden alle hinzugefügten Geräte in diesem Abstand neu gelesen (standardmäßig
  alle 5 Minuten). Eine einzige Anfrage liest alle Geräte.
- **Steuerung von Garagentoren und Hoftoren erlauben**: standardmäßig aus.
  Siehe „Garagentore und Hoftore“ weiter unten.
- **Sprache der Funktionsnamen**: „Position“, „Bewegung“, „Steckdose“… in der
  gewählten Sprache (standardmäßig Französisch). Die Sprache gilt für die Geräte, die
  nach der Änderung hinzugefügt werden: Gladys legt die Namen beim Hinzufügen
  fest.

Der Button **Geräte des DiO-Kontos auflisten** zeigt alles, was in deinem Konto
ist, auch die noch nicht unterstützten Geräte, mit Modell und Typ.

## Die Geräte

Jedes DiO-Gerät wird ein Gladys-Gerät, mit dem Namen, den du ihm in der App
DiO One gegeben hast.

| DiO-Gerät                              | In Gladys                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rollladen (Modul REV-SHUTTER, CERSwd…) | **Position** von 0 % (geschlossen) bis 100 % (offen) und **Bewegung**: Buttons Öffnen / Stopp / Schließen, die auch zeigen, ob der Rollladen hoch- oder runterfährt |
| Lichtschalter (REV-LIGHT)              | **Licht** ein / aus                                                                                                                                                 |
| Smarte Steckdose                       | **Steckdose** ein / aus                                                                                                                                             |
| Video-Türklingel                       | **Klingeln**: „Klingelt“ für ein paar Sekunden bei jedem Klingeln, danach die Zeit des letzten                                                                      |

Jedes Gerät trägt außerdem ein **Cloud**-Abzeichen, das zu **nicht erreichbar**
wechselt, wenn die DiO-Cloud das Gerät offline sieht (WLAN weg, Sicherung
raus, Stecker gezogen) oder wenn die Cloud selbst nicht antwortet.

Dimmer, Lampen und Kameras werden noch nicht unterstützt: Das Protokoll dieser
Geräte ist nicht dokumentiert. Diese Geräte erscheinen im Bericht des Buttons **Geräte des
DiO-Kontos auflisten**; schick uns ihre Zeile, damit sie hinzugefügt werden.

### Garagentore und Hoftore

Ein DiO-Rollladenmodul kann auch ein Garagentor oder ein Hoftor antreiben. Ein
solches Tor aus der Ferne zu öffnen heißt, eine Tür aufzuschließen:
standardmäßig sind diese Geräte **nur lesbar**. Gladys zeigt ihre Position,
lehnt aber jeden Befehl ab, und weder das Widget noch die Aktion „Alle
DiO-Rollläden steuern“ rühren sie an.

Die Integration erkennt sie an der Kalibrierung des Moduls, wenn diese ein Tor
meldet, oder an ihrem Namen in der App DiO One: „Garage“, „Tor“, „Gate“,
„portail“, „verja“… Ein Rollladen an einer Terrassentür ist nicht betroffen.
Damit ein Gerät als Tor behandelt wird, nimm eines dieser Wörter in seinen
Namen in der App auf und starte im Tab Entdecken eine neue Suche.

Um sie trotzdem zu steuern, aktiviere **Steuerung von Garagentoren und
Hoftoren erlauben** und übernimm das im Tab Entdecken angebotene Update. In
Gladys bleiben sie Rollläden, nie Schalter, und bleiben vom Widget und von der
Aktion „alle Rollläden“ ausgenommen.

## Widget

Das Dashboard-Widget **DiO-Rollläden** zeigt alle in Gladys hinzugefügten
DiO-Rollläden auf einen Blick: offen, geschlossen, auf 45 %, fährt hoch, fährt
runter, offline. Drei Buttons steuern alle Rollläden auf einmal: **Alle
öffnen**, **Alle stoppen**, **Alle schließen**. Das entspricht den Gruppen der
DiO-App.

Zum Hinzufügen: Bearbeite dein Dashboard, füge ein Widget hinzu und wähle
**DiO-Rollläden**. Es hat keine Einstellung.

## Szenen-Auslöser und -Aktion

**Auslöser „DiO-Gerät offline oder wieder online“**: Er wird ausgelöst, wenn
die DiO-Cloud ein Gerät verliert oder wiederfindet. Du kannst ihn auf ein Gerät
und eine Richtung beschränken („Geht offline“ oder „Wieder online“). Die
Variablen `device_name` (Name des Geräts) und `state` (`offline` oder `online`)
stehen in den folgenden Aktionen zur Verfügung, zum Beispiel in einer
Nachricht.

**Aktion „Alle DiO-Rollläden steuern“**: Öffnet, schließt, stoppt oder fährt
alle in Gladys hinzugefügten DiO-Rollläden auf einmal auf eine Position (0 bis
100 %). Die Aktion liefert zwei Werte: `commanded` (angesteuerte Rollläden) und
`failed` (fehlgeschlagene Rollläden). Konnte kein Rollladen angesteuert
werden, schlägt die Aktion fehl und die Szene vermerkt es in ihrem Verlauf.

Für einen einzelnen Rollladen, eine Steckdose oder ein Licht nimmst du die
üblichen Gladys-Aktionen („Gerätewert setzen“, „Licht einschalten“, „Schalter
einschalten“…).

## Beispielszenen

- **Abends alles schließen**: Auslöser „Jeder Sonnenuntergang“, Aktion „Alle
  DiO-Rollläden steuern“ mit dem Befehl **Schließen**.
- **Der Gefrierschrank hat keinen Strom mehr**: Auslöser „DiO-Gerät offline
  oder wieder online“ auf der Steckdose des Gefrierschranks, Änderung „Geht
  offline“, dann eine Nachricht: „Die Steckdose {{device_name}} antwortet nicht
  mehr: Stromausfall?“.
- **Es klingelt am Tor**: Auslöser „Änderung von Gerätestatus“ auf dem Klingeln
  der Türklingel, „Wenn die Türklingel klingelt“, dann „Licht einschalten“ am
  Eingang und „Nachricht senden“.
- **Der Weihnachtsbaum**: „Jeder Sonnenuntergang“, „Schalter einschalten“ auf
  der Steckdose des Baums; um 23 Uhr „Schalter ausschalten“.

## Die DiO-Cloud: Datenverkehr und Bedingungen

Die Integration nutzt denselben Dienst wie die App DiO One. Chacon
veröffentlicht für diesen Dienst weder Dokumentation noch Kontingente: Die
Integration bleibt deshalb sparsam.

- **Eine Verbindung**: Es wird eine einzige Sitzung geöffnet, im Ordner `/data`
  der Integration gespeichert und bei Neustarts wiederverwendet. Das Passwort
  wird nur gesendet, wenn die Sitzung neu geöffnet werden muss.
- **Eine Anfrage pro Sicherheitsabfrage** für alle Geräte (standardmäßig alle
  5 Minuten), eine Anfrage pro Befehl und eine kleine Prüfanfrage, wenn die
  Verbindung seit 4 Minuten still ist.
- **Wachsende Wartezeit beim Wiederverbinden**: Nach einer Unterbrechung ein
  neuer Versuch nach 10 s, dann 30 s, 1 min, 2 min, 5 min und höchstens alle
  10 Minuten.
- **Passwort abgelehnt**: Die Integration hört dort auf und wartet, bis du die
  Konfiguration speicherst. Die Integration versucht es nicht in einer Schleife erneut, was
  dein Konto sperren könnte.

Deine E-Mail-Adresse und dein Passwort dienen nur dazu, die Sitzung bei der
Cloud von Chacon zu öffnen; sie erscheinen nie in den Protokollen.

## Fehlerbehebung

- **„DiO lehnt die E-Mail-Adresse oder das Passwort ab“**: Prüfe sie, indem du
  dich in der App DiO One anmeldest, korrigiere sie in der Konfiguration und
  speichere. Speichern, auch ohne Änderung, startet die Verbindung neu.
- **„DiO-Cloud nicht erreichbar“**: Dein Gladys hat kein Internet, oder der
  Dienst von Chacon ist gestört. Die Integration versucht es selbst erneut.
- **Ein Gerät fehlt unter Entdecken**: Klicke auf **Geräte des DiO-Kontos
  auflisten**. Steht es dort mit „noch nicht unterstützt“, wird es noch nicht
  verwaltet; steht es nicht dort, ist es nicht in diesem Konto (ein Gerät, das
  ein anderes Konto teilt, erscheint nur im Konto, das es eingerichtet hat).
- **Ein Gerät bleibt „nicht erreichbar“**: Die DiO-Cloud sieht es offline. Sieh
  in der App DiO One nach: Ist es dort auch offline, liegt es an seinem WLAN
  oder seiner Stromversorgung.
- **Ein Rollladen erreicht nicht die richtige Position**: Die Position kommt aus
  der Kalibrierung des Moduls. Kalibriere es in der App DiO One neu.
- Für mehr Details stell die Protokollstufe auf debug (Variable
  `LOG_LEVEL=debug`): Jede Abfrage und jede empfangene Nachricht wird
  beschrieben.

## Grenzen

- Alles läuft über die Cloud von Chacon: Ohne Internet, oder wenn Chacon den
  Dienst ändert, funktioniert die Integration nicht mehr. Eine lokale Steuerung
  der DiO-WLAN-Geräte ist nicht bekannt.
- Nur Rollläden, Lichtschalter, Steckdosen und die Türklingel. Kein Dimmer,
  keine Lampe, keine Kamera, keine Zeitpläne (die in der DiO-App erstellten
  Zeitpläne laufen weiter).
- Die Gerätenamen werden beim Hinzufügen zu Gladys übernommen: Ein in der
  DiO-App umbenanntes Gerät wird in Gladys nicht umbenannt.
- Die Türklingel liefert in Gladys weder Bild noch Video, nur das Klingeln.
- Ein Garagentor oder Hoftor wird an der Kalibrierung des Moduls oder an
  seinem Namen erkannt: Ein Name ohne passendes Wort gilt als Rollladen. Prüfe
  nach dem Hinzufügen, dass es nur lesbar ist.
