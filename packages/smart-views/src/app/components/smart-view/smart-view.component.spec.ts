import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, type ParamMap } from '@angular/router';
import { InventoryService } from '@c8y/client';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { SmartViewDatasourceService } from '../../services/smart-view-datasource.service';
import { SmartViewComponent } from './smart-view.component';

const view = (id: string) => ({
  data: {
    id,
    name: `View ${id}`,
    c8y_SmartViewConfiguration: {
      query: '',
      columns: [{ name: 'name', path: 'name', header: 'Name' }],
    },
  },
});

describe('SmartViewComponent', () => {
  it('shows the view navigated to last, even if the previous one answers later', async () => {
    const params = new Subject<ParamMap>();
    const answers = new Map<string, () => void>();

    TestBed.configureTestingModule({
      imports: [SmartViewComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        {
          provide: InventoryService,
          useValue: {
            detail: (id: string) =>
              new Promise((resolve) => answers.set(id, () => resolve(view(id)))),
          },
        },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).overrideComponent(SmartViewComponent, {
      set: {
        imports: [],
        template: '',
        providers: [
          { provide: SmartViewDatasourceService, useValue: { configure: () => undefined } },
        ],
      },
    });

    const fixture = TestBed.createComponent(SmartViewComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    params.next(convertToParamMap({ id: 'A' }));
    params.next(convertToParamMap({ id: 'B' }));

    answers.get('B')!();
    await new Promise((resolve) => setTimeout(resolve));
    answers.get('A')!();
    await new Promise((resolve) => setTimeout(resolve));

    expect(component.title()).toBe('View B');
    expect(component.loading()).toBeFalse();
  });
});
