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

## Circuit outlines

The circuit layouts on the Statistics pages are drawn from OpenF1's car coordinates (one clean lap
per circuit), the same data the live track map uses. They are generated once into
`src/app/dashboards/statistics/circuit-outlines.ts`:

```bash
node scripts/generate-circuit-outlines.mjs   # about 3-5 minutes on OpenF1's free API
```

Run it again only when a circuit is added or changes its layout (add the circuit to the table at
the top of the script: Ergast circuit id -> OpenF1 `circuit_key`).

## Self-hosted OpenF1 (live data without the sponsor plan)

[OpenF1](https://github.com/br-g/openf1) is open source (CC BY-NC-SA 4.0: non-commercial use only).
You can run your own copy: it records the official live timing feed during a session and serves
the same REST API this app already uses, with no rate limits. The app then polls it directly (no
relay needed), so this also works with the static Cloudflare deployment.

1. On an always-on machine (a small VPS is enough), clone `br-g/openf1` and use its
   `docker-compose.yml`: `api`, `ingest-realtime`, `ingest-historical`, `mongo` and `mqtt`.
2. Live **telemetry** (`car_data`, car positions) needs an F1 TV subscription token. Add it to the
   `ingest-realtime` service as `F1_TOKEN` (see the guide linked from OpenF1's
   `ingestor_livetiming/real_time/README.md`); tokens expire after about 4 days. Without it, the
   other data (positions, intervals, laps, stints, race control, weather) should still be recorded.
3. The ingestor must be running at least 1 hour before a race (15 minutes before practice and
   qualifying), otherwise the start of the session is missed.
4. Expose the `api` service (port 8000) over **HTTPS**, e.g. with Caddy or a Cloudflare Tunnel: the
   site is served over HTTPS and browsers block plain-HTTP requests from it. The API already allows
   cross-origin requests. Change the default MQTT password if you expose the broker.
5. Point the app at it in `public/config.json`, no rebuild of the code needed:

   ```json
   { "openf1BaseUrl": "https://f1.example.com" }
   ```

   Leave it empty to keep using the public OpenF1 API. A full `.../v1` URL works too.

   If your server doesn't answer (machine off, tunnel down, no reply within 8 s), the app falls back
   to the public OpenF1 API for a minute and then tries your server again. That keeps finished
   sessions working; a live session needs your server (the public API refuses it).

   Your server doesn't need to hold every season: when it has nothing for a season or a finished
   session, the app asks the public API instead and remembers that session as public-only. Live
   polling (every 5 s against your server) never falls back on an empty answer.

6. **Indexes.** OpenF1 creates none, and on tens of millions of rows its 5 s query limit makes
   `location`/`car_data` queries fail. Create them once in MongoDB:
   `location {session_key, date}`, `car_data {session_key, driver_number, date}`,
   `{session_key, date}` on `position`, `intervals`, `race_control`, `weather`, `team_radio` and
   `pit`, `{session_key, date_start}` on `laps`, and `{session_key}` on the small collections.

### Importing past seasons

F1's static archive (`livetiming.formula1.com/static`) now answers 401 without the F1 TV token, and
403 from some datacenter IPs (Oracle's, at least). OpenF1's historical ingestor sends no token, so
`scripts/openf1/f1-token.patch` (apply with `git apply` in your OpenF1 clone) makes it send
`F1_TOKEN` and gives each meeting its own `_id` range (`OPENF1_ID_BASE`): without that, importing
several meetings in a row silently drops rows on duplicate `_id`s. Run the import from a home
machine, with MongoDB reached through an SSH tunnel, one `ingest-meeting` process per meeting, and
check the log for `E11000` errors. `node scripts/f1-archive-probe.mjs` shows which feeds the
archive serves for a session. A whole season took about 2.5 hours and ~5 GB of disk.

The same patch also keeps the live recorder from storing stale samples: on connecting, the feed first
sends its last state with timestamps from the previous session, which would end up as `car_data` and
`location` rows dated days before the session. Samples more than an hour older than the message that
carries them are dropped (restart the recorder to pick the change up).
It also fills in a missing drivers list: for one qualifying the feed never sent `DriverList`, so the
session had positions and laps but no drivers (no names or colours, an empty leaderboard). 90 seconds
after the first message of a session without drivers, the recorder copies those of the weekend's
previous session. The live recorder is not run
on the VM: F1 blocks Oracle's addresses, so it runs from a home machine writing through the tunnel.

The app side is tested against a fake local server (requests go to the configured URL, a live
session is detected and polled, and with the server down the app falls back to the public API).
Past sessions served from a real OpenF1 instance (2026 season, over HTTPS with Caddy) have been
checked in the browser. **Live recording** (the `ingest-realtime` container with an F1 TV token)
has **not** been run yet, so expect some trial and error on the first live session.

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

| Setting        | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Root directory | `DaltonTelemetry`                                                     |
| Build command  | leave empty (`wrangler deploy` builds the site, see `wrangler.jsonc`) |
| Deploy command | `npx wrangler deploy`                                                 |

What this deployment does and does not include:

- `build:cloudflare` builds with `--output-mode=static` (no Express server) and copies the
  client-rendered shell to `index.html`, which Cloudflare serves for routes without a file of their
  own (`/live-timing`, `/statistics/:circuit`, deep links).
- The **live relay is not part of it**: it needs a long-lived Node server (see "Live data"), so on
  Cloudflare the live timing page replays finished sessions, like the free OpenF1 tier allows.
  `/api/live/status` is not served there and the app treats that as "no relay".
- Data comes straight from the browser to OpenF1, Jolpica and Wikipedia, so nothing else has to be
  configured. `package-lock.json` is git-ignored in this project; commit it (or remove it from
  `.gitignore`) if you want reproducible installs on Cloudflare's build machines.
- The site is published at https://daltontv-telemetry.eu (also reachable at
  https://daltontelemetry.thomas-stufano.workers.dev). The domain is registered at Namecheap with
  Cloudflare nameservers; `routes` in `wrangler.jsonc` attaches it to the Worker.
