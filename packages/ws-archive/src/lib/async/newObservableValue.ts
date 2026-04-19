import { newValue } from "../newValue.js";
import { newAsyncGeneratorFunction } from "./newAsyncGeneratorFunction.js";

export type ObservableValue<T> = {
  value: T;
  listen: (listener: (value: T) => void) => () => void;
} & (() => AsyncGenerator<T>);
export function newObservableValue<T>(val: T): ObservableValue<T> {
  const [get, set, listen] = newValue(val);
  const value = newAsyncGeneratorFunction(listen);
  return Object.defineProperties(value, {
    value: { get, set },
    listen: { value: listen },
  }) as ObservableValue<T>;
}
