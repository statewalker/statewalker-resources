export function newListeners<T extends unknown[], E = unknown>(
  onError: (error: E) => void = console.error,
): [
  addListener: (listener: (...args: T) => void | Promise<void>) => () => void,
  notifyListeners: (...args: T) => Promise<void>,
] {
  const listeners: {
    [listenerId: number]: (...args: T) => void | Promise<void>;
  } = {};
  let listenerId = 0;
  function addListener(
    listener: (...args: T) => void | Promise<void>,
  ): () => void {
    const id = listenerId++;
    listeners[id] = listener;
    return () => {
      delete listeners[id];
    };
  }
  async function notify(...args: T): Promise<void> {
    for (const listener of Object.values(listeners)) {
      try {
        await listener(...args);
      } catch (e) {
        onError(e as E);
      }
    }
  }
  return [addListener, notify];
}
