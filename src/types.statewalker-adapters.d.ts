declare module "@statewalker/adapters" {
  export class Adapters<T> {
    constructor(separator: string = "/");

    set(from: string, to: string, adapter: T): () => void;

    get(
      from: string,
      to: string,
      fromExact?: boolean,
      toExact?: boolean
    ): undefined | T;

    getAll(
      from: string,
      to: string,
      fromExact?: boolean,
      toExact?: boolean
    ): T[];

    remove(from: string, to: string): undefined | T;
  }
}
