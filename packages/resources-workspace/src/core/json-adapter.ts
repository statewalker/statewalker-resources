import type { Reference } from "../utils/index.js";
import { newReference } from "../utils/index.js";
import type { Json } from "./json.js";
import { ResourceAdapter } from "./resource-adapter.js";
import { TextAdapter } from "./text-adapter.js";

export class JsonAdapter extends ResourceAdapter {
  private _jsonRef?: Reference<{ value: Promise<Json> }>;

  get jsonRef(): Reference<{ value: Promise<Json> }> {
    const textAdapter = this.requireAdapter<TextAdapter>(TextAdapter);
    return (this._jsonRef =
      this._jsonRef ||
      newReference([textAdapter.textRef], () => {
        const promise = (async () => {
          const str = await textAdapter.getText();
          return JSON.parse(str) as Json;
        })();
        return { value: promise };
      }));
  }

  async setJson(json: Json): Promise<void> {
    const textAdapter = this.requireAdapter<TextAdapter>(TextAdapter);
    this.jsonRef.reset();
    await textAdapter.setText(JSON.stringify(json, null, 2));
  }

  async getJson(): Promise<Json> {
    return await this.jsonRef().value;
  }
}
