import git from "isomorphic-git/index.ts";
import http from "isomorphic-git/http/node/index.ts";
import IsomorphicGitFs from "@statewalker/webrun-git";

Promise.resolve().then(main).catch(console.error);

async function main() {
  const files = {};
  // const fsx = new LightningFS("my-app");
  // console.log('>>>', fsx);
  const fs = {
    promises: new LightFsAdapter({ files }),
  };


  const dir = "./tutorial";
  await git.clone({
    fs,
    http,
    dir,
    // corsProxy: "https://cors.isomorphic-git.org",
    url: "https://github.com/isomorphic-git/isomorphic-git",
    ref: "main",
    singleBranch: true,
    // depth: 10
  });

  console.log('===================================================')

  // Now it should not be empty...
  const content = await fs.readdir(dir);

  // await git.init({ fs, dir: '/tutorial' });

  // await git.clone({
  //   fs,
  //   http,
  //   dir: '/tutorial',
  //   // corsProxy: 'https://cors.isomorphic-git.org',
  //   url: 'https://github.com/isomorphic-git/isomorphic-git',
  //   singleBranch: true,
  //   depth: 1
  // })
  console.log("done", content);

  // const res = await git.getRemoteInfo({
  //   http,
  //   url: 'https://github.com/isomorphic-git/isomorphic-git'
  // });
  // console.log('>', res)
}
