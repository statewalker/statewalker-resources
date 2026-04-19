import { getAdapter } from "./newAdapter.js";
import {
  type ServiceConsumer,
  type ServiceProvider,
  newService,
} from "./newServices.js";

export function newServiceAdapter<T, C = unknown>(
  extensionKey: string,
): [
  getService: (context: C) => [ServiceConsumer<T>, ServiceProvider<T>],
  removeService: (context: C) => void,
] {
  return getAdapter<[ServiceConsumer<T>, ServiceProvider<T>], C>(
    extensionKey,
    () => newService<T>(),
  );
}
