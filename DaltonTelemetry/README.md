# DaltonTelemetry

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.1.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Live data (optional)

The live timing page replays finished sessions using OpenF1's free historical API. To follow a
session **while it is happening**, OpenF1 requires a sponsor account (about €9.90/month, "personal
use"; see https://openf1.org). With one, the server can relay the live feed to all browsers:

```bash
OPENF1_USERNAME=you@example.com OPENF1_PASSWORD=... npm start
# or, for the production build:
OPENF1_USERNAME=... OPENF1_PASSWORD=... node dist/DaltonTelemetry/server/server.mjs
```

- The credentials stay on the server. It opens **one** MQTT connection to OpenF1 (only while at
  least one browser is watching) and forwards the data as Server-Sent Events (`/api/live/stream`),
  and proxies the REST calls a live session needs (`/api/openf1/*`).
- Without these variables nothing changes: `/api/live/status` reports `enabled: false` and live
  sessions fall back to the browser polling the free API, which OpenF1 rejects without an account.
- `OPENF1_MAX_PER_MINUTE` (default 50) paces the proxy; the sponsor plan allows 60/minute.

The relay is covered by tests against a fake upstream, and the server was run against OpenF1's real
token endpoint (rejecting invalid credentials as expected). It has **not** been run against a real
live session, because that needs an account.

## Deploying to Cloudflare

The app can be published as a **static site** on Cloudflare (Workers static assets): every page is
either prerendered or rendered in the browser, so no server is needed. Configuration lives in
`wrangler.jsonc`, `public/_headers` (cache and security headers) and `.node-version`.

```bash
npm run preview:cloudflare   # build + run it locally with wrangler (no account needed)
npx wrangler login           # once, to link your Cloudflare account
npm run deploy:cloudflare    # build + publish
```

Or connect the Git repository in the Cloudflare dashboard (Workers & Pages → Create → import a
repository) with:

| Setting | Value |
| --- | --- |
| Root directory | `DaltonTelemetry` |
| Build command | `npm install && npm run build:cloudflare` |
| Deploy command | `npx wrangler deploy` |

What this deployment does and does not include:

- `build:cloudflare` builds with `--output-mode=static` (no Express server) and copies the
  client-rendered shell to `index.html`, which Cloudflare serves for routes without a file of their
  own (`/live-timing`, `/reports/stats/:circuit`, deep links).
- The **live relay is not part of it**: it needs a long-lived Node server (see "Live data"), so on
  Cloudflare the live timing page replays finished sessions, like the free OpenF1 tier allows.
  `/api/live/status` is not served there and the app treats that as "no relay".
- Data comes straight from the browser to OpenF1, Jolpica and Wikipedia, so nothing else has to be
  configured. `package-lock.json` is git-ignored in this project; commit it (or remove it from
  `.gitignore`) if you want reproducible installs on Cloudflare's build machines.
- Nothing has been deployed from this repository yet: that needs your Cloudflare account.

