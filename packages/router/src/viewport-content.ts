/**
 *
 * NOTE: This file is still WIP and will go through at least one more iteration of refactoring, commenting and clean up!
 * In its current state, it is NOT a good source for learning about the inner workings and design of the router.
 *
 */
/* eslint-disable no-fallthrough */
import { IContainer, Writable } from '@aurelia/kernel';
import { Controller, LifecycleFlags, ILifecycle, IHydratedController, ICustomElementController, ICustomElementViewModel } from '@aurelia/runtime-html';
import { IRouteableComponent, RouteableComponentType, ReentryBehavior, LoadInstruction } from './interfaces.js';
import { parseQuery } from './parser.js';
import { Viewport } from './viewport.js';
import { RoutingInstruction } from './instructions/routing-instruction.js';
import { Navigation } from './navigation.js';
import { IConnectedCustomElement } from './endpoints/endpoint.js';
import { Runner, Step } from './runner.js';
import { AwaitableMap } from './awaitable-map.js';

/**
 * The viewport content encapsulates the component loaded into a viewport
 * and keeps track of the component's lifecycle and routing states.
 *
 * During a transition, a viewport has two viewport contents, the current
 * and the next, which is turned back into one when the transition is either
 * finalized or aborted.
 *
 * Viewport contents are used to represent the full component state
 * and can be used for caching.
 */

/**
* @internal - Shouldn't be used directly
*/
export const enum ContentStatus {
  none = 0,
  created = 1,
  activated = 3,
}

export type ContentState = 'created' | 'checkedUnload' | 'checkedLoad' | 'loaded' | 'activated';

/**
 * @internal - Shouldn't be used directly
 */
export class ViewportContent {
  // public contentStatus: ContentStatus = ContentStatus.none;
  public contentStates: AwaitableMap<ContentState, void> = new AwaitableMap();
  // public contentStates: Map<ContentState, undefined> = new Map();
  public loaded: boolean = false;
  public fromCache: boolean = false;
  public fromHistory: boolean = false;
  public reentry: boolean = false;

  public constructor(
    // Can (and wants) be a (resolved) type or a string (to be resolved later)
    // public content: RoutingInstruction = new RoutingInstruction(''),
    public instruction: RoutingInstruction = RoutingInstruction.create('') as RoutingInstruction,
    public navigation = new Navigation({
      instruction: '',
      fullStateInstruction: '',
    }),
    connectedCE: IConnectedCustomElement | null = null
  ) {
    // If we've got a container, we're good to resolve type
    if (!this.instruction.component.isType() && (connectedCE?.container ?? null) !== null) {
      this.instruction.component.type = this.toComponentType(connectedCE!.container!);
    }
  }

  public get componentInstance(): IRouteableComponent | null {
    return this.instruction.component.instance;
  }
  public get viewport(): Viewport | null {
    return this.instruction.viewport.instance;
  }

  public equalComponent(other: ViewportContent): boolean {
    return this.instruction.sameComponent(other.instruction);
  }

  public equalParameters(other: ViewportContent): boolean {
    return this.instruction.sameComponent(other.instruction, true) &&
      // TODO: Review whether query is relevant
      this.navigation.query === other.navigation.query;
  }

  public reentryBehavior(): ReentryBehavior {
    return (this.instruction.component.instance !== null &&
      'reentryBehavior' in this.instruction.component.instance &&
      this.instruction.component.instance.reentryBehavior !== void 0)
      ? this.instruction.component.instance.reentryBehavior
      : ReentryBehavior.default;
  }

  public isCacheEqual(other: ViewportContent): boolean {
    return this.instruction.sameComponent(other.instruction, true);
  }

  public contentController(connectedCE: IConnectedCustomElement): ICustomElementController {
    return Controller.forCustomElement(
      null,
      connectedCE.container,
      this.instruction.component.instance as ICustomElementViewModel,
      connectedCE.element,
      null,
      void 0,
    );
  }

  public createComponent(connectedCE: IConnectedCustomElement, fallback?: string): void {
    // if (this.contentStatus !== ContentStatus.none) {
    if (this.contentStates.has('created')) {
      return;
    }
    // Don't load cached content or instantiated history content
    if (!this.fromCache && !this.fromHistory) {
      try {
        this.instruction.component.instance = this.toComponentInstance(connectedCE.container);
      } catch (e) {
        if (fallback !== void 0) {
          this.instruction.parameters.set({ id: this.instruction.component.name });
          this.instruction.component.set(fallback);
          try {
            this.instruction.component.instance = this.toComponentInstance(connectedCE.container);
          } catch (ee) {
            throw new Error(`'${this.instruction.component.name}' did not match any configured route or registered component name - did you forget to add the component '${this.instruction.component.name}' to the dependencies or to register it as a global dependency?`);
          }
        } else {
          throw new Error(`'${this.instruction.component.name}' did not match any configured route or registered component name - did you forget to add the component '${this.instruction.component.name}' to the dependencies or to register it as a global dependency?`);
        }
      }
    }
    this.contentStates.set('created', void 0);
    // this.contentStatus = ContentStatus.created;

    // if (this.contentStatus !== ContentStatus.created || !this.loaded || !this.content.component.instance) {
    // if (this.contentStatus !== ContentStatus.created || this.loaded || !this.content.component.instance) {
    if (this.contentStates.has('loaded') || !this.instruction.component.instance) {
      return;
    }
    // this.contentStatus = ContentStatus.loaded;
    // Don't load cached content or instantiated history content
    if (!this.fromCache || !this.fromHistory) {
      const controller = this.contentController(connectedCE);
      (controller as Writable<typeof controller>).parent = connectedCE.controller; // CustomElement.for(connectedCE.element)!;
    }
  }

  // public destroyComponent(): void {
  //   // TODO: We might want to do something here eventually, who knows?
  //   // if (this.contentStatus !== ContentStatus.created) {
  //   if (!this.contentStates.has('created')) {
  //     return;
  //   }
  //   // Don't destroy components when stateful
  //   // this.contentStatus = ContentStatus.none;
  //   this.contentStates.delete('created');
  // }

  public canLoad(viewport: Viewport, previousInstruction: Navigation): boolean | LoadInstruction | LoadInstruction[] | Promise<boolean | LoadInstruction | LoadInstruction[]> {
    if (!this.contentStates.has('created') || (this.contentStates.has('checkedLoad') && !this.reentry)) {
      return true;
    }
    this.contentStates.set('checkedLoad', void 0);

    if (!this.instruction.component.instance) {
      return false;
    }

    if (!this.instruction.component.instance.canLoad) {
      return true;
    }

    const typeParameters = this.instruction.component.type ? this.instruction.component.type.parameters : null;
    this.navigation.parameters = this.instruction.parameters.toSpecifiedParameters(typeParameters);
    const merged = { ...parseQuery(this.navigation.query), ...this.navigation.parameters };
    const result = this.instruction.component.instance.canLoad(merged, this.viewport!, this.navigation, previousInstruction);
    if (typeof result === 'boolean') {
      return result;
    }
    if (typeof result === 'string') {
      return [viewport.router.createRoutingInstruction(result, viewport)];
    }
    return result as Promise<RoutingInstruction[]>;
  }

  public canUnload(nextInstruction: Navigation | null): boolean | Promise<boolean> {
    if (!this.instruction.component.instance || !this.instruction.component.instance.canUnload || (this.contentStates.has('checkedUnload') && !this.reentry)) {
      return true;
    }
    this.contentStates.set('checkedUnload', void 0);

    if (!this.contentStates.has('loaded')) {
      return true;
    }

    return this.instruction.component.instance.canUnload(this.viewport!, nextInstruction, this.navigation);
  }
  // public async canUnload(nextInstruction: Navigation | null): Promise<boolean> {
  //   if (!this.content.component.instance || !this.content.component.instance.canUnload) {
  //     return true;
  //   }

  //   const result = this.content.component.instance.canUnload(nextInstruction, this.instruction);

  //   if (typeof result === 'boolean') {
  //     return result;
  //   }
  //   return result;
  // }

  public load(step: Step<void>, previousInstruction: Navigation): Step<void> {
    // if (!this.reentry && (this.contentStatus !== ContentStatus.created || this.loaded)) {
    // if (!this.reentry && this.loaded) {
    // if (!this.contentStates.has('created') || (this.contentStates.has('loaded') && !this.reentry)) {
    //   return;
    // }
    // this.reentry = false;

    // console.log('>>> Runner.run', 'load');
    return Runner.run(step,
      () => this.contentStates.await('checkedLoad'),
      () => {
        if (!this.contentStates.has('created') || (this.contentStates.has('loaded') && !this.reentry)) {
          return;
        }
        this.reentry = false;
        // this.loaded = true;
        // console.log('loaded', this.content.component.name);
        this.contentStates.set('loaded', void 0);
        if (this.instruction.component.instance && this.instruction.component.instance.load) {
          const typeParameters = this.instruction.component.type ? this.instruction.component.type.parameters : null;
          this.navigation.parameters = this.instruction.parameters.toSpecifiedParameters(typeParameters);
          const merged = { ...parseQuery(this.navigation.query), ...this.navigation.parameters };
          return this.instruction.component.instance.load(merged, this.viewport!, this.navigation, previousInstruction);
        }
      }
    ) as Step<void>;
  }
  public unload(nextInstruction: Navigation | null): void | Promise<void> {
    // if (!this.loaded) {
    if (!this.contentStates.has('loaded')) {
      return;
    }
    // this.loaded = false;
    // console.log('loaded', this.content.component.name, 'deleted');
    this.contentStates.delete('loaded');
    if (this.instruction.component.instance && this.instruction.component.instance.unload) {
      return this.instruction.component.instance.unload(this.viewport!, nextInstruction, this.navigation);
    }
  }

  // public unloadComponent(cache: ViewportContent[], stateful: boolean = false): void {
  //   // TODO: We might want to do something here eventually, who knows?
  //   // if (this.contentStatus !== ContentStatus.activated) {
  //   if (!this.contentStates.has('created')) {
  //     return;
  //   }

  //   // Don't unload components when stateful
  //   // TODO: We're missing stuff here
  //   if (!stateful) {
  //     // this.contentStatus = ContentStatus.created;
  //     this.contentStates.delete('created');
  //   } else {
  //     cache.push(this);
  //   }
  // }

  public activateComponent(step: Step<void>, viewport: Viewport, initiator: IHydratedController | null, parent: ICustomElementController | null, flags: LifecycleFlags, connectedCE: IConnectedCustomElement, parentActivated: boolean): Step<void> {
    // if (this.contentStates.has('activated') || !this.contentStates.has('created')) {
    // if (this.contentStates.has('activated')) {
    //   return;
    // }
    // this.contentStates.set('activated', void 0);

    // // if (parentActivated) { // Parent is already part of an activation
    // //   return ;
    // // }

    // const contentController = this.contentController(connectedCE);
    return Runner.run(step,
      () => this.contentStates.await('loaded'),
      () => this.waitForParent(parent, viewport), // TODO: Yeah, this needs to be looked into
      () => {
        if (this.contentStates.has('activated')) {
          return;
        }
        this.contentStates.set('activated', void 0);

        // if (parentActivated) { // Parent is already part of an activation
        //   return ;
        // }

        const contentController = this.contentController(connectedCE);
        return contentController.activate(initiator ?? contentController, parent, flags);
        // if (result instanceof Promise) {
        //   result.then(() => { setTimeout(() => { console.log('RESOLVED activateComponent', viewport.pathname, step.root.report, step); }, 500); });
        // }
        // return result;
      },
      /*
      () => {
        if (this.fromCache || this.fromHistory) {
          const elements = Array.from(connectedCE.element.getElementsByTagName('*'));
          for (const el of elements) {
            const attr = el.getAttribute('au-element-scroll');
            if (attr) {
              const [top, left] = attr.split(',');
              el.removeAttribute('au-element-scroll');
              el.scrollTo(+left, +top);
            }
          }
        }
      },
    */
    ) as Step<void>;
  }
  // public async activateComponent(initiator: IHydratedController | null, parent: ICustomElementController<ICustomElementViewModel> | null, flags: LifecycleFlags, connectedCE: IConnectedCustomElement): Promise<void> {
  //   // if (this.contentStatus !== ContentStatus.created) {
  //   if (!this.contentStates.has('created')) {
  //     return;
  //   }
  //   // this.contentStatus = ContentStatus.activated;
  //   this.contentStates.add('activated');

  //   const contentController = this.contentController(connectedCE);
  //   await contentController.activate(initiator ?? contentController, parent!, flags);

  //   if (this.fromCache || this.fromHistory) {
  //     const elements = Array.from(connectedCE.element.getElementsByTagName('*'));
  //     for (const el of elements) {
  //       const attr = el.getAttribute('au-element-scroll');
  //       if (attr) {
  //         const [top, left] = attr.split(',');
  //         el.removeAttribute('au-element-scroll');
  //         el.scrollTo(+left, +top);
  //       }
  //     }
  //   }
  // }

  public deactivateComponent(initiator: IHydratedController | null, parent: ICustomElementController | null, flags: LifecycleFlags, connectedCE: IConnectedCustomElement, stateful: boolean = false): void | Promise<void> {
    // console.log('deactivateComponent', this.contentStates.has('activated'), this.viewport?.toString());
    // if (this.contentStatus !== ContentStatus.activated) {
    if (!this.contentStates.has('activated')) {
      return;
    }
    // this.contentStatus = ContentStatus.created;
    this.contentStates.delete('activated');

    if (stateful && connectedCE.element !== null) {
      // const contentController = this.content.component.instance!.$controller!;
      const elements = Array.from(connectedCE.element.getElementsByTagName('*'));
      for (const el of elements) {
        if (el.scrollTop > 0 || el.scrollLeft) {
          el.setAttribute('au-element-scroll', `${el.scrollTop},${el.scrollLeft}`);
        }
      }
    }

    const contentController = this.contentController(connectedCE);
    return contentController.deactivate(initiator ?? contentController, parent, flags);
  }

  public disposeComponent(connectedCE: IConnectedCustomElement, cache: ViewportContent[], stateful: boolean = false): void {
    // console.log('disposeComponent', this.contentStates.has('created'), this.viewport?.toString());
    if (!this.contentStates.has('created') || this.instruction.component.instance == null) {
      return;
    }

    // Don't unload components when stateful
    // TODO: We're missing stuff here
    if (!stateful) {
      this.contentStates.delete('created');
      const contentController = this.contentController(connectedCE);
      // console.log('COMPONENT DISPOSED', this.viewport?.toString(), contentController);
      return contentController.dispose();
    } else {
      cache.push(this);
    }
  }

  public freeContent(step: Step<void>, connectedCE: IConnectedCustomElement | null, nextInstruction: Navigation | null, cache: ViewportContent[], stateful: boolean = false): Step<void> {
    // switch (this.contentStatus) {
    //   case ContentStatus.activated:
    //     await this.unload(nextInstruction);
    //     await this.deactivateComponent(null, connectedCE!.controller, LifecycleFlags.none, connectedCE!, stateful);
    //     this.unloadComponent(cache, stateful); // TODO: Hook up to new dispose
    //   case ContentStatus.created:
    //     this.destroyComponent();
    // }
    // TODO: Fix execution order on these
    // These are all safe to run
    // console.log('>>> Runner.run', 'freeContent');
    return Runner.run(step,
      () => this.unload(nextInstruction),
      () => this.deactivateComponent(null, connectedCE!.controller, LifecycleFlags.none, connectedCE!, stateful),
      // () => this.unloadComponent(cache, stateful), // TODO: Hook up to new dispose
      // () => this.destroyComponent(),
      () => this.disposeComponent(connectedCE!, cache, stateful),
    ) as Step<void>;
  }

  public toComponentName(): string | null {
    return this.instruction.component.name;
  }
  public toComponentType(container: IContainer): RouteableComponentType | null {
    if (this.instruction.component.none) {
      return null;
    }
    return this.instruction.component.toType(container);
  }
  public toComponentInstance(container: IContainer): IRouteableComponent | null {
    if (this.instruction.component.none) {
      return null;
    }
    return this.instruction.component.toInstance(container);
  }

  private waitForParent(parent: ICustomElementController | null, viewport: Viewport): void | Promise<void> {
    if (parent === null) {
      return;
    }
    if (!parent.isActive) {
      // console.log('waitingForParent', viewport.pathname);
      return new Promise((resolve) => {
        viewport.activeResolve = resolve;
      });
      // return new Promise((resolve) => {
      //   setTimeout(() => {
      //     console.log('Waiting for parent');
      //     if (parent.isActive) {
      //       console.log('Parent is now active.');
      //       resolve();
      //     } else {
      //       console.log('Parent STILL inactive!');
      //     }
      //   }, 100);
      // });
    }
  }
}
