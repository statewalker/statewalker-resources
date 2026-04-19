import { ResourceAdapter, TextAdapter } from "@statewalker/resources-core";

export class Notebook extends ResourceAdapter {
  async getContent(): Promise<string> {
    const textAdapter = this.requireAdapter<TextAdapter>(TextAdapter);
    return await textAdapter.getText();
  }

  async setContent(content: string): Promise<void> {
    const textAdapter = this.requireAdapter<TextAdapter>(TextAdapter);
    await textAdapter.setText(content);
  }
}
