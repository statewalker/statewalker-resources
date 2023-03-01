import ResourceAdapter from "../core/ResourceAdapter.js";
import TextAdapter from "../core/TextAdapter.js"

export default class Notebook extends ResourceAdapter {

  async getContent() {
    const textAdapter = this.requireAdapter(TextAdapter);
    return await textAdapter.getText();
  }
    
  async setContent(content) {
    const textAdapter = this.requireAdapter(TextAdapter);
    return await textAdapter.setText(content);
  }

}
