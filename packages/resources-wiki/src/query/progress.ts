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

/**
 * Observable query run: filled asynchronously as the FSM advances; await
 * `complete()` for the `Answer`. The FSM `load` instrumentation calls `stage`
 * on each mapped state; the terminal handlers call `_finish` / `_fail`.
 */
export class QueryProgress {
  stages: { name: string; status: "running" | "done" | "failed" }[] = [];
  evidence: EvidenceSection[] = [];
  /** The answer text as it streams from the Respond stage (reset when the run escalates). */
  partialText = "";
  answer?: Answer;
  error?: unknown;
  private resolvers: ((a: Answer) => void)[] = [];
  private rejecters: ((e: unknown) => void)[] = [];
  private listeners: (() => void)[] = [];

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
    this.stages.push({ name, status: "running" });
    this.emit();
  }
  /** Update the streaming answer text (or reset to "" when a run escalates). Notifies listeners. */
  setPartialText(text: string): void {
    this.partialText = text;
    this.emit();
  }
  /** Mark the current (last) stage `done` — called by the `load` instrumentation on state exit. */
  finishStage(): void {
    const last = this.stages[this.stages.length - 1];
    if (last && last.status === "running") last.status = "done";
    this.emit();
  }
  _finish(answer: Answer): void {
    this.answer = answer;
    if (this.stages.length) this.stages[this.stages.length - 1].status = "done";
    this.emit();
    for (const r of this.resolvers) r(answer);
  }
  _fail(error: unknown): void {
    this.error = error;
    if (this.stages.length) this.stages[this.stages.length - 1].status = "failed";
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
