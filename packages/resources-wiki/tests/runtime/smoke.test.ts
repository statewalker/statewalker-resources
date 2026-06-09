import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbedFn } from "@statewalker/indexer-api";
import { type FilesApi, ResourceRepository, Workspace } from "@statewalker/resources-workspace";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { afterEach, describe, expect, it } from "vitest";
import {
  type DocumentGraphOutput,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  type LlmApi,
  registerWiki,
  WikiPageSummary,
  WikiQuery,
  WikiTopicIndex,
  wireWikiProject,
} from "../../src/index.js";
import { makeStubLlm } from "../util/stub-llm.js";

const DIM = 2;
const embed: EmbedFn = async (text) => {
  const v = new Float32Array(DIM);
  if (text.toLowerCase().includes("acme")) v[0] = 1;
  return v;
};

const SUMMARY: DocumentSummaryOutput = {
  title: "Acme",
  summary: "Acme overview.",
  sections: [
    { key: "intro", title: "Intro", startLine: 0, endLine: 0, summary: "Acme is a company." },
  ],
};
const META: DocumentMetaOutput = {
  topics: [
    {
      key: "companies",
      name: "Companies",
      description: "Business organisations.",
      sectionKeys: ["intro"],
      brief: "Acme.",
    },
  ],
  outliers: [],
};
const GRAPH: DocumentGraphOutput = {
  sections: [{ sectionKey: "intro", entities: [{ value: "Acme" }], statements: [], relations: [] }],
};
const MARKER_RE = /\[\[(wiki:\/\/[^\]]+)\]\]/g;

const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const out = (o: unknown) => ({ output: o as never, usage });
  switch (spec.name) {
    case "summarize-document":
      return out(SUMMARY);
    case "extract-document-meta":
      return out(META);
    case "extract-document-graph":
      return out(GRAPH);
    case "intent-detection":
      return out({
        onCorpus: true,
        subjects: [{ prompt: (spec.input as { question: string }).question }],
      });
    case "topic-select": {
      // Keep every available class (the corpus is tiny); grounding narrows later.
      const input = spec.input as {
        availableTopics: { key: string }[];
        availableOutliers: { key: string }[];
      };
      return out({
        topicKeys: input.availableTopics.map((t) => t.key),
        outlierKeys: input.availableOutliers.map((o) => o.key),
      });
    }
    case "section-select": {
      // Keep every candidate section in the batch.
      const docs = (spec.input as { documents: { sections: { uri: string }[] }[] }).documents;
      return out({ relevantUris: docs.flatMap((d) => d.sections.map((s) => s.uri)) });
    }
    case "summarize-batch": {
      // Carry every marker in the batch into the summary so citations propagate.
      const sections = (spec.input as { sections: string }).sections;
      const markers = [...sections.matchAll(MARKER_RE)].map((m) => m[0]).join(" ");
      return out({ text: `Acme is a company. ${markers}`.trim() });
    }
    case "compose-answer": {
      // One grounded claim per marker the rolling summaries carried.
      const text = (spec.input as { summaries: { text: string }[] }).summaries
        .map((s) => s.text)
        .join(" ");
      const claims = [...text.matchAll(MARKER_RE)].map((m) => ({
        statement: "Acme is a company.",
        citations: [m[1]],
      }));
      return out({ claims, suggestions: [], sufficient: true, missing: null });
    }
    default:
      throw new Error(`unexpected ${spec.name}`);
  }
};

const llm = makeStubLlm({ generateObject, embed });

async function writeFile(filesApi: FilesApi, path: string, text: string): Promise<void> {
  await filesApi.write(
    path,
    (async function* () {
      yield new TextEncoder().encode(text);
    })(),
  );
}

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop() as string, { recursive: true, force: true });
});

async function makeFilesApi(kind: "mem" | "node"): Promise<FilesApi> {
  if (kind === "mem") return new MemFilesApi();
  const dir = await mkdtemp(join(tmpdir(), "wiki-smoke-"));
  tmpDirs.push(dir);
  return new NodeFilesApi({ rootDir: dir });
}

describe.each(["mem", "node"] as const)("registerWiki end-to-end (%s FilesApi)", (kind) => {
  it("scans a project into a queryable wiki", async () => {
    const filesApi = await makeFilesApi(kind);
    const repository = new ResourceRepository({ filesApi });
    registerWiki(repository, {
      llm,
      models: { default: "fixture-model" },
      embedModel: "fixture",
      dimensionality: DIM,
    });

    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("proj", true);
    if (!project) throw new Error("no project");
    await writeFile(filesApi, "proj/a.md", "Acme is a company.");

    const builder = wireWikiProject(project);
    for await (const _ of builder.run()) {
      // drain
    }

    // The page was summarized and the global topic index aggregated.
    const resource = await project.getProjectResource("a.md");
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    expect(summary?.title).toBe("Acme");
    const topic = await project.requireAdapter(WikiTopicIndex).get("companies");
    expect(topic?.references.map((r) => r.uri)).toEqual(["a.md#companies"]);

    // Status reports no pending work after a full scan.
    const status = await builder.status();
    expect(status.builders.every((b) => b.pending === 0)).toBe(true);

    // A query returns a grounded, cited answer.
    const answer = await project.requireAdapter(WikiQuery).ask("What is Acme?").complete();
    expect(answer.text).toMatch(/\[\[wiki:\/\/proj\/a\.md#intro\]\]/);
    expect(answer.evidenceCount).toBeGreaterThan(0);
  });
});
