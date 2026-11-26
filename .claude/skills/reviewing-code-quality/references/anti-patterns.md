# Anti-pattern catalogue

Angular 21 + `@c8y/ngx-components` 1024.x. Each entry has an id, a severity, why it matters, how to detect it, and a
bad/good example. A **Detect** grep finds candidates; read the hit in context before reporting it.

Severity:

- **High**: likely bug, memory leak, security or supply-chain risk.
- **Medium**: maintainability or performance problem.
- **Low**: style or convention.

| Id | Title | Severity |
|---|---|---|
| AP-01 | `*ngIf` / `*ngFor` / `*ngSwitch` instead of built-in control flow | Low |
| AP-02 | Too much logic inside components | Medium |
| AP-03 | `any` everywhere | Medium |
| AP-04 | No OnPush change detection | Medium |
| AP-05 | Missing or weak track expression in loops | Medium |
| AP-06 | Non-standalone components (`standalone: false`, feature NgModules) | Medium |
| AP-07 | RxJS where a plain value or signal works | Low |
| AP-08 | Method calls and heavy logic in templates | Medium |
| AP-09 | Subscribing without unsubscribing | High |
| AP-10 | `HttpClient` / `FetchClient` for calls covered by `@c8y/client` | Medium |
| AP-11 | Eager-loaded widget components | Medium |
| AP-12 | Heavy custom styles and hard-coded colors | Low |
| AP-13 | Repeated code instead of shared utilities or components | Low |
| AP-14 | Shared model interfaces defined inside components | Low |
| AP-15 | Every service `providedIn: 'root'` | Medium |
| AP-16 | Long async tasks inside components | Medium |
| AP-17 | Unguarded access to `IManagedObject` fragments | High |
| AP-18 | Missing localization (`translate`) | Medium |
| AP-19 | Secrets, credentials, tenant URLs and tenant ids in source | High |
| AP-20 | Deprecated `HOOK_*` tokens instead of hook functions | Low |
| AP-21 | Component members more visible than needed | Low |
| AP-22 | Using or overriding private APIs of `@c8y/*` | High |
| AP-23 | Checking the HTTP status of a resolved `@c8y/client` response | Low |
| AP-24 | Loosened supply-chain settings or drifting `@c8y/*` versions | High |
| AP-25 | Test or demo data in code or Cypress intercepts instead of `mock/world.json` | Medium |
| AP-26 | Unsanitized HTML, `eval`, tokens in web storage, a widened content security policy | High |

---

## AP-01 · `*ngIf` / `*ngFor` / `*ngSwitch` instead of built-in control flow

**Severity:** Low. **Why:** the structural directives are deprecated since Angular 20; the `@if` / `@for` /
`@switch` blocks need no imports, type-narrow better and force a track expression.
**Detect:** `grep -rnE '\*ng(If|For|Switch)|\[ngSwitch\]' src --include=*.html --include=*.ts`

```html
<!-- BAD -->
<div *ngIf="loading">Loading…</div>
<li *ngFor="let item of items">{{ item.name }}</li>

<!-- GOOD -->
@if (loading) { <div>{{ 'Loading…' | translate }}</div> }
@for (item of items; track item.id) { <li>{{ item.name }}</li> }
```

`ng generate @angular/core:control-flow` migrates a project; review its output.

## AP-02 · Too much logic inside components

**Severity:** Medium. **Why:** components own the view. Business logic, data mapping and orchestration in a
component cannot be reused or unit-tested without the view.
**Detect:** component methods longer than ~20 lines; mapping or aggregation in a component; `@c8y/client` services
or `HttpClient` injected directly into a component; nested `await` chains in lifecycle hooks.
**Fix:** move the logic into an `@Injectable()` service; the component calls it and binds the result.

## AP-03 · `any` everywhere

**Severity:** Medium. **Why:** `any` switches off type checking and hides bugs. Allowed only at genuine untyped
boundaries.
**Detect:** `grep -rnE ':\s*any\b|as any\b|<any>' src --include=*.ts`

```typescript
// BAD
function process(data: any): any { … }

// GOOD — unknown + narrowing, an interface, or a generic
function process<T extends Record<string, unknown>>(data: T): ProcessedResult { … }
```

Prefer `unknown` plus a type guard (see AP-17) over `any`.

## AP-04 · No OnPush change detection

**Severity:** Medium. **Why:** default change detection re-checks the whole subtree on every event. With signals
and OnPush only components whose inputs or signals changed are checked.
**Detect:** `@Component` blocks without `changeDetection: ChangeDetectionStrategy.OnPush`
(`grep -L 'ChangeDetectionStrategy.OnPush' $(grep -rl '@Component' src)`).

```typescript
// GOOD
@Component({
  selector: 'app-sensor',
  templateUrl: './sensor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SensorComponent { … }
```

With OnPush, update state through signals, the `async` pipe or inputs; mutating a plain field from a callback will
not refresh the view.

## AP-05 · Missing or weak track expression in loops

**Severity:** Medium. **Why:** without a stable identity Angular re-creates DOM for every item on each change.
`@for` requires `track`, but `track $index` or `track item` on lists of objects that are re-fetched has the same
effect. Legacy `*ngFor` without `trackBy` is the same problem (and AP-01).
**Detect:** `grep -rnE 'track \$index|track (\w+);?\s*\)' src --include=*.html`; `*ngFor` without `trackBy`.

```html
<!-- BAD — objects come from the API, identity changes on every reload -->
@for (sensor of sensors(); track $index) { <app-sensor [sensor]="sensor" /> }

<!-- GOOD -->
@for (sensor of sensors(); track sensor.id) { <app-sensor [sensor]="sensor" /> }
```

`track $index` is fine for static lists of primitives.

## AP-06 · Non-standalone components (`standalone: false`, feature NgModules)

**Severity:** Medium. **Why:** components, directives and pipes are standalone by default since Angular 19. New
NgModules for features add indirection and block lazy loading (AP-11). Keep an NgModule only to wrap third-party code
that needs one.
**Detect:** `grep -rn 'standalone: false' src`; new `@NgModule` declarations; `standalone: true` is redundant noise
(Low).

```typescript
// BAD
@Component({ selector: 'app-foo', templateUrl: './foo.component.html', standalone: false })
export class FooComponent { … }

// GOOD — standalone is the default; import what the template uses
@Component({ selector: 'app-foo', templateUrl: './foo.component.html', imports: [C8yTranslatePipe] })
export class FooComponent { … }
```

Look up the standalone export of a Web SDK component, pipe or directive with `resolve_symbol` before importing it.

## AP-07 · RxJS where a plain value or signal works

**Severity:** Low. **Why:** a `Subject` that only holds local synchronous state adds subscriptions and cleanup for
nothing.
**Detect:** `BehaviorSubject<boolean>` used as a flag only inside the class; a `Subject` that is `.next()`-ed once;
a one-shot `Promise` wrapped in `from()` without a reason.

```typescript
// BAD — never observed outside this class
private isLoading$ = new BehaviorSubject<boolean>(false);

// GOOD
readonly isLoading = signal(false);
```

## AP-08 · Method calls and heavy logic in templates

**Severity:** Medium. **Why:** template expressions run on every change-detection pass; a method call runs every
time even if its inputs did not change.
**Detect:** `grep -rnE '\{\{[^}]*\w+\([^)]*\)[^}]*\}\}|\]="[^"]*\w+\(' src --include=*.html` (exclude signal reads
like `value()` and event bindings `(click)="…"`).

```typescript
// BAD (template): {{ formatValue(measurement) }}

// GOOD — a pure pipe, or a computed() signal in the class
@Pipe({ name: 'formatValue' })
export class FormatValuePipe implements PipeTransform {
  transform(measurement: IMeasurement): string { … }
}
```

## AP-09 · Subscribing without unsubscribing

**Severity:** High. **Why:** a subscription that outlives its component leaks memory and keeps running callbacks
against a destroyed view.
**Detect:** `grep -rn '\.subscribe(' src --include=*.ts`, then check each for one of the fixes below (`HttpClient`
and other single-emission sources are lower risk but still flagged in components).
**Fix, in order of preference:** `async` pipe or `toSignal()`; `takeUntilDestroyed()` (in an injection context, or
with an injected `DestroyRef`); a `Subscription` closed in `ngOnDestroy`.

```typescript
// BAD
ngOnInit(): void {
  this.service.data$.subscribe(d => this.data = d);
}

// GOOD
private readonly destroyRef = inject(DestroyRef);
ngOnInit(): void {
  this.service.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(d => this.data.set(d));
}
```

## AP-10 · `HttpClient` / `FetchClient` for calls covered by `@c8y/client`

**Severity:** Medium. **Why:** the `@c8y/client` services (inventory, alarms, events, measurements, operations,
binary, users and more) are typed, handle auth and paging, and work against the mock. Raw HTTP is fine only for
microservices (path contains `/service/`) or external APIs.
**Detect:** `grep -rnE 'HttpClient|FetchClient|fetch\(' src --include=*.ts`, then check the URL. Find the matching
service with `search_concept("<domain> service", corpora: ["types", "api"])`.

```typescript
// BAD
private http = inject(HttpClient);
getDevice(id: string) { return this.http.get(`/inventory/managedObjects/${id}`); }

// GOOD
private inventory = inject(InventoryService);
async getDevice(id: string) {
  const { data } = await this.inventory.detail(id);
  return data;
}
```

## AP-11 · Eager-loaded widget components

**Severity:** Medium. **Why:** widgets registered through hooks are downloaded with the main bundle unless they are
lazy. Lazy loading needs standalone components (AP-06).
**Detect:** `grep -rnE '\b(component|configComponent):\s*[A-Z]\w*Component' src --include=*.ts` inside widget
definitions. Confirm the property names with `resolve_symbol("hookWidget")` / `get_node`.

```typescript
// BAD
{ component: MyWidgetComponent, configComponent: MyWidgetConfigComponent }

// GOOD
{
  loadComponent: () => import('./my-widget/my-widget.component').then(m => m.MyWidgetComponent),
  loadConfigComponent: () => import('./my-widget/my-widget-config.component').then(m => m.MyWidgetConfigComponent),
}
```

## AP-12 · Heavy custom styles and hard-coded colors

**Severity:** Low (Medium if it breaks tenant branding). **Why:** the Cumulocity design system already has utility
classes and CSS custom properties; raw colors ignore tenant branding and dark mode.
**Detect:** `grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' src --include=*.less --include=*.css --include=*.scss`;
`style="` in templates; `margin`/`padding`/`font-size` with raw pixel values; `--c8y-*` tokens overridden with fixed
values. Look up the class or token with `search_concept("<what>", corpora: ["docs"])`.

```less
// BAD
.status { color: #1776BF; margin-top: 8px; }
```

```html
<!-- GOOD — utility classes and design tokens -->
<span class="m-t-8 text-muted">…</span>
```

## AP-13 · Repeated code instead of shared utilities or components

**Severity:** Low. **Why:** copies drift apart and multiply bugs.
**Detect:** the same block or template fragment in more than two files: repeated `filter`/`map` chains, copy-pasted
loading and error handling, identical table or list markup.
**Fix:** extract a shared service (logic), a shared standalone component (markup) or a pure pipe (value formatting).

## AP-14 · Shared model interfaces defined inside components

**Severity:** Low. **Why:** importing a type from a component file couples unrelated code to that component.
**Detect:** `export interface|export type` in `*.component.ts` / `*.service.ts` that other files import.

```typescript
// BAD — in sensor-list.component.ts
export interface SensorFilter { type: string; active: boolean; }

// GOOD — in sensor-filter.model.ts (or src/app/models/)
export interface SensorFilter { type: string; active: boolean; }
```

## AP-15 · Every service `providedIn: 'root'`

**Severity:** Medium. **Why:** a root singleton for component-local state survives the component and leaks state
between instances.
**Detect:** `providedIn: 'root'` services that hold UI state and are injected by one component only.

```typescript
// BAD
@Injectable({ providedIn: 'root' })
export class SensorTableStateService { … }

// GOOD — provided by the owning component, destroyed with it
@Injectable()
export class SensorTableStateService { … }

@Component({ …, providers: [SensorTableStateService] })
export class SensorTableComponent { … }
```

## AP-16 · Long async tasks inside components

**Severity:** Medium. **Why:** a component can be destroyed at any time; polling loops or chained requests started in
it keep running or resolve against a dead view.
**Detect:** `setInterval`, `setTimeout` loops, `while` with `await`, `timer(`/`interval(` in component classes.
**Fix:** move the work into a root service; the component consumes its observable or signal and cleans up (AP-09).

```typescript
// GOOD
@Injectable({ providedIn: 'root' })
export class FirmwareStatusService {
  readonly status$ = timer(0, 5000).pipe(switchMap(() => this.fetchStatus()), shareReplay(1));
}
```

## AP-17 · Unguarded access to `IManagedObject` fragments

**Severity:** High. **Why:** `IManagedObject` has an open index signature, so `mo['c8y_Hardware'].serialNumber`
type-checks but crashes when the fragment is missing or shaped differently.
**Detect:** `grep -rnE "\[['\"]c8y_\w+['\"]\]|\.c8y_\w+\." src --include=*.ts`; `as MyDevice` casts without
validation; `(mo as any)?.a?.b`.
**Fix:** a type predicate, or a Zod schema for complex or nested shapes (only if `zod` is already a dependency).

```typescript
// BAD
return mo['c8y_Hardware'].serialNumber;

// GOOD
interface C8yHardware { model: string; revision: string; serialNumber: string; }
interface DeviceWithHardware extends IManagedObject { c8y_Hardware: C8yHardware; }

function hasHardwareInfo(mo: IManagedObject): mo is DeviceWithHardware {
  const hw = (mo as DeviceWithHardware).c8y_Hardware;
  return typeof hw === 'object' && hw !== null && typeof hw.serialNumber === 'string';
}

if (hasHardwareInfo(device)) return device.c8y_Hardware.serialNumber;
```

```typescript
// GOOD — Zod at the boundary
const C8yHardwareSchema = z.object({ model: z.string(), revision: z.string(), serialNumber: z.string() });
const result = C8yHardwareSchema.safeParse(device['c8y_Hardware']);
if (result.success) { const { serialNumber } = result.data; }
```

## AP-18 · Missing localization (`translate`)

**Severity:** Medium. **Why:** hard-coded strings cannot be translated and break non-English tenants.
**Detect:** text nodes and `placeholder="…"`, `title="…"`, `[placeholder]="'…'"`, `aria-label="…"` without
`| translate`; string literals passed to `AlertService`, `ModalService` or similar; strings concatenated from
translated fragments.

```html
<!-- BAD -->
<button>Save</button>

<!-- GOOD -->
<button>{{ 'Save' | translate }}</button>
```

```typescript
// BAD
this.alert.add({ text: 'Operation failed', type: 'danger' });
// GOOD
this.alert.add({ text: this.translate.instant('Operation failed'), type: 'danger' });
```

Build dynamic text from a whole translatable key with parameters, not from concatenated fragments. If the app ships
`.po` files (e.g. `src/locales/*.po`), add every new key to each of them, at least with the English text as a
placeholder.

## AP-19 · Secrets, credentials, tenant URLs and tenant ids in source

**Severity:** High (security). **Why:** anything committed is public to everyone with repo access and stays in git
history. Apps built with this SDK run against the local mock and need no tenant URL and no credentials at all; a
real tenant URL, tenant id (`t12345`) or credential in source is always a finding. A real tenant is reached
only through `pnpm start:tenant`, with `C8Y_BASEURL` set in the environment.
**Detect:**

- `grep -rnE 'https?://[a-z0-9.-]+\.(cumulocity|c8y)\.[a-z.]+' --exclude-dir=node_modules .`
- `grep -rnE "(password|passwd|secret|token|apiKey|authorization|bearer)\s*[:=]" -i --exclude-dir=node_modules .`
- `grep -rnE "['\"]t[0-9]{5,}['\"]" src cypress` (tenant ids), `--user`, `--password`, `--bearer` in `package.json`
  scripts, `_authToken=` in the project `.npmrc` (it belongs in `~/.npmrc`), JWTs (`eyJ…`) in code or comments
- tracked `.env*` / `*.credentials.json` files with non-example values (`git ls-files | grep -E '\.env|credentials'`)

```jsonc
// BAD — package.json
{ "scripts": { "start": "c8ycli server --user admin:mypassword123 https://mytenant.eu-latest.cumulocity.com" } }

// GOOD — the app runs against the mock; nothing tenant-specific in the repo
{ "scripts": { "start": "c8y-ui dev" } }
```

```typescript
// BAD
const TENANT = 't1234567';
const BASE = 'https://mytenant.cumulocity.com';
// GOOD — use the relative paths of @c8y/client; tenant and user come from the session (or the mock's world)
```

**Action:** remove the value, make sure `.env*` is in `.gitignore`, and tell the user to rotate the credential:
assume it is compromised.

## AP-20 · Deprecated `HOOK_*` tokens instead of hook functions

**Severity:** Low. **Why:** the `HOOK_*` injection tokens from `@c8y/ngx-components` are deprecated; hook functions
are the supported API. Widgets registered with `hookComponent` should use `hookWidget`, which adds them to the widget
gallery with widget-specific configuration.
**Detect:** `grep -rnE 'HOOK_[A-Z_]+|hookComponent\(' src --include=*.ts`. Project-defined `InjectionToken`s named
`HOOK_*` are not affected. Confirm the replacement with `resolve_symbol` before suggesting it.

| Deprecated | Replacement (`@c8y/ngx-components`) |
|---|---|
| `HOOK_TABS` | `hookTab` |
| `HOOK_ROUTE` | `hookRoute` |
| `HOOK_ACTION_BAR` | `hookActionBar` |
| `HOOK_COMPONENTS` | `hookWidget` (widgets) |
| `hookComponent({…})` for a widget | `hookWidget({…})` |

```typescript
// BAD
providers: [{ provide: HOOK_TABS, useClass: MyTabFactory, multi: true }]
// GOOD
providers: [hookTab(MyTabFactory)]

// BAD
hookComponent({ id: 'my-widget', label: 'My Widget', component: MyWidgetComponent })
// GOOD
hookWidget({ id: 'my-widget', label: 'My Widget', component: MyWidgetComponent })
```

## AP-21 · Component members more visible than needed

**Severity:** Low. **Why:** the public surface of a component should be its API for other code. The Angular style
guide (v20+) recommends `protected` for members used only by the template and `private` for internals.
**Detect:** for each `public` (or unmodified) member, search the template and other files: used by nobody outside the
class → `private`; used only by the template → `protected`; inputs, outputs and methods called by parents or tests
stay public.

```typescript
// BAD
export class SensorComponent {
  title = 'Sensors';                              // only the template reads it
  calculateThreshold(): number { … }             // only used internally
}

// GOOD
export class SensorComponent {
  readonly sensor = input.required<IManagedObject>();   // public API
  protected readonly title = 'Sensors';                 // template-only
  protected onUpdate(): void { … }                      // (click)="onUpdate()"
  private calculateThreshold(): number { … }            // internal
}
```

## AP-22 · Using or overriding private APIs of `@c8y/*`

**Severity:** High (technical debt). **Why:** private and internal members of `@c8y/ngx-components`, `@c8y/client`
or any library can change in any release, including patches, and break the app on upgrade.
**Detect:** access to `_`-prefixed members of library classes; `(x as any).member` on library objects;
`Object.defineProperty` / `Object.getOwnPropertyDescriptor` on library objects; `override` of `protected`/`private`
members in classes that extend `@c8y/*` classes. Check with `get_node` whether the member is public in the `.d.ts`.

```typescript
// BAD
const cache = (this.service as any)._cache;
```

**Last resort only**, when no public API exists: document and guard it.

```typescript
// TODO: replace with public API — feature request <issue link>
// Risk: overrides private '_initializeForm()' of DetailsComponent; any upgrade may break this.
override protected _initializeForm(): void {
  super._initializeForm();
  console.assert(typeof (this as any)._formBuilder === 'function', 'DetailsComponent internals changed');
  this.applyCustomValidation();
}
```

Ask the user to file a feature request with Cumulocity and re-check the override on every Web SDK upgrade.

## AP-23 · Checking the HTTP status of a resolved `@c8y/client` response

**Severity:** Low. **Why:** `@c8y/client` service methods reject on non-success responses, so a status check on a
resolved result is always true and suggests a failure branch that never runs.
**Detect:** `grep -rnE '\.status\s*[!=]==?\s*20[01]|\.res\.status' src --include=*.ts` after a `@c8y/client` call.

```typescript
// BAD
const res = await this.inventoryService.detail(id);
if (res.res.status === 200) { this.device = res.data; }

// GOOD
const { data } = await this.inventoryService.detail(id);
this.device = data;
```

Handle failures in `catch`, not in the success path.

## AP-24 · Loosened supply-chain settings or drifting `@c8y/*` versions

**Severity:** High (supply chain). **Why:** `pnpm-workspace.yaml` protects the app against hijacked releases and
malicious install scripts. The `@c8y/*` packages and the shell apps must match the Web SDK version in `c8y-ui.json`;
bumping one package alone breaks the app at runtime.
**Detect:** `git diff <base> -- pnpm-workspace.yaml package.json c8y-ui.json .npmrc .pnpmfile.cjs` and look for:

- `minimumReleaseAge` removed or lowered below `10080`; a public package in `minimumReleaseAgeExclude` as a name or
  pattern (only `@cumulocity-iot/*` belongs there as a pattern), or as an exact version (`name@1.2.3`, a security fix
  taken early) without a comment naming the advisory and the date it turns 7 days old, or after that date
- `ignoreScripts: false` or removed
- `allowBuilds` / `onlyBuiltDependencies` added without a written reason
- `strictPeerDependencies: false` or removed
- `blockExoticSubdeps: false` or removed (a machine's global pnpm config may switch pnpm's default off)
- `trustPolicy: no-downgrade` removed, `trustPolicyIgnoreAfter` lowered to 10080 or less (that checks nothing
  next to the release age), or `trustLockfile: true`; `trustPolicyExclude` entries without an exact version and a reason
- `audit.ignore` entries without a comment naming the package and why it cannot be fixed yet; `audit.level` raised
  above `high`
- an `@c8y/*` version in `package.json` that differs from `c8y-ui.json` → `version`, or `c8y-ui.json` → `version`
  edited by hand; `overrides` entries for `@c8y/*`
- the license check loosened: `.pnpmfile.cjs` removed or its `afterAllResolved` hook emptied, `ignore-pnpmfile` or
  another `pnpmfile` set in `.npmrc` or `pnpm-workspace.yaml`, an entry added to `c8y-ui.json` → `licenses.allow`, or
  to `licenses.accept` without a reason a person gave (a license or order reference, your own scope); a production
  package `pnpm exec c8y-ui licenses` reports
- `.github/workflows/security.yml` weakened: a gating step (`pnpm audit --prod`, the frozen install, `audit
  signatures`, `c8y-ui licenses`) removed or set to `continue-on-error`, an action referenced by tag instead of a full commit SHA,
  broader `permissions`, `persist-credentials` dropped, or a `pull_request_target` trigger added
- `.claude/settings.json`: a `deny` rule removed (`npm install`, `npx`, `yarn`, flags that switch a setting off or
  the pnpm hook file away, `~/.npmrc`), or an `allow` rule that covers one of them

```yaml
# BAD — loosened to get an install through
minimumReleaseAge: 0
ignoreScripts: false
strictPeerDependencies: false

# GOOD — unchanged; a too-new dependency is pinned to an older version in package.json instead
minimumReleaseAge: 10080
ignoreScripts: true
strictPeerDependencies: true
blockExoticSubdeps: true
trustPolicy: no-downgrade
trustPolicyIgnoreAfter: 129600
```

**Fix:** restore the settings. A known advisory goes away with an update (`pnpm update <pkg>` within the release
age), not with an ignore entry; ignore only what the app cannot change (inside `@c8y/*` or the devkit), or until a fix
younger than 7 days is old enough. Taking such a fix early is for advisories in what ships to the browser that the
app is exposed to (`node_modules/@cumulocity-iot/ui-sdk/docs/getting-started.md` → *A fix younger than 7 days*). For a version change, use `pnpm exec c8y-ui versions` to pick a Web SDK version and
change it as a whole (see `creating-apps`).

## AP-25 · Test or demo data in code or Cypress intercepts instead of `mock/world.json`

**Severity:** Medium. **Why:** the mock serves the app's data from `mock/world.json`. Hard-coded devices,
measurements or alarms in components, or `cy.intercept` stubs, bypass the real `@c8y/client` path, hide missing API
calls, and drift from what the e2e tests and `pnpm start` see.
**Detect:**

- arrays or objects of fake platform data in `src/` (`id: '12345'`, `c8y_IsDevice`, `type: 'c8y_…'` literals,
  `mockDevices`, `DEMO_`, `fake`), or `if (isDevMode())` branches returning canned data
- `grep -rn 'cy.intercept' cypress` with a stubbed response (`fixture`, `body`, `statusCode`) for platform endpoints
- new `cypress/fixtures/*.json` holding platform objects

```typescript
// BAD — in a service
getDevices() { return of([{ id: '1', name: 'Pump 1', c8y_IsDevice: {} }]); }

// BAD — in a spec
cy.intercept('GET', '/inventory/managedObjects*', { fixture: 'devices.json' });

// GOOD — the service calls InventoryService; the devices live in mock/world.json
```

**Fix:** move the data into `mock/world.json` (see `building-mock-worlds`, then `pnpm world:check`) and remove the
stub. Intercepts that only wait on or assert a request (`cy.intercept(...).as('x')` without a response) are fine.

## AP-26 · Unsanitized HTML, `eval`, tokens in web storage, a widened content security policy

**Severity:** High (security). **Why:** what a widget shows is data other people write: device and group names,
fragments, alarm and event texts, widget configurations, translations from the tenant. Rendered as HTML or run as
code, it executes in the session of whoever opens the dashboard (stored XSS), with their permissions on the tenant.
Angular escapes `{{ value }}` and sanitizes `[innerHTML]`, `[href]` and `[src]`; the findings are the ways around it.
**Detect:**

- `grep -rnE 'bypassSecurityTrust(Html|Script|Style|Url|ResourceUrl)' src`: every hit, with where the value comes
  from. A constant of the app is fine; anything from the inventory, a widget config, a route or user input is not.
- `grep -rnE '\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write' src` (also through `nativeElement` and
  `Renderer2.setProperty(el, 'innerHTML', …)`)
- `grep -rnE '\beval\(|new Function\(|set(Timeout|Interval)\(\s*[\x27"`]' src`
- `grep -rnE '(local|session)Storage\.setItem' src` holding a token, password or credentials: the Web SDK keeps the
  session (cookie or its own token handling); an app stores neither
- `window.addEventListener('message', …)` without a check of `event.origin`; `postMessage(…, '*')` with platform data
- `contentSecurityPolicy` in `cumulocity.config.ts` (the build writes it into `index.html` as a `<meta>` tag, and the
  mock serves that page, so it applies in `pnpm start` and the e2e tests too) widened in `script-src`: `*`, `http:`,
  `https:` or a new host. A script blocked by it is a reason to bundle the script, not to open the policy.

```typescript
// BAD — the device name runs as HTML for everyone who opens the dashboard
this.html = this.sanitizer.bypassSecurityTrustHtml(`<b>${device.name}</b>`);
this.el.nativeElement.innerHTML = this.config.text;

// GOOD — Angular escapes the value; markup lives in the template
// <b>{{ device.name }}</b>      <p [innerHTML]="config.text"></p>  (sanitized: scripts and handlers are removed)
```

**Fix:** bind the value in the template and let Angular sanitize it. Where trusted markup is unavoidable (an iframe
`src` built from a fixed base URL), validate the value against an allowlist first, keep the bypass in one small
function, and say why in a comment next to the lint exception. `pnpm lint` reports `bypassSecurityTrust…`, DOM HTML
writes, `eval` and `new Function` as errors.
