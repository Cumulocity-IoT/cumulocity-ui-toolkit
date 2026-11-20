import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AlertService } from '@c8y/ngx-components';
import { FavoritesActionComponent } from './favorites-action.component';
import { FavoritesManagerService } from './favorites-manager.service';

describe('FavoritesActionComponent', () => {
  it('stays hidden without an error on pages that show no device or group', async () => {
    const getFavoriteStatus = jasmine.createSpy('getFavoriteStatus');

    TestBed.configureTestingModule({
      imports: [FavoritesActionComponent],
      providers: [
        // a route without `contextData`, e.g. the home dashboard
        { provide: Router, useValue: { routerState: { snapshot: { root: { data: {} } } } } },
        { provide: AlertService, useValue: { danger: jasmine.createSpy('danger') } },
      ],
    }).overrideComponent(FavoritesActionComponent, {
      set: {
        imports: [],
        template: '',
        providers: [{ provide: FavoritesManagerService, useValue: { getFavoriteStatus } }],
      },
    });

    const component = TestBed.createComponent(FavoritesActionComponent).componentInstance;
    const init = (component as unknown as { initFavoriteStatus(): Promise<void> })
      .initFavoriteStatus;

    component.ngOnInit();
    await expectAsync(init.call(component)).toBeResolved();
    expect(getFavoriteStatus).not.toHaveBeenCalled();
    expect(component.isFavoriteStateInitialized).toBeFalse();
  });
});
