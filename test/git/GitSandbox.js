// import * as git from 'git-essentials'
import fetch from "node-fetch";
import git from "isomorphic-git/index.js";
import http from "isomorphic-git/http/node/index.js";

const authConfig = {
  username: "test-bot",
  password: "*testbot-tst*",
};

import fsPromise from "fs/promises";
import { IsomorphicGitFs } from "@statewalker/webrun-git";
import { MemFilesApi, NodeFilesApi } from "@statewalker/webrun-files";

const rootDir = new URL("./data-workspaces", import.meta.url).pathname;

Promise.resolve().then(main).catch(console.error);

// Methods:
// * init:
//   - fetch(main) - get the main branch from the server
//   - fetch(userBranch) - get the user's branch from the server
//   - NotFound: branch(userBranch) - if it does not exist - create a new branch with this name from the main
//   - checkout(userBranch) - get the content of the user's branch on local disk
// * syncFromServer - get the main and user's branches from the server
//   - fetch(userBranch) - get the user's branch from the server
//   - NotFound: branch(userBranch) - if it does not exist - create a new branch with this name from the main
// * syncToServer 
//   -  syncFromServer()
// * 

function newLocalFilesApi() {
  return new NodeFilesApi({
    fs: fsPromise,
    rootDir,
  });
}

function newMemFilesApi() {
  return new MemFilesApi();
}

async function main() {
  //  await clone({ fs, http, dir, url, depth: 1, ref: 'dist' })
  const dir = "./workspace";

  const inMem = true;
  const filesApi = inMem ? newMemFilesApi() : newLocalFilesApi();

  // const fs = { promises : fsPromise };
  const fs = IsomorphicGitFs.newGitFs(filesApi);

  const config = {
    dir,
    url: `https://projects.statewalker.com/StateWalkerProjects/TestRepo.git`,
  };

  // const branch = `test/${Date.now()}`;
  // const filename = `hello-${Date.now()}.txt`;
  const stamp = Date.now();
  const branch = `users/MrsTest`;
  const filename = `hello.txt`;

  const auth = () => {
    const {
      username,
      password,
    } = authConfig;
    const headers = {
      Authorization: `Basic ${
        Buffer.from(`${username}:${password}`).toString("base64")
      }`,
    };
    return {
      headers,
    };
  };

  await filesApi.remove(config.dir, { recursive: true });

  await git.init({
    fs,
    ...config,
  });

  await git.addRemote({
    fs,
    ...config,
    remote: "origin",
  });

  // Fetch the main branch
  await git.fetch({
    fs,
    http,
    ...config,
    remote: "origin",
    ref: "main",
    onAuth: auth,
  });

  await git.checkout({
    fs,
    http,
    ...config,
    ref: "main",
    onAuth: auth,
  });

  // Fetch the current branch (if any)
  // Or create a new one if it does not exist
  try {
    await git.fetch({
      fs,
      http,
      ...config,
      remote: "origin",
      ref: branch,
      onAuth: auth,
    });
  } catch (err) {
    // console.error(err);
    if (err.code !== 'NotFoundError') throw err;
    await git.branch({
      fs,
      http,
      ...config,
      ref: branch,
      checkout : false,
      onAuth: auth,
    });
  }

  let fileList;

  let commits = await git.log({
    fs,
    ...config,
  });
  console.log({
    commits,
  });

  // const { oid } = commits.pop();

  // await git.checkout({
  //   fs,
  //   ...config,
  //   ref: oid,
  // });

  // fileList = await git.listFiles({
  //   fs,
  //   ...config,
  // });
  // console.log({
  //   fileList,
  // });

  // await git.branch({
  //   fs,
  //   ...config,
  //   ref: branch,
  //   checkout: true,
  // });

  await git.checkout({
    fs,
    ...config,
    ref: branch,
  });

  await filesApi.write(`${config.dir}/${filename}`, [
    new TextEncoder().encode(`# TEST ABC ${Date.now()}`),
  ]);

  await git.add({
    fs,
    filepath: filename,
    ...config,
  });

  let sha = await git.commit({
    fs,
    author: {
      name: "Mr. Test",
      email: "mrtest@example.com",
    },
    message: `Update the ${filename} file. Stamp: ${stamp}.`,
    ...config,
  });
  console.log({
    sha,
  });

  fileList = await git.listFiles({
    fs,
    ...config,
  });

  console.log({
    fileList,
  });

  commits = await git.log({
    fs,
    ...config,
  });
  console.log({
    commits,
  });

  let push = await git.push({
    fs,
    http,
    dir: config.dir,
    remote: branch,
    url: config.url,
    ref: branch,
    onAuth: auth,
  });
  console.log({
    push,
  });


  // await git.pull({
  //   fs,
  //   ...config,
  //   ref: 'main'
  // })

  // commits = await git.log({
  //   fs,
  //   ...config,
  //   ref: 'main'
  // })
  // console.log({
  //   commits
  // })

  // await git.branch({
  //   fs,
  //   ...config,
  //   ref: branch,
  //   checkout: true
  // })

  const merge = await git.merge({
    fs,
    ...config,
    ours: branch,
    theirs: "main",
    fastForward: false,
    author: {
      name: "Mr. Test",
      email: "mrtest@example.com",
    },
  });

  console.log({
    merge,
  });

  await git.checkout({
    fs,
    ...config,
    ref: branch,
  });

  push = await git.push({
    fs,
    http,
    dir: config.dir,
    remote: branch,
    url: config.url,
    ref: branch,
    onAuth: auth,
  });
  console.log({
    push,
  });

  console.log("done");

  /*
    await clone({
      fs,//: new IsomorphicGitFs({ filesApi }),
      http,
      // corsProxy: "https://cors.isomorphic-git.org",
      // url: "https://github.com/isomorphic-git/isomorphic-git",
      ...config
    });
    */

  const logs = await git.log({
    fs,
    dir: config.dir,
  });

  console.log(logs);

  // Now it should not be empty...
  // const content = await fs.readdir(dir);
}
