import { Component, inject, type OnInit } from '@angular/core';
import { FavoritesManagerService } from './favorites-manager.service';
import { Router } from '@angular/router';
import { findContextData } from './context-route.helper';
import { AlertService, CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';

@Component({
  selector: 'c8y-favorites-action-component',
  templateUrl: 'favorites-action.component.html',
  standalone: true,
  imports: [CoreModule],
  providers: [FavoritesManagerService],
})
export class FavoritesActionComponent implements OnInit {
  isFavorite = false;

  isFavoriteStateInitialized = false;

  private contextId!: string;

  private favoritesManagerService = inject(FavoritesManagerService);

  private router = inject(Router);

  private alertService = inject(AlertService);

  ngOnInit() {
    this.initContext();
    void this.initFavoriteStatus();
  }

  async toggleFavorite(): Promise<void> {
    const shouldRemove = this.isFavorite;

    try {
      if (shouldRemove) {
        await this.favoritesManagerService.removeFromFavorites(this.contextId);
      } else {
        await this.favoritesManagerService.addToFavorites(this.contextId);
      }

      // Only reflect the new state once it has actually been persisted.
      this.isFavorite = !shouldRemove;
    } catch (error) {
      this.alertService.danger(
        shouldRemove
          ? gettext('Could not remove this item from your favorites.')
          : gettext('Could not add this item to your favorites.'),
        error as string
      );
    }
  }

  private initContext(): void {
    this.contextId = findContextData(this.router.routerState.snapshot.root)?.id as string;
  }

  private async initFavoriteStatus(): Promise<void> {
    // No device or group in the route (the action bar also renders elsewhere): there is
    // nothing to favorite, so the action stays hidden. Throwing here was an unhandled
    // rejection, since the caller does not await.
    if (!this.contextId) {
      return;
    }

    try {
      this.isFavorite = await this.favoritesManagerService.getFavoriteStatus(this.contextId);
      this.isFavoriteStateInitialized = true;
    } catch (error) {
      // Leaving the action hidden is better than rendering a star that misreports
      // whether the item is a favorite.
      this.alertService.danger(gettext('Could not load your favorites.'), error as string);
    }
  }
}
