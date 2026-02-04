import { Component, inject, OnInit } from '@angular/core';
import { FavoritesManagerService } from './favorites-manager.service';
import { ActivatedRoute } from '@angular/router';
import { CoreModule } from '@c8y/ngx-components';

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

  ngOnInit() {
    this.initContext();
    void this.initFavoriteStatus();
  }

  toggleFavorite(): void {
    if (this.isFavorite) {
      void this.favoritesManagerService.removeFromFavorites(this.contextId);
    } else {
      void this.favoritesManagerService.addToFavorites(this.contextId);
    }

    this.isFavorite = !this.isFavorite;
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

    this.isFavorite = await this.favoritesManagerService.getFavoriteStatus(this.contextId);
    this.isFavoriteStateInitialized = true;
  }
}
