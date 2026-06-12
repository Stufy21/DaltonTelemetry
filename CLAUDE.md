# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

All application code lives in the `DaltonTelemetry/` subdirectory. Run all commands from there unless stated otherwise.

```
DaltonTelemetry/   ← Angular project root (angular.json, package.json)
  src/
    app/           ← components, routes, config
    main.ts        ← browser bootstrap
    main.server.ts ← SSR bootstrap
    server.ts      ← Express SSR server entry point
```

## Commands

Run from `DaltonTelemetry/`:

```bash
npm start          # dev server at http://localhost:4200 (auto-reload)
npm run build      # production build → dist/
npm test           # unit tests via Vitest
npm run watch      # dev build with watch mode
node dist/DaltonTelemetry/server/server.mjs  # run the SSR server (port 4000)
```

Run a single test file:

```bash
npx ng test --include="src/app/app.spec.ts"
```

Format code:

```bash
npx prettier --write .
```

## Architecture

This is an **Angular 22 SSR application** using the standalone component model (no NgModules). Key architectural points:

- **SSR via `@angular/ssr`** — `src/main.server.ts` bootstraps `AppServerConfig`, and `src/server.ts` wraps it in an Express 5 server. The build produces both a `browser/` bundle and a `server/` bundle under `dist/`.
- **Standalone components** — components declare their own `imports` array; there are no `NgModule` files. `app.config.ts` is the application-level provider config, passed to `bootstrapApplication()`.
- **Routing** — routes are defined in `src/app/app.routes.ts` and provided via `provideRouter()` in `app.config.ts`. Server-side route rendering config lives in `app.routes.server.ts`.
- **Signals** — prefer Angular's `signal()` / `computed()` / `effect()` for reactive state rather than RxJS Subjects for component-local state.
- **Client hydration** — `provideClientHydration()` is already wired in `app.config.ts`; keep SSR-safe (no direct DOM access at construction time).
- **Express API routes** — add REST endpoints in `src/server.ts` before the catch-all Angular handler.

## Code style

Prettier is configured with single quotes and 100-character line width (`.prettierrc`). TypeScript strict flags are on: `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`.

## External references

See [`.claude/external.md`](.claude/external.md) for official documentation links and best practices sourced from external resources (Angular, TypeScript, Vitest, Conventional Commits).
