# @statewalker/resources-workspace

The core of the statewalker **resources** framework: a URI-keyed resource repository, an
extensible **adapter** model for reading/writing/transforming resource content, a layer
of self-contained utilities (URI handling, an in-memory LRU cache, a hierarchical adapter
registry, mime-type lookup, fetch helpers), and the `Workspace` / `Project` navigation
abstractions built on top.

The package is self-contained: every utility it relies on lives in `src/utils`.

---

## Layout

The source is organised in three layers, each with its own barrel and re-exported from
`src/index.ts`:

```
src/
  index.ts            public barrel — re-exports utils + core + workspace
  utils/              self-contained helpers
    adapters.ts         Adapters — hierarchical (from, to) adapter registry
    cache-mem/          in-memory LRU cache
      lru.ts              LRU + bindLruMethods
      new-cache.ts        newCache — promise-memoizing cache
      new-active-cache.ts newActiveCache — cache with background pruning
    uris/               URI parsing / resolution
      uri.ts              parseUri, serializeUri, joinUri, resolveUri, makeRelativeUri …
      concat-path.ts      concatPath
      resolve-url.ts      resolveUrl
      make-relative.ts    makeRelative
      new-path-mapping.ts newPathMapping
    fetch.ts            fetchData / fetchWithAbort / handleFetchResults
    get-mime-type.ts    getMimeType
    get-type-path.ts    getTypePath
    mime-types.ts       mime-type tables + lookups
    references.ts       Reference value object (newReference)
  core/               the resource + adapter model
    adaptable.ts        Adaptable base + AdapterType / AdapterConstructor
    adapter.ts          Adapter base
    resource.ts         Resource (an Adaptable URI)
    resource-adapter.ts ResourceAdapter
    repository.ts       ResourceRepository + FilesApi
    repository-adapter.ts
    content-read-adapter.ts / content-write-adapter.ts
    text-adapter.ts     TextAdapter
    json.ts / json-adapter.ts   Json type + JsonAdapter
    output-adapter.ts   OutputAdapter
  workspace/          navigation over a repository
    workspace.ts        Workspace + DEFAULT_SYSTEM_FOLDER
    project.ts          Project
```

Every barrel re-exports its modules with `export * from "./<module>.js"`. `src/` is
browser- and Node-safe: it imports no `node:*` builtins (enforced by
`tests/no-node-imports.test.ts`).

---

## The model

### Resources are URIs; behaviour comes from adapters

A **`Resource`** is just a URI inside a repository. It carries no I/O logic of its own —
all real capability (read content, write content, parse, transform) is attached as an
**adapter**. `Resource` and `ResourceRepository` both extend **`Adaptable`**: you
`register(...)` adapters by resource type and ask for them with
`requireAdapter(SomeAdapter)` / `getAdapter(...)`.

```ts
import {
  ResourceRepository,
  TextAdapter,
} from "@statewalker/resources-workspace";

const repo = new ResourceRepository({ filesApi });

const resource = await repo.getResource("/notes/a.md", /* create */ true);
const text = await resource!.requireAdapter(TextAdapter).read();
```

Built-in adapters cover the common cases — raw content
(`ContentReadAdapter` / `ContentWriteAdapter`), text (`TextAdapter`), JSON
(`JsonAdapter`), and output (`OutputAdapter`). New behaviour is added by writing another
adapter, never by changing `Resource`.

`ResourceRepository` is backed by a **`FilesApi`** — a pluggable file backend interface —
so the same code runs over an in-memory store, local disk, or any remote file backend. It
keeps recently resolved resources in an `LRU` (from `utils/cache-mem`) and matches
adapters through the hierarchical `Adapters` registry (from `utils/adapters`).

### Adapter resolution — the `Adapters` registry

`Adapters` stores entries under a `(from, to)` pair of separator-delimited paths and
resolves the most specific match by walking up both paths:

```ts
import { Adapters } from "@statewalker/resources-workspace";

const a = new Adapters<string>("/");
a.set("menu", "file", "File menu");
a.get("menu", "file/text/markdown"); // → "File menu" (inherited from the "file" prefix)
a.getAll("menu/context", "file/text"); // every match, most specific first
```

### URI utilities

`utils/uris` provides structural URI handling: `parseUri` / `serializeUri`, path joining
(`concatPath`, `joinUri`), resolution (`resolveUrl`, `resolveUri`), relativization
(`makeRelative`, `makeRelativeUri`), and prefix-based remapping (`newPathMapping`).

### In-memory cache

`utils/cache-mem` offers an `LRU` with `max` / `maxAge` eviction and a `dispose` hook,
plus `newCache` (a promise-memoizing wrapper that drops rejected promises so failed
look-ups retry) and `newActiveCache` (which prunes expired entries on a timer).

### Workspace / Project

The `workspace/` layer is a thin set of `ResourceAdapter`s that give a repository a
project structure:

- **`Workspace`** — a `RepositoryAdapter` rooted at a repository, aware of a per-project
  system folder (`DEFAULT_SYSTEM_FOLDER` = `.project`).
- **`Project`** — a `ResourceAdapter` over a sub-tree, resolving paths within the project.

```ts
import { Workspace } from "@statewalker/resources-workspace";

const workspace = repo.requireAdapter(Workspace);
const project = await workspace.getProject("/my-project");
```

---

## Development

```bash
pnpm build      # rolldown bundle (esm + cjs) + tsc declarations
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest — tests mirror the src/ layout under tests/
pnpm lint       # biome check --write
```

Tests live under `tests/` in subfolders mirroring `src/` (`tests/utils`, `tests/core`,
`tests/workspace`).

## License

[MIT](https://choosealicense.com/licenses/mit/)
