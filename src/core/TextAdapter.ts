import { ResourceAdapter } from "./ResourceAdapter.ts";
import { ContentReadAdapter } from "./ContentReadAdapter.ts";
import { ContentWriteAdapter } from "./ContentWriteAdapter.ts";
import { Reference, newReference } from "../utils/references.ts";

/**
 * This is the caching resource adapter providing access to the underlying text resource content.
 * Multiple calls for the {@link #getText()} method will return the same memoized text block.
 * The {@link #setText(text)} method cleans up the internal reference and the next call
 * to the {@link #getText()} method re-loads the content.
 */
export class TextAdapter extends ResourceAdapter {
  _textRef: Reference<Promise<string>> | undefined;

  /**
   * Reference to the promise providing the textual content.
   * This reference can be used to define dependencies in other adapters, using
   * the text content of this resource.
   */
  get textRef(): Reference<Promise<string>> {
    return (this._textRef =
      this._textRef ||
      newReference([], async () => {
        const reader = this.requireAdapter(ContentReadAdapter);
        let text = "";
        for await (const chunk of reader.readText()) {
          text += chunk;
        }
        return text;
      }));
  }

  /**
   * Save a new text content of this resource. It resets the content reference.
   * @param {string} text a new text content to save
   */
  async setText(text: string) {
    const writer = this.requireAdapter(ContentWriteAdapter);
    await writer.writeText(text);
    this.textRef.reset();
  }

  /**
   * Returns the text content for this resource.
   * @returns the underlying text representation of this resource
   */
  async getText() {
    return await this.textRef();
  }
}
