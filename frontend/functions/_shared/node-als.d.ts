// Workers `nodejs_als` moslik bayrog'i (wrangler.toml) beradigan AsyncLocalStorage — faqat ishlatiladigan qismi.
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, fn: () => R): R;
    getStore(): T | undefined;
  }
}
