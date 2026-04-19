export function newRegistry<E = unknown>(
  onError: (error: E) => void = console.error,
  reversed = false
): [
    register: (callback?: () => void | Promise<void>) => () => Promise<void>,
    cleanup: () => Promise<void>,
  ] {
  let registrationsIndex: {
    [registrationId: number]: () => Promise<void>;
  } = {};
  let registrationId = 0;
  return [
    function register(
      listener?: () => void | Promise<void>,
    ): () => Promise<void> {
      const id = registrationId++;
      const unregister = async () => {
        delete registrationsIndex[id];
        try {
          await listener?.();
        } catch (e) {
          (onError ?? console.error)(e as E);
        }
      };
      registrationsIndex[id] = unregister;
      return unregister;
    },
    async function cleanup(): Promise<void> {
      const tasks = reversed
        ? Object.values(registrationsIndex).reverse()
        : Object.values(registrationsIndex);
      registrationsIndex = {};
      for (const task of tasks) {
        await task();
      }
    },
  ];
}
