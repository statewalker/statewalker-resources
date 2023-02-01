import RepositoryAdapter from "./RepositoryAdapter.js";

/**
 * This repository adapter class is used by resource adapters reading and
 * writing local content - by the {@link ContentReadAdapter} and
 * {@link ContentWriteAdapter} classes.
 */
export default class RepositoryFilesAdapter extends RepositoryAdapter {
  constructor(repository, {
    readFile = async function* (/* pathname */) {
      yield (() => {
        throw new Error(
          'The "readFile" method is not defined.',
        );
      })();
    },
    writeFile = async function (/* pathname, content */) {
      throw new Error(
        'The "writeFile" method is not defined.',
      );
    },
    ...options
  }) {
    super(repository, {
      readFile,
      writeFile,
      ...options,
    });
  }

  async *readFile(pathname) {
    yield* this.options.readFile(pathname);
  }

  async *getFilesInfos(pathname, recusive) { }
  
  async writeFile(pathname, content) {
    await this.options.writeFile(pathname, content);
  }
}
