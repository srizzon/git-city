/**
 * A ref whose value is computed on first read. The home page keeps every
 * developer record for re-layouts (a newcomer, a search), but with the layout
 * arriving prebuilt most visits never read them: decoding 87k records up
 * front cost the loading screen a second for nothing.
 */
export class LazyRef<T> {
  private value: T;
  private pending: (() => T) | null = null;

  constructor(initial: T) {
    this.value = initial;
  }

  get current(): T {
    if (this.pending) {
      const compute = this.pending;
      this.pending = null;
      this.value = compute();
    }
    return this.value;
  }

  set current(v: T) {
    this.pending = null;
    this.value = v;
  }

  /** Defers the value until the first read. */
  setLazy(compute: () => T) {
    this.pending = compute;
  }
}
