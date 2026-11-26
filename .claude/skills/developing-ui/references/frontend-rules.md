# Frontend rules for Web SDK apps

Adapted from the `@c8y/websdk` AI configuration templates (`templates/ai-configs/claude`, Apache-2.0). Codex
lookups go through the `c8y-web-sdk-knowledge` MCP.

## Never introduce

- **Unmanaged subscriptions** — every `.subscribe()` has `takeUntilDestroyed()`, `takeUntil()`, or is replaced by the `async` pipe.
- **Empty catch blocks** — propagate, show via `AlertService.danger()` (translated), or comment why it is swallowed.
- **Committed secrets** — no API keys, tokens, passwords, tenant ids or tenant URLs in source.
- **Dynamic `gettext()`** — `gettext()` takes a string literal only; anything else breaks translation extraction.

## Components

- Standalone (default since Angular 19: do not write `standalone: true`); never NgModule-based new components.
- `changeDetection: ChangeDetectionStrategy.OnPush` on every component.
- `input()`, `output()`, `viewChild()` instead of decorators; no `@HostBinding`/`@HostListener` — use `host: {}`.
- Small components: extract when the template passes ~150 lines or the class ~200; logic, mapping and SDK calls go to services.
- `readonly` where possible; models and constants in their own files (`models.ts`, `types.ts`).
- Separate `.ts`, `.html` and style files; selector prefix `c8y-` (or the app's own prefix, consistently).
- Reactive forms over template-driven forms.

## Templates

- Native control flow `@if`, `@for`, `@switch` — `*ngIf`, `*ngFor`, `*ngSwitch` are forbidden.
- `@for` tracks `item.id` (or another stable key); `$index` only for read-only primitives.
- `[class.x]` / `[style.x]` instead of `ngClass` / `ngStyle`; `@let` for repeated expressions.
- No method calls in bindings (pipes are fine); no `CoreModule` import in standalone components.
- Import every pipe and component the template uses.

## State and DI

- Signals for local synchronous state, `computed()` for derived state; never `mutate` — `set`/`update`.
- RxJS / promises for async API calls; one paradigm per use case.
- No polling or intervals in components — put them in services.
- One DI style per file (`inject()` preferred); `providedIn: 'root'` only for true singletons.
- `@c8y/client` services for every platform call; lazy-load routes and widget modules.

## Internationalization

- Templates: `{{ 'Text' | translate }}`; with parameters `{{ 'Result: {{count}}' | translate: { count } }}`.
- Repeated or conditional: `@let label = 'Text' | translate;`.
- TypeScript: `translateService.instant(gettext('Text'))` — `gettext()` only marks for extraction.
- Every user-visible string is wrapped, including `aria-label`, titles and alerts.

## Styling

- Design tokens only, never hex/rgb: `var(--c8y-brand-primary)`, `--c8y-root-component-color-*`,
  `--c8y-root-component-background-*`, `--c8y-root-component-border-color`.
- Utility classes before custom CSS: spacing `m-{t|r|b|l}-{4|8|16|24|32|40}` / `p-…`, layout `d-flex`, `d-col`,
  `j-c-{start|center|end|between}`, `a-i-{start|center|end|stretch}`, `gap-{4|8|16}`, text `text-truncate`,
  `text-center`, display `hidden`, `sr-only`.
- Icons: `<i [c8yIcon]="'name'" aria-hidden="true"></i>`, sizes `icon-16|20|32`.
- No `::ng-deep`, no inline styles.

## Errors

- API failures are logged and shown to the user (`AlertService`), with a translated message.

## Accessibility (WCAG 2.1 AA, mandatory)

- Semantic elements (`nav`, `main`, `section`, `header`, lists, tables with `th scope` and `caption`); heading levels in order.
- `<button>` for actions, `<a>` for navigation — never clickable `div`/`span`.
- Everything works by keyboard; no traps; modals trap focus and return it on close (`cdkTrapFocus`); `tabindex` > 0 forbidden; visible focus.
- Contrast 4.5:1 text, 3:1 large text and UI parts; never color alone (icon + text with status colors).
- Every control has a visible `<label for>`; errors name the field, are announced (`role="alert"`), and say how to fix.
- Icon-only buttons have a translated `aria-label`; decorative icons `aria-hidden="true"`.
- Status updates `role="status"` / `aria-live="polite"`; loading states `aria-busy`.
- Works at 200 % zoom and 320 px width; tooltips dismissible with Esc.

## Security

- Device and asset data is untrusted: render with `{{ }}`, never `[innerHTML]` with unsanitized values.
- No internal hostnames or credentials in client code; tests use `Cypress.env()`.

## Code hygiene

- No `console.log` / `console.debug` left behind (`console.error` in caught exceptions is fine).
- Methods over ~40 lines are split; no commented-out code.
- New features get unit tests where logic is non-trivial, and a Cypress spec for the user flow.
