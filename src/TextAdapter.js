import ResourceAdapter from "./ResourceAdapter.js";
import ContentReadAdapter from "./ContentReadAdapter.js"
import ContentWriteAdapter from "./ContentWriteAdapter.js";

export default class TextAdapter extends ResourceAdapter {

  async setText(text) {
    const writer = await this.requireAdapter(ContentWriteAdapter);
    await writer.writeTextContent(text);
    await this._clearValue('text');
  }

  async getText() {
    return await this._getValue('text', async () => {
      const reader = await this.requireAdapter(ContentReadAdapter);
      let text = '';
      for await (const chunk of reader.readText()) {
        text += chunk;
      }
      return text;
    })
  }

}
