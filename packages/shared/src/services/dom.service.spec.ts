import {
  ApplicationRef,
  ComponentFactoryResolver,
  ComponentRef,
  EmbeddedViewRef,
  Injector,
  Type,
} from '@angular/core';
import { DomService } from './dom.service';

describe('DomService', () => {
  it('appends created component host element to document body', () => {
    const element = document.createElement('div');
    const hostView = { rootNodes: [element] } as EmbeddedViewRef<unknown>;
    const componentRef = { hostView } as unknown as ComponentRef<unknown>;
    const create = jasmine.createSpy('create').and.returnValue(componentRef);
    const resolveComponentFactory = jasmine.createSpy('resolveComponentFactory').and.returnValue({ create });
    const componentFactoryResolver = {
      resolveComponentFactory,
    } as unknown as ComponentFactoryResolver;
    const appRef = { attachView: jasmine.createSpy('attachView'), detachView: jasmine.createSpy('detachView') } as unknown as ApplicationRef;
    const injector = {} as Injector;
    const appendSpy = spyOn(document.body, 'appendChild');
    const service = new DomService(componentFactoryResolver, appRef, injector);

    const result = service.appendComponentToBody(class Dummy {} as Type<unknown>);

    expect(resolveComponentFactory).toHaveBeenCalled();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(appRef.attachView).toHaveBeenCalledWith(hostView);
    expect(appendSpy).toHaveBeenCalledWith(element);
    expect(result).toBe(componentRef);
  });

  it('detaches and destroys a component ref', () => {
    const hostView = {} as EmbeddedViewRef<unknown>;
    const componentRef = { hostView, destroy: jasmine.createSpy('destroy') } as unknown as ComponentRef<unknown>;
    const componentFactoryResolver = {} as ComponentFactoryResolver;
    const appRef = { attachView: jasmine.createSpy('attachView'), detachView: jasmine.createSpy('detachView') } as unknown as ApplicationRef;
    const injector = {} as Injector;
    const service = new DomService(componentFactoryResolver, appRef, injector);

    service.destroyComponent(componentRef);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(appRef.detachView).toHaveBeenCalledWith(hostView);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(componentRef.destroy).toHaveBeenCalled();
  });
});
