import { ResourceAdapter } from "../core/ResourceAdapter.ts";
import { TextAdapter } from "../core/TextAdapter.ts";

export class Notebook extends ResourceAdapter {
  async getContent() {
    const textAdapter = this.requireAdapter(TextAdapter);
    return await textAdapter.getText();
  }

  async setContent(content: string) {
    const textAdapter = this.requireAdapter(TextAdapter);
    return await textAdapter.setText(content);
  }
}
