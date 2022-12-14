import ResourceAdapter from "./ResourceAdapter.js";
import ContentReadAdapter from "./ContentReadAdapter.js";
import ContentWriteAdapter from "./ContentWriteAdapter.js";
import { newReference } from "../utils/references.js";

/**
 * This is the caching resource adapter providing access to the underlying text resource content.
 * Multiple calls for the {@link #getText()} method will return the same memoized text block.
 * The {@link #setText(text)} method cleans up the internal reference and the next call
 * to the {@link #getText()} method re-loads the content.
 */
export default class TextAdapter extends ResourceAdapter {
  /**
   * Reference to the promise providing the textual content.
   * This reference can be used to define dependencies in other adapters, using
   * the text content of this resource.
   */
  get textRef() {
    return this._textRef = this._textRef || newReference(async () => {
      const reader = await this.requireAdapter(ContentReadAdapter);
      let text = "";
      for await (const chunk of reader.readText()) {
        text += chunk;
      }
      return text;
    });
  }

  /**
   * Save a new text content of this resource. It resets the content reference.
   * @param {string} text a new text content to save
   */
  async setText(text) {
    const writer = await this.requireAdapter(ContentWriteAdapter);
    await writer.writeTextContent(text);
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
