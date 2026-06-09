import {
  ContentReadAdapter,
  ContentWriteAdapter,
  Project,
  ProjectBuilder,
  ResourceRepository,
  TextAdapter,
  Workspace,
} from "@statewalker/resources-workspace";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contentBuilder,
  type DocumentMetaOutput,
  type LlmApi,
  metaBuilder,
  pruneBuilder,
  type ReorganizeActions,
  registerContentExtraction,
  registerKnowledgeAdapters,
  reorganizeBuilder,
  summarizeBuilder,
  WikiTopicIndex,
} from "../../src/index.js";
import { registerStubLlm } from "../util/stub-llm.js";

interface TopicDecl {
  key: string;
  name: string;
  description: string;
}

type ReorganizeFn = (input: {
  candidates: { key: string; name: string; description: string; perDocUris: string[] }[];
}) => ReorganizeActions;

/** A controllable LLM stub: per-uri topic declarations + a settable reorganize decision. */
function tracker() {
  const calls: string[] = [];
  const topicsByUri = new Map<string, TopicDecl[]>();
  let reorganize: ReorganizeFn = () => ({ actions: [] });
  const generateObject: LlmApi["generateObject"] = async (spec) => {
    calls.push(spec.name);
    const out = (o: unknown) => ({
      output: o as never,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    const input = spec.input as { uri?: string };
    if (spec.name === "summarize-document") {
      return out({
        title: "t",
        summary: "s",
        sections: [{ key: "s", title: "S", startLine: 0, endLine: 0, summary: "x" }],
      });
    }
    if (spec.name === "extract-document-meta") {
      const decls = topicsByUri.get(input.uri ?? "") ?? [];
      const meta: DocumentMetaOutput = {
        topics: decls.map((d) => ({
          key: d.key,
          name: d.name,
          description: d.description,
          sectionKeys: ["s"],
          brief: "b",
        })),
        outliers: [],
      };
      return out(meta);
    }
    if (spec.name === "reorganize-topics") {
      return out(reorganize(spec.input as Parameters<ReorganizeFn>[0]));
    }
    throw new Error(`unexpected ${spec.name}`);
  };
  return {
    generateObject,
    calls,
    topicsByUri,
    setReorganize: (f: ReorganizeFn) => {
      reorganize = f;
    },
  };
}

async function setup() {
  const filesApi = new MemFilesApi({ initialFiles: {} });
  const repository = new ResourceRepository({ filesApi });
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("", TextAdapter);
  repository.register("", Project);
  repository.register("", ProjectBuilder);
  repository.register(ResourceRepository, Workspace);
  registerContentExtraction(repository);
  registerKnowledgeAdapters(repository);

  const t = tracker();
  registerStubLlm(repository, { generateObject: t.generateObject });
  const workspace = repository.requireAdapter<Workspace>(Workspace);
  const project = await workspace.getProject("proj", true);
  const builder = project.requireAdapter(ProjectBuilder);
  builder.registerBuilder(contentBuilder());
  builder.registerBuilder(summarizeBuilder());
  builder.registerBuilder(metaBuilder());
  builder.registerBuilder(reorganizeBuilder());
  builder.registerBuilder(pruneBuilder());

  const write = async (path: string, text: string) => {
    await filesApi.write(
      path,
      (async function* () {
        yield new TextEncoder().encode(text);
      })(),
    );
  };
  const run = async () => {
    for await (const _ of builder.run()) {
      // drain
    }
  };
  const topics = async () => (await project.requireAdapter(WikiTopicIndex).read()).topics;
  return { t, write, run, topics };
}

describe("reorganizer — incremental LLM topic merge", () => {
  let h: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    h = await setup();
  });

  it("folds exact-key candidates into the existing index mechanically, with no LLM call", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "shared", name: "Shared", description: "d" }]);
    await h.write("proj/a.md", "alpha");
    await h.run();

    // Second document declares the SAME key → exact-key pre-merge, no LLM round.
    h.t.topicsByUri.set("b.md", [{ key: "shared", name: "Shared", description: "d" }]);
    await h.write("proj/b.md", "bravo");
    h.t.calls.length = 0;
    await h.run();

    const tp = await h.topics();
    expect(tp.map((x) => x.key)).toEqual(["shared"]);
    expect(tp[0].references.map((r) => r.uri).sort()).toEqual(["a.md#shared", "b.md#shared"]);
    expect(h.t.calls).not.toContain("reorganize-topics");
  });

  it("folds a near-duplicate candidate into an existing topic via match-existing", async () => {
    h.t.topicsByUri.set("a.md", [
      { key: "fund-performance", name: "Fund performance", description: "Fund returns." },
    ]);
    await h.write("proj/a.md", "alpha");
    await h.run();

    h.t.topicsByUri.set("b.md", [
      {
        key: "investment-fund-performance",
        name: "Investment Fund Performance",
        description: "Returns of investment funds.",
      },
    ]);
    h.t.setReorganize((input) => ({
      actions: [
        {
          kind: "match-existing",
          globalKey: "fund-performance",
          perDocUris: input.candidates.flatMap((c) => c.perDocUris),
        },
      ],
    }));
    await h.write("proj/b.md", "bravo");
    h.t.calls.length = 0;
    await h.run();

    expect(h.t.calls).toContain("reorganize-topics");
    const tp = await h.topics();
    expect(tp.map((x) => x.key)).toEqual(["fund-performance"]);
    expect(tp[0].references.map((r) => r.uri).sort()).toEqual([
      "a.md#fund-performance",
      "b.md#investment-fund-performance",
    ]);
  });

  it("coins a new index topic via new-global when nothing fits", async () => {
    h.t.topicsByUri.set("a.md", [
      { key: "fund-performance", name: "Fund performance", description: "Fund returns." },
    ]);
    await h.write("proj/a.md", "alpha");
    await h.run();

    h.t.topicsByUri.set("b.md", [
      { key: "weather-data", name: "Weather data", description: "Atmospheric readings." },
    ]);
    h.t.setReorganize((input) => ({
      actions: [
        {
          kind: "new-global",
          name: "Weather data",
          description: "Atmospheric readings.",
          perDocUris: input.candidates.flatMap((c) => c.perDocUris),
        },
      ],
    }));
    await h.write("proj/b.md", "bravo");
    await h.run();

    const tp = await h.topics();
    expect(tp.map((x) => x.key)).toEqual(["fund-performance", "weather-data"]);
    expect(tp.find((x) => x.key === "weather-data")?.references.map((r) => r.uri)).toEqual([
      "b.md#weather-data",
    ]);
  });

  it("extends an existing topic's description without rewriting it", async () => {
    h.t.topicsByUri.set("a.md", [
      { key: "fund-performance", name: "Fund performance", description: "Fund returns." },
    ]);
    await h.write("proj/a.md", "alpha");
    await h.run();

    h.t.topicsByUri.set("b.md", [
      { key: "irr-metrics", name: "IRR metrics", description: "Internal rate of return." },
    ]);
    h.t.setReorganize((input) => ({
      actions: [
        {
          kind: "extend-existing",
          globalKey: "fund-performance",
          descriptionExtension: "Adds IRR detail.",
          perDocUris: input.candidates.flatMap((c) => c.perDocUris),
        },
      ],
    }));
    await h.write("proj/b.md", "bravo");
    await h.run();

    const tp = await h.topics();
    expect(tp.map((x) => x.key)).toEqual(["fund-performance"]);
    const topic = tp[0];
    expect(topic.description).toBe("Fund returns. Adds IRR detail.");
    expect(topic.references.map((r) => r.uri).sort()).toEqual([
      "a.md#fund-performance",
      "b.md#irr-metrics",
    ]);
  });

  it("preserves untouched documents' index topics across a batch", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "alpha", name: "Alpha", description: "d" }]);
    await h.write("proj/a.md", "alpha");
    await h.run();

    // Ingesting b.md must not disturb a.md's contribution.
    h.t.topicsByUri.set("b.md", [{ key: "bravo", name: "Bravo", description: "d" }]);
    h.t.setReorganize(() => ({ actions: [] })); // fallback coins bravo by its key
    await h.write("proj/b.md", "bravo");
    await h.run();

    const tp = await h.topics();
    expect(tp.map((x) => x.key)).toEqual(["alpha", "bravo"]);
    expect(tp.find((x) => x.key === "alpha")?.references.map((r) => r.uri)).toEqual(["a.md#alpha"]);
  });

  it("drops references to declarations a re-ingest removed", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "old", name: "Old", description: "d" }]);
    await h.write("proj/a.md", "alpha");
    await h.run();
    expect((await h.topics()).map((x) => x.key)).toEqual(["old"]);

    // Re-ingest with changed content declaring a different topic key.
    h.t.topicsByUri.set("a.md", [{ key: "fresh", name: "Fresh", description: "d" }]);
    h.t.setReorganize(() => ({ actions: [] })); // fallback coins fresh
    await h.write("proj/a.md", "alpha v2");
    await h.run();

    const tp = await h.topics();
    expect(tp.map((x) => x.key)).toEqual(["fresh"]);
    expect(tp[0].references.map((r) => r.uri)).toEqual(["a.md#fresh"]);
  });
});
