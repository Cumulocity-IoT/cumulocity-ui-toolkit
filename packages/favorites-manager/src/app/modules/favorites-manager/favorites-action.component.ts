import { Component, inject, OnInit } from '@angular/core';
import { FavoritesManagerService } from './favorites-manager.service';
import { ActivatedRoute } from '@angular/router';
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

  private activatedRoute = inject(ActivatedRoute);

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
    this.contextId = (
      (this.activatedRoute.snapshot.parent?.data ||
        this.activatedRoute.snapshot.firstChild?.data) as {
        contextData: { id: string };
      }
    ).contextData?.id;
  }

  private async initFavoriteStatus(): Promise<void> {
    if (!this.contextId) {
      throw new Error('Failed to initialize context');
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
