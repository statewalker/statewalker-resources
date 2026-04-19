import type { Reference } from "@statewalker/resources-utils";
import { newReference } from "@statewalker/resources-utils";
import { ResourceAdapter } from "./resource-adapter.js";
import { TextAdapter } from "./text-adapter.js";

export class JsonAdapter extends ResourceAdapter {
  private _jsonRef?: Reference<{ value: Promise<unknown> }>;

  get jsonRef(): Reference<{ value: Promise<unknown> }> {
    const textAdapter = this.requireAdapter<TextAdapter>(TextAdapter);
    return (this._jsonRef =
      this._jsonRef ||
      newReference([textAdapter.textRef], () => {
        const promise = (async () => {
          const str = await textAdapter.getText();
          return JSON.parse(str);
        })();
        return { value: promise };
      }));
  }

  async setJson(json: unknown): Promise<void> {
    const textAdapter = this.requireAdapter<TextAdapter>(TextAdapter);
    this.jsonRef.reset();
    await textAdapter.setText(JSON.stringify(json, null, 2));
  }

  async getJson(): Promise<unknown> {
    return await this.jsonRef().value;
  }
}
