import { TestBed } from '@angular/core/testing';
import { Subject, firstValueFrom, take, toArray } from 'rxjs';
import { SmartViewConfigurationService } from '../../services/smart-view-configuration.service';
import { SmartViewFactory } from './smart-view.factory';

describe('SmartViewFactory', () => {
  it('keeps updating the navigator after one failed load', async () => {
    const changed = new Subject<void>();
    const listConfigurations = jasmine
      .createSpy('listConfigurations')
      .and.returnValues(
        Promise.reject(new Error('503')),
        Promise.resolve([{ id: '1', name: 'Pumps', c8y_SmartViewConfiguration: {} }])
      );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SmartViewConfigurationService,
          useValue: { configurationsChanged$: changed, listConfigurations },
        },
      ],
    });

    const nodes = firstValueFrom(TestBed.inject(SmartViewFactory).get().pipe(take(1), toArray()));

    // the first load (on subscribe) fails, the next change loads again
    await new Promise((resolve) => setTimeout(resolve));
    changed.next();

    const [first] = await nodes;

    expect(first.map((node) => node.label)).toEqual(['Pumps']);
  });
});
