# DiO cloud fixtures

Answers of the DiO cloud WebSocket, shaped after the captures published in
`Protocol.md` of [cnico/dio-chacon-wifi-api](https://github.com/cnico/dio-chacon-wifi-api)
(the `GET /device` and `POST /device/states` examples, the doorbell `gw.r.lastEvent`
link). The library is GPL-3.0: these files were written by hand from the
documented structure, nothing was copied from its code.

Every identifier is invented: device ids, MAC addresses (locally administered
`02:00:5E:…` range), room ids, names. The model name of the plug is not
documented anywhere public: `DiO plug` is a placeholder.

- `devices.json`: two REV-SHUTTER, a REV-LIGHT, a plug, the video doorbell and a
  device type the integration does not know.
- `states.json`: the states of the same devices; the second shutter answers
  `null`, as a module with a very old firmware does.
