# External References

Instructions and best practices sourced from external documentation.

## Angular

- **Angular 22 Docs** — https://angular.dev  
  Official reference for components, directives, pipes, DI, and CLI.
- **Standalone Components** — https://angular.dev/guide/components  
  Components declare their own `imports` array; no NgModules needed.
- **Angular Signals** — https://angular.dev/guide/signals  
  Prefer `signal()` / `computed()` / `effect()` for reactive state over RxJS Subjects in component-local code.
- **Angular SSR** — https://angular.dev/guide/ssr  
  SSR setup with `@angular/ssr`; use `isPlatformBrowser(PLATFORM_ID)` to guard browser-only APIs.
- **Angular Routing** — https://angular.dev/guide/routing  
  Use `loadComponent` for lazy-loaded standalone routes.
- **Reactive Forms** — https://angular.dev/guide/forms/reactive-forms

## TypeScript

- **tsconfig reference** — https://www.typescriptlang.org/tsconfig  
  This project enables `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`.

## Testing

- **Vitest** — https://vitest.dev/guide/  
  Test runner used via `@angular/build:unit-test`. Run with `ng test`.

## Commit conventions

- **Conventional Commits 1.0** — https://www.conventionalcommits.org/en/v1.0.0/  
  Format: `<type>[optional scope]: <description>`. Types in use: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`.
