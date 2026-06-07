import type { Reference } from "../utils/index.js";
import { newReference } from "../utils/index.js";
import { ContentReadAdapter } from "./content-read-adapter.js";
import { ContentWriteAdapter } from "./content-write-adapter.js";
import { ResourceAdapter } from "./resource-adapter.js";

export class TextAdapter extends ResourceAdapter {
  private _textRef?: Reference<{ value: Promise<string> }>;

  get textRef(): Reference<{ value: Promise<string> }> {
    return (this._textRef =
      this._textRef ||
      newReference(() => {
        const reader = this.requireAdapter<ContentReadAdapter>(ContentReadAdapter);
        const promise = (async () => {
          let text = "";
          for await (const chunk of reader.readText()) {
            text += chunk;
          }
          return text;
        })();
        return { value: promise };
      }));
  }

  async setText(text: string): Promise<void> {
    const writer = this.requireAdapter<ContentWriteAdapter>(ContentWriteAdapter);
    await writer.writeText(text);
    this.textRef.reset();
  }

  async getText(): Promise<string> {
    return await this.textRef().value;
  }
}
