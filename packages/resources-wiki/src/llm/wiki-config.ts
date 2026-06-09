import type { Project } from "@statewalker/resources-workspace";

/**
 * The model *names* the wiki's indexing/search stages use. Every stage falls back
 * to `default` when its specific name is unset (see {@link WikiLlmConfiguration.modelFor}).
 * Names are resolved to runtime models by the generic `LlmProjectAdapter`.
 */
export interface StageModelNames {
  default: string;
  summarize?: string;
  meta?: string;
  graph?: string;
  reorganize?: string;
  query?: string;
  queryFast?: string;
  queryStrong?: string;
}

/** A wiki text-generation stage (any `StageModelNames` key except `default`). */
export type ModelStage = keyof Omit<StageModelNames, "default">;

export interface WikiLlmConfigOptions {
  /** Stage → model-name map for text-generation stages. */
  models: StageModelNames;
  /** Embedding model name (also part of the per-doc embeddings filename + index config). */
  embedModel: string;
  /** Embedding dimensionality. */
  dimensionality: number;
  /** Steers stage prompts (summariser detail, what counts as on-corpus, …). */
  corpusPurpose?: string;
}

/**
 * Wiki-specific model configuration, exposed as a project adapter: the policy for
 * which model each indexing/search stage uses (text stages + the embedding model
 * and dimensionality), plus the `corpusPurpose` knob. Pairs with the generic
 * `LlmProjectAdapter`, which turns these names into runtime models. (The per-run
 * `force` flag is a build-run option on the builders, not stable config.)
 */
export class WikiLlmConfiguration {
  private readonly cfg: WikiLlmConfigOptions;

  constructor(cfg: WikiLlmConfigOptions) {
    this.cfg = cfg;
  }

  /** Model name for a text-generation stage, falling back to `default`. */
  modelFor(stage: ModelStage): string {
    return this.cfg.models[stage] ?? this.cfg.models.default;
  }

  get embedModel(): string {
    return this.cfg.embedModel;
  }

  get dimensionality(): number {
    return this.cfg.dimensionality;
  }

  get corpusPurpose(): string | undefined {
    return this.cfg.corpusPurpose;
  }
}

/** Resolve the wiki model configuration from a project (mirrors `loggerOf`). */
export function wikiConfigOf(project: Project): WikiLlmConfiguration {
  return project.requireAdapter(WikiLlmConfiguration);
}
