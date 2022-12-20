import { default as expect } from "expect.js";
import Repository from "../../src/core/Repository.js";
import ContentReadAdapter from "../../src/core/ContentReadAdapter.js";
import TextAdapter from "../../src/core/TextAdapter.js";
import ResourceAdapter from "../../src/core/ResourceAdapter.js";
import { newReference } from "../../src/utils/references.js";
import RepositoryInMemFilesAdapter from "../../src/core/RepositoryInMemFilesAdapter.js";
import RepositoryFilesAdapter from "../../src/core/RepositoryFilesAdapter.js";
import ContentWriteAdapter from "../../src/core/ContentWriteAdapter.js";
import RepositoryAdapter from "../../src/core/RepositoryAdapter.js";

import { newPathMapping, resolveUrl, concatPath } from "@statewalker/uris";
import { newUrlResolver } from "./importsMapResolver.js";

// import resolve from "./resolve.cjs";

// import testError from "./testError.js";
import { init, parse } from "es-module-lexer";

// const baseUrl = new URL("../../../../node_modules/", import.meta.url);
// import esbuild from "esbuild-wasm"; // "wasm_exec.js"ba
// console.log('>>', esbuild);

// import { installGlobals } from "/home/kotelnikov/workspace-statewalker/statewalker-webrun/node-runtime/index.js"
// installGlobals();

// import blob from "@swc/wasm-web/wasm-web_bg.wasm"
// console.log('>>>', initSwc, new URL("@swc/wasm-web/wasm-web.js", import.meta.url));
// import esbuild from "esbuild-wasm";

// function newUrlResolver1({ importMap, importMapUrl }) {
//   // const pathMapper = newPathMapping(importMap.imports);
//   importMap = resolveAndComposeImportMap(
//     importMap,
//     importMapUrl,
//     baseImportMap,
//   );
//   return async (ref, url) => {
//     let refUrl = resolveImportMap(importMap, ref);
//     if (!refUrl) {
//       refUrl = resolveUrl(ref, url);
//     }

//     // let refUrl = ref;
//     // if (ref[0] !== '.') {
//     //   refUrl = pathMapper(refUrl);
//     //   console.log('>>>>>>', ref, '->', refUrl);
//     //   if (refUrl && importMapUrl) {
//     //     refUrl = resolveUrl(refUrl, importMapUrl);
//     //   }
//     // } else {
//     //   refUrl = resolveUrl(refUrl, url);
//     // }
//     return refUrl;
//   };
// }

class JavaScriptAstAdapter extends ResourceAdapter {
  static initialize() {
    return this._initialization = this._initialization || (async () => {
      await init;
      return parse;

      // const { default : initSwc } = await import(new URL("@swc/wasm-web/wasm-web.js", baseUrl));
      // const wasmUrl = new URL("@swc/wasm-web/wasm-web_bg.wasm", baseUrl);
      // const res = await fetch(wasmUrl.href);
      // console.log('>>>', wasmUrl);
      // const blob = await res.arrayBuffer();
      // // const xxx = await esbuild.initialize();
      // return xxx;
      // // const { default : initSwc } = await import("@swc/wasm-web/wasm-web.js");
      // // console.log('I M HERE!', initSwc);
      // // return initSwc();
    })();
  }
  /**
   * Reference to the promise providing the textual content.
   * This reference can be used to define dependencies in other adapters, using
   * the text content of this resource.
   */
  get astRef() {
    if (!this._astRef) {
      const textAdapter = this.resource.requireAdapter(TextAdapter);
      this._astRef = newReference(
        [textAdapter.textRef],
        this._loadAst.bind(this),
      );
    }
    return this._astRef;
  }

  // get config() {
  //   return {
  //     "jsc": {
  //       "transform": {
  //         "react": {
  //           "pragma": "Foo",
  //           "pragmaFrag": "FooFrag",
  //         },
  //       },
  //       "parser": {
  //         "syntax": "ecmascript",
  //         "jsx": true,
  //       },
  //       "target": "es2022",
  //       "loose": false,
  //       "minify": {
  //         "compress": false,
  //         "mangle": false,
  //       },
  //     },
  //     "module": {
  //       "type": "es6",
  //     },
  //     "minify": false,
  //     "isModule": true,
  //     "env": {
  //       "targets": "",
  //     },
  //   };
  // }

  async _loadAst(textRef) {
    const code = await textRef;
    const parse = await JavaScriptAstAdapter.initialize();
    const url = this.resource.url;
    const [imports, exports] = parse(code, url);

    const resolveUrl = newUrlResolver({
      importMapUrl: "http://localhost:8080/hello/there/",
      importMap: {
        "imports": {
          "abc": "../abc/index.js",
          "abc/": "npm:foo.bar/baz/ABC/",
          "@statewalker/uris": "../../node_modules/@statewalker/uris/index.js",
        },
      },
    });

    // console.log('EXPORTS:', url, exports);
    const result = [];
    for (let { s: start, e: end } of imports) {
      const ref = code.substring(start, end);
      const refUrl = await resolveUrl(ref, url);
      result.push({
        ref,
        url: refUrl,
        start,
        end,
      });
    }
    return result;
    // return parse(code);
    // console.log('>>', parse);
    // return {
    //   code
    // }
    // const result = transformSync(code, { ...this.config.jsc.parser, target: this.config.jsc.target });
    // return result;
  }

  async getJsAst() {
    return await this.astRef();
  }
}

class TypeScriptAstAdapter extends JavaScriptAstAdapter {
}

describe("ContentReadAdapter", () => {
  const resources = {
    "foobar.md": "# Hello, there!\n* item one\n* item two",
    "foo/bar/baz/myscript.js": `
import a from "abc";
import def from "abcdef/one/two";
import y from "abc/x/y.js";
import hello from "./hello.js"
import { resolveUrl } from "@statewalker/uris";
console.log('hello');
export const o = 123;
export default async function hello(name) {
  const toto = await import('./toto');
  return "Hello " + name + ":" + toto + "!";
}
`,
  };

  let repository;
  beforeEach(() => {
    repository = new Repository();

    // Repository Adapters
    const repositoryType = repository.resourceType;
    repository.register(
      repositoryType,
      RepositoryFilesAdapter,
      (repository, options) => {
        return new RepositoryInMemFilesAdapter(repository, {
          ...options,
          files: resources,
        });
      },
    );

    // Resource Adapters
    repository.register("", ContentReadAdapter);
    repository.register("", ContentWriteAdapter);
    repository.register("text", TextAdapter);
    repository.register(
      "text/javascript",
      JavaScriptAstAdapter,
      TypeScriptAstAdapter,
    );
    repository.register("text/jsx", JavaScriptAstAdapter, TypeScriptAstAdapter);
    repository.register("text/ts", JavaScriptAstAdapter, TypeScriptAstAdapter);
    repository.register("text/jsx", JavaScriptAstAdapter, TypeScriptAstAdapter);
  });

  it(`should return a JavaScript AST`, async () => {
    const resourceUrl = "foo/bar/baz/myscript.js";
    const resource = await repository.getResource(resourceUrl, true);

    const jsAstAdapter = resource.getAdapter(JavaScriptAstAdapter);
    let ast = await jsAstAdapter.getJsAst();
    console.log(">>", ast);

    const textAdapter = resource.requireAdapter(TextAdapter);
    await textAdapter.setText(
      "export default function() { console.log('abc'); }",
    );

    ast = await jsAstAdapter.getJsAst();
    console.log(">>", ast);
  });
});
