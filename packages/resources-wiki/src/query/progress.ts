/** A retrieved section: its title + summary plus the corresponding original text block. */
export interface EvidenceSection {
  uri: string;
  sectionKey: string;
  title: string;
  summary: string;
  rawBlock: string;
}

/** A topic/outlier class the answer's evidence touched, with its covering citations. */
export interface AnswerTopic {
  key: string;
  name: string;
  description?: string;
  citations: { uri: string }[];
}

export interface Answer {
  text: string;
  citations: string[];
  caveats: string[];
  suggestions: string[];
  /** Topic classes covered by the retrieved evidence, cited to their sections. */
  topics: AnswerTopic[];
  /** Outlier classes covered by the retrieved evidence, cited to their sections. */
  outliers: AnswerTopic[];
  /** Number of evidence sections the answer was grounded in (0 = negative answer). */
  evidenceCount: number;
}

/** One recorded LLM call, for the end-of-run stats rollup. */
export interface LlmCallRecord {
  /** The query stage that issued it (e.g. "compose-answer"). */
  name: string;
  model: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
}

/** A query stage with wall-clock timing (started/elapsed), for the stats rollup. */
export interface StageRecord {
  name: string;
  status: "running" | "done" | "failed";
  startedAt: number;
  ms?: number;
}

/**
 * Observable query run: filled asynchronously as the FSM advances; await
 * `complete()` for the `Answer`. The FSM `load` instrumentation calls `stage`
 * on each mapped state; the terminal handlers call `_finish` / `_fail`.
 */
export class QueryProgress {
  stages: StageRecord[] = [];
  evidence: EvidenceSection[] = [];
  /** The answer text as it streams from the Respond stage (reset when the run escalates). */
  partialText = "";
  /** Every LLM call made during the run (drives the end-of-run per-model stats). */
  llmCalls: LlmCallRecord[] = [];
  /** Wall-clock start of the run, and total elapsed (set on finish/fail). */
  readonly startedAt = Date.now();
  totalMs = 0;
  answer?: Answer;
  error?: unknown;
  private resolvers: ((a: Answer) => void)[] = [];
  private rejecters: ((e: unknown) => void)[] = [];
  private listeners: (() => void)[] = [];

  /** Record one LLM call's model/latency/tokens for the stats rollup. */
  recordLlmCall(call: LlmCallRecord): void {
    this.llmCalls.push(call);
  }

  /** Subscribe to progress changes (each stage transition and terminal state). Returns an unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  private emit(): void {
    for (const l of this.listeners) l();
  }

  stage(name: string): void {
    this.stages.push({ name, status: "running", startedAt: Date.now() });
    this.emit();
  }
  /** Update the streaming answer text (or reset to "" when a run escalates). Notifies listeners. */
  setPartialText(text: string): void {
    this.partialText = text;
    this.emit();
  }
  /** Mark the current (last) stage `done` + record its elapsed time — called on state exit. */
  finishStage(): void {
    const last = this.stages[this.stages.length - 1];
    if (last && last.status === "running") {
      last.status = "done";
      last.ms = Date.now() - last.startedAt;
    }
    this.emit();
  }
  _finish(answer: Answer): void {
    this.answer = answer;
    const last = this.stages[this.stages.length - 1];
    if (last && last.status === "running") {
      last.status = "done";
      last.ms = Date.now() - last.startedAt;
    }
    this.totalMs = Date.now() - this.startedAt;
    this.emit();
    for (const r of this.resolvers) r(answer);
  }
  _fail(error: unknown): void {
    this.error = error;
    const last = this.stages[this.stages.length - 1];
    if (last && last.status === "running") {
      last.status = "failed";
      last.ms = Date.now() - last.startedAt;
    }
    this.totalMs = Date.now() - this.startedAt;
    this.emit();
    for (const r of this.rejecters) r(error);
  }
  complete(): Promise<Answer> {
    if (this.answer) return Promise.resolve(this.answer);
    if (this.error) return Promise.reject(this.error);
    return new Promise<Answer>((resolve, reject) => {
      this.resolvers.push(resolve);
      this.rejecters.push(reject);
    });
  }
}
