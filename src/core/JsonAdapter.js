import ResourceAdapter from "./ResourceAdapter.js";
import { newReference } from "../utils/references.js";
import TextAdapter from "./TextAdapter.js";

/**
 * This is the caching resource adapter providing access to the underlying text resource content.
 * Multiple calls for the {@link #getText()} method will return the same memoized text block.
 * The {@link #setText(text)} method cleans up the internal reference and the next call
 * to the {@link #getText()} method re-loads the content.
 */
export default class JsonAdapter extends ResourceAdapter {
  /**
   * Reference to the promise providing the JSON content.
   * This reference can be used to define dependencies in other adapters, using
   * the text content of this resource.
   */
  get jsonRef() {
    const textAdapter = this.requireAdapter(TextAdapter);
    return this._jsonRef = this._jsonRef ||
      newReference([textAdapter.textRef], async () => {
        const str = await textAdapter.getText();
        return JSON.parse(str);
      });
  }

  /**
   * Save a new JSON content of this resource. It resets the content reference.
   * @param {JSON} json a new content to save
   */
  async setJson(json) {
    const textAdapter = this.requireAdapter(TextAdapter);
    // Normally it is not neccessary - the text reference will invalidate the cached JSON as well:
    this.jsonRef.reset();
    await textAdapter.setText(JSON.stringify(json, null, 2));
  }

  /**
   * Returns the JSON content for this resource.
   * @returns the underlying JSON representation of this resource
   */
  async getJson() {
    return await this.jsonRef();
  }
}
