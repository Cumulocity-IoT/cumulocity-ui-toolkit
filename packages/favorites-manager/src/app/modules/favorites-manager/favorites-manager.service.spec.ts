import { TestBed } from '@angular/core/testing';
import { FavoritesManagerService } from './favorites-manager.service';
import { InventoryService, IResult, IUser, UserService } from '@c8y/client';
import { provideMock } from '~helpers/auto-mock.helper';

/** Cast an autoMock'd method to a Jasmine spy so we can configure its return value. */
function asSpy<T>(fn: T): jasmine.Spy {
  return fn as unknown as jasmine.Spy;
}

describe('FavoritesManagerService', () => {
  let service: FavoritesManagerService;
  let userService: UserService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FavoritesManagerService, provideMock(UserService), provideMock(InventoryService)],
    });

    service = TestBed.inject(FavoritesManagerService);
    userService = TestBed.inject(UserService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return true if ManagedObject is marked as favorite', async () => {
    asSpy(userService.current).and.returnValue(
      Promise.resolve({
        data: { customProperties: { favorites: ['1', '2', '3'] } },
      } as IResult<IUser>)
    );

    const result = await service.getFavoriteStatus('2');

    expect(result).toBe(true);
    expect(userService.current).toHaveBeenCalled();
  });

  it('should return false if ManagedObject is not marked as favorite', async () => {
    asSpy(userService.current).and.returnValue(
      Promise.resolve({
        data: { customProperties: { favorites: ['1', '2', '3'] } },
      } as IResult<IUser>)
    );

    const result = await service.getFavoriteStatus('4');

    expect(result).toBe(false);
  });

  it('should add ManagedObject to favorites', async () => {
    asSpy(userService.updateCurrent).and.returnValue(Promise.resolve({} as IResult<IUser>));
    asSpy(userService.current).and.returnValue(
      Promise.resolve({ data: { customProperties: { favorites: [] } } } as IResult<IUser>)
    );

    await service.addToFavorites('3');

    expect(userService.updateCurrent).toHaveBeenCalledWith({
      customProperties: { favorites: ['3'] },
    });
  });

  it('should propagate load failures instead of reporting "not a favorite"', async () => {
    const failure = new Error('403');

    asSpy(userService.current).and.returnValue(Promise.reject(failure));

    await expectAsync(service.getFavoriteStatus('2')).toBeRejectedWith(failure);
  });

  it('should not add the same ManagedObject twice', async () => {
    asSpy(userService.updateCurrent).and.returnValue(Promise.resolve({} as IResult<IUser>));
    asSpy(userService.current).and.returnValue(
      Promise.resolve({ data: { customProperties: { favorites: ['3'] } } } as IResult<IUser>)
    );

    await service.addToFavorites('3');

    expect(userService.updateCurrent).not.toHaveBeenCalled();
  });

  it('should not update the user when removing an unknown favorite', async () => {
    asSpy(userService.updateCurrent).and.returnValue(Promise.resolve({} as IResult<IUser>));
    asSpy(userService.current).and.returnValue(
      Promise.resolve({ data: { customProperties: { favorites: ['1'] } } } as IResult<IUser>)
    );

    await service.removeFromFavorites('2');

    expect(userService.updateCurrent).not.toHaveBeenCalled();
  });

  it('should always install the data source callback, even without favorites', async () => {
    asSpy(userService.current).and.returnValue(
      Promise.resolve({ data: { customProperties: {} } } as IResult<IUser>)
    );

    await service.initFavorites();

    expect(service.serverSideDataCallback).toBeDefined();
  });

  it('should return an empty result instead of querying everything without favorites', async () => {
    const inventoryService = TestBed.inject(InventoryService);

    asSpy(userService.current).and.returnValue(
      Promise.resolve({ data: { customProperties: {} } } as IResult<IUser>)
    );

    await service.initFavorites();

    const result = await service.onDataSourceModifier({
      columns: [],
      pagination: { pageSize: 10, currentPage: 1 },
    } as any);

    expect(result.size).toBe(0);
    expect(result.data).toEqual([]);
    expect(inventoryService.list).not.toHaveBeenCalled();
  });

  it('should remove ManagedObject from favorites', async () => {
    asSpy(userService.updateCurrent).and.returnValue(Promise.resolve({} as IResult<IUser>));
    asSpy(userService.current).and.returnValue(
      Promise.resolve({
        data: { customProperties: { favorites: ['1', '2', '3'] } },
      } as IResult<IUser>)
    );

    await service.removeFromFavorites('2');

    expect(userService.updateCurrent).toHaveBeenCalledWith({
      customProperties: { favorites: ['1', '3'] },
    });
  });
});
