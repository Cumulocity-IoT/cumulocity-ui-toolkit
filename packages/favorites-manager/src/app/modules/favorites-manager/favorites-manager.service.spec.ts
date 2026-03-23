import { TestBed } from '@angular/core/testing';
import { FavoritesManagerService } from './favorites-manager.service';
import { InventoryService, IResult, IUser, UserService } from '@c8y/client';
import { provideMock } from '~helpers/auto-mock.helper';

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
    const userServiceSpy = jest.spyOn(userService, 'current').mockResolvedValue({
      data: { customProperties: { favorites: ['1', '2', '3'] } },
    } as IResult<IUser>);

    const result = await service.getFavoriteStatus('2');

    expect(result).toBe(true);
    expect(userServiceSpy).toHaveBeenCalled();
  });

  it('should return false if ManagedObject is not marked as favorite', async () => {
    jest.spyOn(userService, 'current').mockResolvedValue({
      data: { customProperties: { favorites: ['1', '2', '3'] } },
    } as IResult<IUser>);

    const result = await service.getFavoriteStatus('4');

    expect(result).toBe(false);
  });

  it('should add ManagedObject to favorites', async () => {
    const updateCurrentSpy = jest
      .spyOn(userService, 'updateCurrent')
      .mockResolvedValue({} as IResult<IUser>);

    jest
      .spyOn(userService, 'current')
      .mockResolvedValue({ data: { customProperties: { favorites: [] } } } as IResult<IUser>);

    await service.addToFavorites('3');
    expect(updateCurrentSpy).toHaveBeenCalledWith({
      customProperties: { favorites: ['3'] },
    } as unknown);
  });

  it('should remove ManagedObject from favorites', async () => {
    const updateCurrentSpy = jest
      .spyOn(userService, 'updateCurrent')
      .mockResolvedValue({} as IResult<IUser>);

    jest.spyOn(userService, 'current').mockResolvedValue({
      data: { customProperties: { favorites: ['1', '2', '3'] } },
    } as IResult<IUser>);

    await service.removeFromFavorites('2');
    expect(updateCurrentSpy).toHaveBeenCalledWith({
      customProperties: { favorites: ['1', '3'] },
    } as unknown);
  });
});
