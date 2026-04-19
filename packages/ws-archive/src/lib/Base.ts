import { batch, effect, signal } from "@preact/signals-core";
import { newAsyncGenerator } from "./async/newAsyncGenerator.js";
import { newRegistry } from "./newRegistry.js";

function autorun(compute: () => undefined | (() => void)): () => void {
  return effect(() => {
    const action = compute();
    if (typeof action === "function") {
      Promise.resolve().then(() => batch(action));
    }
  });
}
export class Base {
  _register: (action: () => void) => () => void;
  close: () => void;
  constructor() {
    [this._register, this.close] = newRegistry();
  }

  autorun(compute: (x: this) => void): () => void {
    return this._register(autorun(() => compute(this)));
  }

  _defineProperties(...keys: string[]) {
    const obj = this as unknown as Record<string, unknown>;
    for (const key of keys) {
      const value = obj[key];
      const sig = signal(value);
      Object.defineProperty(obj, key, {
        get: () => sig.value,
        set: (v: unknown) => (sig.value = v),
      });
    }
  }

  async *observe<T>(transform: (x: this) => T): AsyncGenerator<T> {
    yield* newAsyncGenerator<T>((next) =>
      effect(() => {
        const value = transform(this);
        value !== undefined && next(value);
      }),
    );
  }

  getObserver<T>(
    action: () => T,
  ): <R = T>(transform?: (x: T) => R) => AsyncGenerator<R> {
    const self = this;
    return async function* <R = T>(
      transform: (x: T) => R = (x: T) => x as unknown as R,
    ) {
      yield* self.observe(() => transform(action()));
    };
  }
}
