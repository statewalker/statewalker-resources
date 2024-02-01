import { describe, expect, it } from "../deps.ts";

import { Adaptable, AdaptersManager } from "@/adapters/index.ts";

class Root extends Adaptable {
  _adapters: AdaptersManager;
  constructor(manager: AdaptersManager) {
    super();
    this._adapters = manager;
  }
  get adapters() {
    return this._adapters;
  }
}

class Resource extends Root {}

class Text {
  getText(): string {
    return "";
  }
}

class JsonAdapter {
  resource: Resource;
  constructor(resource: Resource) {
    this.resource = resource;
  }
  getJson() {
    const text = this.resource.getAdapter(Text);
    if (!text) return;
    return JSON.parse(text.getText());
  }
}

class ResourceText extends Text {
  _resource: Resource;
  mimeType: string;
  constructor(resource: Resource, mimeType: string = "text/plain") {
    super();
    this._resource = resource;
    this.mimeType = mimeType;
  }
  get adapterTypePrefixes(): string[] {
    return this.mimeType.split("/").reverse();
  }
  get resource() {
    return this._resource;
  }
  getText() {
    return JSON.stringify({
      message: "Hello, world!",
    });
  }
}

describe("Adapters", () => {
  it(`should be able to create adapters manager`, async () => {
    const manager = new AdaptersManager();
    class MyResourceText extends ResourceText {
      getText() {
        return JSON.stringify({
          message: "Hello Wonderful World!",
        });
      }
    }
    manager.registerAdapterFactory(Root, Text);
    manager.registerAdapterFactory(
      Resource,
      Text,
      (resource: Resource) => new MyResourceText(resource)
    );
    manager.registerAdapterFactory(Resource, JsonAdapter);

    const foobar = new Resource(manager);
    const text = foobar.getAdapter(Text);
    expect(text instanceof Text).toBe(true);
    expect(text?.getText()).toBe(
      JSON.stringify({
        message: "Hello Wonderful World!",
      })
    );

    const json = foobar.getAdapter(JsonAdapter);
    expect(json instanceof JsonAdapter).toBe(true);
    expect(json?.getJson()).toEqual({
      message: "Hello Wonderful World!",
    });
  });
});
