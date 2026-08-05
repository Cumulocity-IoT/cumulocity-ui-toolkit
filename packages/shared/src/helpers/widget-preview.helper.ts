import { TemplateRef } from '@angular/core';
import { WidgetConfigService } from '@c8y/ngx-components/context-dashboard';

/**
 * Registers or clears the widget configuration preview.
 *
 * A `@ViewChild` setter fires with `undefined` when its element leaves the DOM,
 * and the widget config components rely on that to drop the preview again.
 *
 * `WidgetConfigService.setPreview()` has no documented way to clear a preview —
 * its signature is `true | DynamicComponentDefinition | TemplateRef<any>`. Passing
 * `null` resets the internal state and is what all three widget config components
 * have always done; it only ever compiled because `strictNullChecks` was off.
 *
 * The cast is kept here, in one place, so the reliance on undocumented behaviour
 * is visible and easy to remove once the SDK offers a `clearPreview()`.
 *
 * @param service the injected `WidgetConfigService`
 * @param template the preview template, or a falsy value to clear the preview
 */
export function setWidgetPreview(
  service: WidgetConfigService,
  template: TemplateRef<unknown> | null | undefined
): void {
  if (template) {
    service.setPreview(template);

    return;
  }

  // ESLint type-checks against the root tsconfig, where `strictNullChecks` is
  // still off, so it sees this assertion as redundant — under this package's
  // strict config it is required.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  service.setPreview(null as unknown as true);
}
