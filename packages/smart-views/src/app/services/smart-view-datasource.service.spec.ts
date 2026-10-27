import { TestBed } from '@angular/core/testing';
import { InventoryService } from '@c8y/client';
import {
  type Column,
  type DataSourceModifier,
  type ServerSideDataResult,
} from '@c8y/ngx-components';
import { provideMock } from '~helpers/auto-mock.helper';
import { SmartViewDatasourceService } from './smart-view-datasource.service';

describe('SmartViewDatasourceService', () => {
  let service: SmartViewDatasourceService;
  let inventory: jasmine.SpyObj<InventoryService>;

  const columns: Column[] = [
    { name: 'name', path: 'name', header: 'Name', searchable: true, sortOrder: 'asc' } as Column,
    { name: 'id', path: 'id', header: 'ID' },
  ];

  function modifier(searchText = ''): DataSourceModifier {
    return {
      columns,
      searchText,
      pagination: { pageSize: 30, currentPage: 2 },
    } as DataSourceModifier;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SmartViewDatasourceService, provideMock(InventoryService)],
    });
    service = TestBed.inject(SmartViewDatasourceService);
    inventory = TestBed.inject(InventoryService) as jasmine.SpyObj<InventoryService>;
    inventory.list.and.callFake((filter: Record<string, any>) =>
      Promise.resolve({
        data: filter.pageSize === 1 ? [] : [{ id: '1' }],
        paging: { totalPages: filter.query.includes('*Turb*') ? 3 : 10 },
      } as never)
    );
    service.configure({ query: "type eq 'c8y_WindTurbine'", columns: [], icon: '' });
  });

  it('returns the page plus filtered and total sizes', async () => {
    const result = (await service.serverSideDataCallback(modifier('Turb'))) as ServerSideDataResult;

    expect(result.data.length).toBe(1);
    expect(result.filteredSize).toBe(3);
    expect(result.size).toBe(10);
  });

  it('embeds the raw query, the search across searchable columns and the sort order', async () => {
    await service.serverSideDataCallback(modifier('Turb'));

    const pageCall = inventory.list.calls
      .allArgs()
      .map(([f]) => f as Record<string, any>)
      .find((f) => f.pageSize === 30) as Record<string, any>;

    expect(pageCall.currentPage).toBe(2);
    expect(pageCall.query).toContain("type eq 'c8y_WindTurbine'");
    expect(pageCall.query).toContain('*Turb*');
    expect(pageCall.query).toContain('$orderby=name asc');
  });

  it('omits the search filter without search text', async () => {
    await service.serverSideDataCallback(modifier());

    inventory.list.calls.allArgs().forEach(([f]) => {
      expect((f as Record<string, any>).query).not.toContain('*');
    });
  });
});

describe('toFilterQueryString', () => {
  it('keeps both parts of a compound stored query', async () => {
    const { QueriesUtil } = await import('@c8y/client');
    const { toFilterQueryString } = await import('../smart-views.model');
    const query = new QueriesUtil().buildQuery({
      __filter: {
        __useFilterQueryString: toFilterQueryString("(type eq 'x') and has(c8y_IsAsset)"),
      },
    });

    expect(query).toContain("type eq 'x'");
    expect(query).toContain('has(c8y_IsAsset)');
  });
});
