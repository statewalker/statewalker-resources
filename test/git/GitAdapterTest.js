import { default as expect } from "expect.js";
import git from "isomorphic-git";
import http from "isomorphic-git/http/web/index.js";

class Stat {
  constructor(stats) {
    this.type = stats.type;
    this.mode = stats.mode;
    this.size = stats.size;
    this.ino = stats.ino;
    this.mtimeMs = stats.mtimeMs;
    this.ctimeMs = stats.ctimeMs || stats.mtimeMs;
    this.uid = 1;
    this.gid = 1;
    this.dev = 1;
  }
  isFile() {
    return this.type === "file";
  }
  isDirectory() {
    return this.type === "dir";
  }
  isSymbolicLink() {
    return this.type === "symlink";
  }
};

/**
 * See https://isomorphic-git.org/docs/en/fs
 */
class LightFsAdapter {

  constructor(options) {
    this.options = options;
  }
  
  async readFile(path, options = {}) {
    console.log('readFile', path, options);
    const stat = await this._getStat(path, false);
    if (!stat) return '';
    // if (!stat.data) throw new Error('ENOENT')
    return stat.data;
  }

  async writeFile(file, data, options = {}) {
    console.log('writeFile', file, data, options);
    this.options.files[file] = { data, options };
  }

  async unlink(path) {
    console.log('unlink', path);
    delete this.options.files[path];
    const children = await this.readdir(path);
    for (const childPath of children) {
      await this.unlink(childPath);
    }
  }

  async readdir(path, options = {}) {
    console.log('readdir', path, options);
    path = path.replace(/\/$/, '') + '/'; 
    // await this._getStat(path);
    const result = [];
    for (let filePath of Object.keys(this.options.files).sort()) {
      if (filePath.indexOf(path) === 0) {
        const suffix = filePath.substring(path.length);
        if (suffix.indexOf('/') < 0) result.push(filePath);
      }
    }
    return result;
  }

  async mkdir(path, mode) {
    console.log('mkdir', path, mode);
    path = path.replace(/\/$/, '') + '/'; 
    this.options.files[path] = { type : "directory" };
  }

  async stat(path, options = {}) {
    console.log('stat', path, options);
    return await this._getStat( path, false);
  }

  async _getStat(path, check = true) {
    const info = this.options.files[path];
    console.log('_getStat', path, check, info);
    if (!info && check) throw new Error('ENOENT');
    return info;
  }

  // --------------------------------------
  async rmdir(path) {
    console.log('rmdir', path);
    await this.unlink(path);
  }

  async lstat(path, options) {
    console.log('lstat', path, options);
    return await this._getStat( path, false);
  }

  // --------------------------------------

  async readlink(path, options) {
    console.log('readlink', path, options);
    throw new Error("Not implemented");
  }

  async symlink(target, path, type) {
    console.log('symlink', target, path, type);
    throw new Error("Not implemented");
  }

  async chmod(path, mode) {
    console.log('chmod', path, mode);
    throw new Error("Not implemented");
  }
}



describe("GitAdapter", () => {
  it(`should ...`, async () => {
    const files = {};
    const fs = {
      promises : new LightFsAdapter({ files })
    }
    const dir = '/tutorial';
    await git.clone({
      fs,
      http,
      dir,
      corsProxy: 'https://cors.isomorphic-git.org',
      url: 'https://github.com/isomorphic-git/isomorphic-git',
      ref: 'main',
      // singleBranch: true,
      // depth: 10
    });
    
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
    console.log('done', content)

    // const res = await git.getRemoteInfo({
    //   http,
    //   url: 'https://github.com/isomorphic-git/isomorphic-git'
    // });
    // console.log('>', res)
  });
});
