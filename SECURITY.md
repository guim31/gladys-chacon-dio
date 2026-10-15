# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes, in
particular how it handles the DiO account:

- **Configuration**: the e-mail and the password of the DiO One account are
  stored by Gladys in the integration's configuration (the password in a
  `secret` field). The integration sends them to one place only, the login of
  the DiO cloud (`https://l4hfront-prod.chacon.cloud/api/session/login`), over
  HTTPS.
- **`/data`**: the integration writes a single file, `/data/dio-session.json`,
  readable by the container user only (mode 0600). It holds the DiO session
  token, a SHA-256 hash of the account e-mail (to tell accounts apart) and a
  random installation id. Never the password, never the e-mail in clear.
- **Network**: outbound only, to `l4hfront-prod.chacon.cloud` (HTTPS for the
  login, a secure WebSocket opened with the session token). The e-mail and
  password are never put in a URL. Nothing listens in the container.
- **Logs**: no e-mail, password or token is ever written, at any log level
  (checked by `test/logs.test.js`).

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the DiO cloud, the DiO One app and the DiO devices, which belong to Chacon:
report their problems to Chacon.
