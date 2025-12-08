import { TestBed } from '@angular/core/testing';
import { FavoritesManagerService } from './favorites-manager.service';
import { UserService } from '@c8y/ngx-components/api';
import { InventoryService, IResult, IUser } from '@c8y/client';
import { provideMock } from '../../../../../../libs/helpers/auto-mock.helper';

describe('FavoritesManagerService', () => {
  let service: FavoritesManagerService;
  let userService: UserService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FavoritesManagerService, UserService, provideMock(InventoryService)],
    });

    service = TestBed.inject(FavoritesManagerService);
    userService = TestBed.inject(UserService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return true if ManagedObject is marked as favorite', async () => {
    const userServiceSpy = spyOn(userService, 'current').and.returnValue(
      Promise.resolve({ data: { customProperties: { favorites: ['1', '2', '3'] } } }) as Promise<
        IResult<IUser>
      >
    );

    const result = await service.getFavoriteStatus('2');

    expect(result).toBeTrue();
    expect(userServiceSpy).toHaveBeenCalled();
  });

  it('should return false if ManagedObject is not marked as favorite', async () => {
    spyOn(userService, 'current').and.returnValue(
      Promise.resolve({ data: { customProperties: { favorites: ['1', '2', '3'] } } }) as Promise<
        IResult<IUser>
      >
    );

    const result = await service.getFavoriteStatus('4');

    expect(result).toBeFalse();
  });

  it('should add ManagedObject to favorites', async () => {
    const updateCurrentSpy = spyOn(userService, 'updateCurrent').and.returnValue(
      Promise.resolve({} as Promise<IResult<IUser>>)
    );

    spyOn(userService, 'current').and.returnValue(
      Promise.resolve({ data: { customProperties: { favorites: [] } } }) as Promise<IResult<IUser>>
    );

    await service.addToFavorites('3');
    expect(updateCurrentSpy).toHaveBeenCalledWith({
      customProperties: { favorites: ['3'] },
    } as unknown as jasmine.Expected<IUser>);
  });

  it('should remove ManagedObject from favorites', async () => {
    const updateCurrentSpy = spyOn(userService, 'updateCurrent').and.returnValue(
      Promise.resolve({} as Promise<IResult<IUser>>)
    );

    spyOn(userService, 'current').and.returnValue(
      Promise.resolve({ data: { customProperties: { favorites: ['1', '2', '3'] } } }) as Promise<
        IResult<IUser>
      >
    );

    await service.removeFromFavorites('2');
    expect(updateCurrentSpy).toHaveBeenCalledWith({
      customProperties: { favorites: ['1', '3'] },
    } as unknown as jasmine.Expected<IUser>);
  });
});
