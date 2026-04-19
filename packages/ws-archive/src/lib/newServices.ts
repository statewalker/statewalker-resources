// Registers a new service consumer callback and returns a cleanup function
export type ServiceConsumer<T> = (
  callback: (values: T[]) => void,
) => () => void;

// Registers a new service provider and returns two functions:
// - provideService: updates the service value
// - removeProvider: unregisters the provider
export type ServiceProvider<T> = (
  intialValue: T,
) => [provideService: (service: T) => void, removeService: () => void];

export function newService<T>(): [ServiceConsumer<T>, ServiceProvider<T>] {
  let consumerId = 0;
  const consumerIndex: Record<number, (values: T[]) => void> = {};
  let providerId = 0;
  const valuesIndex: Record<number, T> = {};

  const notifyConsumers = () => {
    const values = Object.values(valuesIndex);
    for (const consumer of Object.values(consumerIndex)) {
      consumer(values);
    }
  };

  const newConsumer: ServiceConsumer<T> = (callback) => {
    const id = consumerId++;
    callback(Object.values(valuesIndex));
    consumerIndex[id] = callback;
    return () => delete consumerIndex[id];
  };

  const newProvider: ServiceProvider<T> = (value?: T) => {
    const id = providerId++;
    let provideService = (value: T) => {
      valuesIndex[id] = value;
      notifyConsumers();
    };
    let removeService = () => {
      provideService = () => { };
      removeService = () => { };
      delete valuesIndex[id];
      notifyConsumers();
    };
    if (value !== undefined) {
      provideService(value);
    }
    return [(value: T) => provideService(value), () => removeService()];
  };
  return [newConsumer, newProvider];
}
