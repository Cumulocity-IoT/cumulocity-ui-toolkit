import {
  inject,
  ApplicationRef,
  ComponentFactoryResolver,
  ComponentRef,
  EmbeddedViewRef,
  Injectable,
  Injector,
  Type,
} from '@angular/core';

/**
 * Service for dynamically creating and attaching Angular components to the DOM.
 * Handles component instantiation, view attachment, and cleanup.
 */
@Injectable()
export class DomService {
  private componentFactoryResolver = inject(ComponentFactoryResolver);
  private appRef = inject(ApplicationRef);
  private injector = inject(Injector);

  /**
   * Dynamically creates a component and appends it to the document body.
   * Automatically manages the component's lifecycle within Angular's change detection.
   *
   * @template T - The component type to instantiate
   * @param component - The component class to instantiate and append to the DOM
   * @returns A reference to the created component for further manipulation or destruction
   * @throws {TypeError} If the component cannot be resolved or the DOM element is not found
   *
   * @example
   * const componentRef = this.domService.appendComponentToBody(MyDynamicComponent);
   * // Later: this.domService.destroyComponent(componentRef);
   */
  appendComponentToBody<T>(component: Type<T>): ComponentRef<T> {
    const componentRef = this.componentFactoryResolver
      .resolveComponentFactory(component)
      .create(this.injector);

    this.appRef.attachView(componentRef.hostView);

    const domElem = (componentRef.hostView as EmbeddedViewRef<T>).rootNodes[0] as HTMLElement;

    document.body.appendChild(domElem);

    return componentRef;
  }

  /**
   * Removes a dynamically created component from the DOM and destroys it.
   * Handles cleanup of the view and the component instance.
   *
   * @template T - The component type
   * @param componentRef - The component reference to destroy
   *
   * @example
   * this.domService.destroyComponent(componentRef);
   */
  destroyComponent<T>(componentRef: ComponentRef<T>): void {
    this.appRef.detachView(componentRef.hostView);
    componentRef.destroy();
  }
}
