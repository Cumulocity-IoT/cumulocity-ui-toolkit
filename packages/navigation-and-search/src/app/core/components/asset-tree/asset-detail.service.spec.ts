import { TestBed } from '@angular/core/testing';
import { InventoryService } from '@c8y/client';
import type { DetailField } from '../../services/settings/detail-panel.model';
import { AssetDetailService, LATEST_MAX_AGE_MS } from './asset-detail.service';

const FIELDS = [
  { source: { kind: 'measurement', series: 'c8y_Temperature.T' } },
] as unknown as DetailField[];

const reading = (value: number) => ({
  data: [{ c8y_LatestMeasurements: { c8y_Temperature: { T: { value, unit: '°C' } } } }],
});

describe('AssetDetailService', () => {
  let service: AssetDetailService;
  let list: jasmine.Spy;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-01-01T10:00:00Z'));
    list = jasmine.createSpy('list');
    TestBed.configureTestingModule({
      providers: [{ provide: InventoryService, useValue: { list } }],
    });
    service = TestBed.inject(AssetDetailService);
  });

  afterEach(() => jasmine.clock().uninstall());

  it('reuses latest values while they are fresh', async () => {
    list.and.resolveTo(reading(20));

    await service.loadLatest('1', FIELDS).result;
    jasmine.clock().tick(LATEST_MAX_AGE_MS - 1_000);
    const again = await service.loadLatest('1', FIELDS).result;

    expect(list).toHaveBeenCalledTimes(1);
    expect(again?.values['c8y_Temperature.T'].value).toBe(20);
  });

  it('reads them again once older than the tree poll — the panel does not freeze', async () => {
    list.and.returnValues(Promise.resolve(reading(20)), Promise.resolve(reading(25)));

    await service.loadLatest('1', FIELDS).result;
    jasmine.clock().tick(LATEST_MAX_AGE_MS);
    const later = await service.loadLatest('1', FIELDS).result;

    expect(list).toHaveBeenCalledTimes(2);
    expect(later?.values['c8y_Temperature.T'].value).toBe(25);
  });
});
