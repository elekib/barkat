# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report them privately through GitHub: **Security** tab, then **Report a vulnerability**. Include what you found, how to reproduce it, and the version (shown at `/api/health`).

This is a volunteer project, so fixes are made on a best-effort basis.

## Supported versions

Only the latest release and the `dev` image receive fixes.

## Deployment guidance

- Barkat holds personal financial data. Keep `./data` private and back it up.
- Sign-in is required for every page and API route. Passwords are hashed with argon2id, there is no default account, and the first admin is created with a one-time code from the server log.
- Roles: `admin` can change data and manage users; `viewer` is read-only, enforced on the server.
- Serve it over HTTPS (reverse proxy) when it leaves your own network, and set `BARKAT_BASE_URL` and `BARKAT_COOKIE_SECURE=true`.
- Set a long random `BARKAT_AUTH_SECRET`; otherwise one is generated and kept in the database under `./data`.
