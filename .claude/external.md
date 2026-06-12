You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

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


## TypeScript Best Practices
- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain
## Angular Best Practices
- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.
## Accessibility Requirements
- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.
### Components
- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.
## State Management
- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead
## Templates
- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.
## Services
- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection