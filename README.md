# Chacon DiO for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
controls the **DiO** Wi-Fi devices by Chacon (the ones of the **DiO One** app):
roller shutters, plugs, light switches and the video doorbell, through the DiO
cloud, in real time.

> **Developed without the hardware: feedback welcome.** The integration is
> built and tested against the DiO cloud protocol as publicly documented (see
> [Credits](#credits)) and recorded answers, not against real devices or a real
> account. Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-chacon-dio/issues).

**Not affiliated with Chacon.** See the [disclaimer](#disclaimer).

## Features

- **One Gladys device per DiO device**, named as in the DiO One app:
  - roller shutter (REV-SHUTTER): **position** 0–100 % and the **open / stop /
    close** buttons, which also show the shutter moving;
  - light switch (REV-LIGHT): **light** on / off;
  - plug: **switch** on / off;
  - video doorbell: **ring** (a 1 then 0 pulse at each ring).
- **Real time**: the changes made from the DiO app, a wall switch or a remote
  are pushed by the cloud over a WebSocket. A safety refresh reads every device
  again (one request, every 5 minutes by default) and a heartbeat re-sends the
  unchanged values every 6 hours.
- A **transport pill** per device: cloud, or unreachable when the cloud sees
  the device offline or does not answer.
- **Dashboard widget** "DiO shutters": every shutter at a glance (open, closed,
  position, moving, offline) and **Open all / Stop all / Close all** buttons.
- **Scene trigger** _DiO device offline or back online_ (Wi-Fi down, power
  cut…), with the device name as a variable.
- **Scene action** _Move all DiO shutters_: open, close, stop or position every
  shutter at once.
- A **List the devices of the DiO account** button, which also names the
  devices not supported yet, with their model and type.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
- A **DiO One** account with the devices installed and named in the app.
- Internet access for Gladys: everything goes through Chacon's cloud
  (`l4hfront-prod.chacon.cloud`). The older 433 MHz DiO devices (DiO 1.0 hub)
  do not use this cloud and are not covered.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-chacon-dio`
   (or install **Chacon DiO** from the catalog once it is listed).
2. In **Configuration**, enter the e-mail and the password of the DiO One
   account, and save. The connection status shows when the cloud accepted it.
3. Open the **Discovery** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- `POST https://l4hfront-prod.chacon.cloud/api/session/login` with the e-mail
  and password returns a **session token**, stored in `/data/dio-session.json`
  (with a hash of the e-mail, mode 0600) and reused across restarts: the
  password only travels when the token is missing or refused.
- One **WebSocket** (`wss://…/ws?sessionToken=…`) carries everything: `GET
/device` (the device list), `POST /device/states` (the states, as OCF-style
  links), the actions (`/device/<id>/action/mvtlinear`, `openlevel`, `switch`),
  and the `deviceState` updates the cloud pushes on its own. The other way the
  cloud accepts, the e-mail and password in the WebSocket URL, is never used.
- A refused token is replaced by one new login; refused credentials stop the
  client until the configuration is saved again (no retry loop that could lock
  the account). A lost socket is reopened after 10 s, 30 s, 1, 2, 5, then
  10 minutes. An idle socket is checked every 4 minutes with a small request.
- The container refreshes the devices itself (`src/poller.js`): Gladys 5.2
  does not reliably poll external devices (GladysAssistant/Gladys#3198); the
  core's `onPoll` stays as a fallback.
- Logs stay quiet at info (start, connection, loss and return, one line per
  user command, an unsupported device once). `LOG_LEVEL=debug` shows the rest.
  No e-mail, password or token is ever logged.

## What could not be checked, and assumptions

Without the hardware nor an account, nothing here has run against the real
cloud. The tests use the documented message shapes. Assumptions to confirm:

- the plug type string `.dio1.wifi.plug.switch.` and its state link
  (`oic.r.switch.binary`) — documented, but no public capture names the plug
  model;
- the video doorbell pushes a `gw.r.lastEvent` link with a new `ts` at each
  ring (documented, with an example from 2026);
- a session token stays valid for days, and the cloud tolerates one login per
  restart when it does not;
- `openLevel` 100 means open, 0 closed (as Home Assistant reads it).

[`scripts/probe.mjs`](scripts/probe.mjs) checks the real endpoints read-only:
without variables, a fake account must be refused; with `DIO_EMAIL` and
`DIO_PASSWORD`, it lists the device types and state links of a real account,
without printing any name, id or secret.

## Limitations

- Cloud only: no known local control of the DiO Wi-Fi devices. If Chacon
  changes or closes the service, the integration stops working.
- No dimmer, bulb, camera or schedule. Unknown device types are listed by the
  **List the devices** action so they can be added.
- Device and feature names are fixed when the device is added to Gladys.
- A garage door or a gate wired to a shutter module is seen as a shutter.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
npm run probe        # the real DiO cloud, read-only (needs Internet)
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory DiO cloud (`test/helpers/fakeDio.js`) built from the documented
captures (`test/fixtures/dio/`). See [`CLAUDE.md`](CLAUDE.md) for the project
rules.

## Credits

- [dio-chacon-wifi-api](https://github.com/cnico/dio-chacon-wifi-api) by cnico:
  its `Protocol.md` and AsyncAPI description of the DiO cloud are the source of
  the protocol implemented here. The library is GPL-3.0: it was read to
  understand the protocol, no code was copied; the fixtures were written by
  hand from the documented shapes.
- Home Assistant's
  [`chacon_dio`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/chacon_dio)
  integration (Apache-2.0), by the same author: the choice of entities (cover,
  switch) and the reading of the shutter position.
- The architecture and the conformity tests follow
  [gladys-wled](https://github.com/guim31/gladys-wled) and
  [gladys-subsonic](https://github.com/guim31/gladys-subsonic).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Chacon.
"Chacon" and "DiO" are trademarks of their respective owners. The integration
uses the cloud service of the DiO One app, which Chacon does not document for
third parties: it may change without notice.

## License

[Apache-2.0](LICENSE)
