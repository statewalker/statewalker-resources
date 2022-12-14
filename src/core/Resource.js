// import { getLogger } from "@dynotes/logger";
import Adaptable from "./Adaptable.js";

export default class Resource extends Adaptable {

  constructor(options = {}) {
    super(options);
    if (!this.repository) throw new Error(`ResourceRepository is not defined.`)
    if (this.url === undefined) throw new Error(`URL is not defined.`)
    if (this.mimeType === undefined) throw new Error(`Mime type is not defined.`)
  }

  get repository() { return this.options.repository; }
  get adapters() { return this.repository.adapters; }
  get mimeType() { return this.options.mimeType; }
  get resourceType() { return this.mimeType; }
  get url() { return this.options.url; }

}