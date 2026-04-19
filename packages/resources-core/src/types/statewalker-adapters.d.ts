declare module "@statewalker/adapters" {
  export class Adapters {
    constructor(separator: string);
    set(resourceType: string, adapterType: string, adapter: any): () => void;
    get(resourceType: string, adapterType: string): any;
  }
}
