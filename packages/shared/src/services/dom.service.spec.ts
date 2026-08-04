import {
  ApplicationRef,
  ComponentFactoryResolver,
  ComponentRef,
  EmbeddedViewRef,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomService } from './dom.service';

describe('DomService', () => {
  let service: DomService;
  let appRef: ApplicationRef;
  let attachView: jasmine.Spy;
  let detachView: jasmine.Spy;
  let resolveComponentFactory: jasmine.Spy;

  beforeEach(() => {
    resolveComponentFactory = jasmine.createSpy('resolveComponentFactory');

    TestBed.configureTestingModule({
      providers: [
        DomService,
        // `ApplicationRef` is not stubbed: replacing that token breaks Angular's
        // own change-detection scheduler, which resolves it internally. The real
        // instance is used and its methods are spied on instead.
        {
          provide: ComponentFactoryResolver,
          useValue: { resolveComponentFactory } as unknown as ComponentFactoryResolver,
        },
      ],
    });

    service = TestBed.inject(DomService);
    appRef = TestBed.inject(ApplicationRef);
    attachView = spyOn(appRef, 'attachView');
    detachView = spyOn(appRef, 'detachView');
  });

  it('appends created component host element to document body', () => {
    const element = document.createElement('div');
    const hostView = { rootNodes: [element] } as EmbeddedViewRef<unknown>;
    const componentRef = { hostView } as unknown as ComponentRef<unknown>;

    resolveComponentFactory.and.returnValue({
      create: jasmine.createSpy('create').and.returnValue(componentRef),
    });

    const appendSpy = spyOn(document.body, 'appendChild');
    const result = service.appendComponentToBody<unknown>(class Dummy {});

    expect(resolveComponentFactory).toHaveBeenCalled();
    expect(attachView).toHaveBeenCalledWith(hostView);
    expect(appendSpy).toHaveBeenCalledWith(element);
    expect(result).toBe(componentRef);
  });

  it('detaches and destroys a component ref', () => {
    const hostView = {} as EmbeddedViewRef<unknown>;
    const destroy = jasmine.createSpy('destroy');
    const componentRef = { hostView, destroy } as unknown as ComponentRef<unknown>;

    service.destroyComponent(componentRef);

    expect(detachView).toHaveBeenCalledWith(hostView);
    expect(destroy).toHaveBeenCalled();
  });
});
