import {
  ApplicationRef,
  ComponentFactoryResolver,
  ComponentRef,
  EmbeddedViewRef,
  inject,
  Injectable,
  Injector,
  Type,
} from '@angular/core';

@Injectable()
export class DomService {
  private componentFactoryResolver = inject(ComponentFactoryResolver);
  private appRef = inject(ApplicationRef);
  private injector = inject(Injector);

  appendComponentToBody(component: Type<unknown>): ComponentRef<unknown> {
    const componentRef = this.componentFactoryResolver
      .resolveComponentFactory(component)
      .create(this.injector);

    this.appRef.attachView(componentRef.hostView);

    const domElem = (componentRef.hostView as EmbeddedViewRef<HTMLElement>)
      .rootNodes[0] as HTMLElement;

    document.body.appendChild(domElem);

    return componentRef;
  }

  destroyComponent(componentRef: ComponentRef<unknown>): void {
    this.appRef.detachView(componentRef.hostView);
    componentRef.destroy();
  }
}
