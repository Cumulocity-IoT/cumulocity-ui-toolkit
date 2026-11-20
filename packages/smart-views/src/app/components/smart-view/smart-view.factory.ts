import { inject, Injectable } from '@angular/core';
import { NavigatorNode, type NavigatorNodeFactory } from '@c8y/ngx-components';
import { catchError, EMPTY, from, type Observable, startWith, switchMap } from 'rxjs';
import { SmartViewConfigurationService } from '../../services/smart-view-configuration.service';

/** Default navigator priority for a smart view without an explicit priority. */
const DEFAULT_PRIORITY = 500;

/**
 * Adds one navigator entry per smart view configuration. Re-evaluates whenever a
 * configuration is created, updated or deleted, so the menu stays in sync
 * without a page reload.
 */
@Injectable({ providedIn: 'root' })
export class SmartViewFactory implements NavigatorNodeFactory {
  private readonly configurationService = inject(SmartViewConfigurationService);

  get(): Observable<NavigatorNode[]> {
    return this.configurationService.configurationsChanged$.pipe(
      startWith(undefined),
      // a failed load keeps the current entries instead of ending the stream for the session
      switchMap(() => from(this.loadNodes()).pipe(catchError(() => EMPTY)))
    );
  }

  private async loadNodes(): Promise<NavigatorNode[]> {
    const configurations = await this.configurationService.listConfigurations();

    return configurations.map(
      (config) =>
        new NavigatorNode({
          label: config.name,
          path: `smart-views/${config.id}`,
          icon: config.c8y_SmartViewConfiguration?.icon,
          priority: config.c8y_SmartViewConfiguration?.priority ?? DEFAULT_PRIORITY,
        })
    );
  }
}
