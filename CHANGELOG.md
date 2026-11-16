# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A read-only **Diagnostic** button: the raw state of each device and the last
  20 messages the DiO cloud pushed for the doorbell (or not recognized), ids
  masked, to paste on the forum when a ring does not reach Gladys.
- A doorbell ring writes one line in the logs.

### Fixed

- The doorbell no longer shows a ring nobody made: its resting value is no
  longer sent again at every heartbeat, so the dashboard keeps the time of the
  last real ring.
- More doorbell rings recognized: an event time given as an epoch, a Tuya event
  name for the press (`doorbell`, `call`…), a pushed state carrying `id` rather
  than `di` or another action than `update`. A pushed state without `rc` no
  longer marks the device offline.
- The actions fail in red when the DiO cloud is out of reach, instead of
  answering in green.

## [1.0.1] - 2026-10-15

### Changed

- Garage doors and gates driven by a DiO shutter module are read-only by
  default: recognized by the calibration of the module or by their name, they
  show their position but refuse every command. The new option "Allow the
  control of garage doors and gates" lets them be controlled, as shutters,
  never as switches. The widget and the "Move all DiO shutters" scene action
  never move them.

### Added

- Chacon DiO devices of the DiO One app in Gladys, through the DiO cloud: roller
  shutters (position and open / stop / close), light switches and plugs (on /
  off), and the video doorbell (ring).
- Real-time states pushed by the DiO cloud, a safety refresh of every device
  (every 5 minutes by default) and a heartbeat every 6 hours.
- A transport pill per device: cloud, or unreachable when the device or the
  cloud is offline.
- The "DiO shutters" dashboard widget: every shutter at a glance, open, stop or
  close them all.
- The "DiO device offline or back online" scene trigger, and the "Move all DiO
  shutters" scene action.
- A "List the devices of the DiO account" button, which also names the devices
  not supported yet.
- The session is kept in `/data` and reused across restarts: the password only
  travels when needed, and a refused password is never retried in a loop.
- English, French, German and Spanish everywhere, documentation included.

[Unreleased]: https://github.com/guim31/gladys-chacon-dio/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-chacon-dio/releases/tag/v1.0.1
