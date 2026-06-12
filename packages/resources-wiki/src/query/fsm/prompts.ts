/** System prompts for the query-FSM stages. Kept terse; schemas carry field-level detail. */

export const INTENT_DETECTION_PROMPT = `You triage a user prompt against an LLM-curated wiki, then
decompose it for retrieval.

Be RECALL-FIRST about scope. Downstream the prompt is searched by full-text AND semantic search over
the whole corpus, plus a topic-class ladder — so it is retrievable even when it names entities,
facts, or relationships that do NOT appear in the supplied topic/outlier vocabulary. Treat any prompt
asking for specific information — named people, organisations, places, instruments, products, dates,
figures, or the relationships between them — as ON-corpus, even when no listed class obviously
matches. The class vocabulary is a HINT, never a gate: do NOT reject a prompt merely because it does
not map to a class. Let the downstream search decide whether evidence actually exists.

Set onCorpus FALSE only when the prompt is not a retrieval request against this corpus at all — e.g. a
greeting or small talk, a creative-writing or coding task, arithmetic, or a question about a domain
plainly unrelated to the corpus with no searchable corpus term. Then give a one-line offCorpusReason
and return no subjects.

When on-corpus, decompose the prompt into its distinct SUBJECTS, each re-formulated as a standalone
search prompt. PRESERVE every specific term and named entity (proper nouns, organisations, people,
places, tickers) VERBATIM in the subject — these are the search terms that drive full-text retrieval;
never paraphrase them away. Align the surrounding wording with the corpus where natural, but keep the
named entities intact. A single-subject prompt yields exactly one subject. Do NOT answer the prompt.`;

export const TOPIC_SELECT_PROMPT = `You select the topic and outlier classes worth searching for a
subject. You receive the subject and the corpus's topic + outlier classes, each as
key/name/description with no documents attached. Return the KEY SLUGS — drawn verbatim from the
supplied lists — of every class plausibly relevant to the subject. Be EXHAUSTIVE: over-inclusion is
corrected by later grounding, but a class omitted here can never contribute. Populate outlierKeys for
questions about anomalies, exceptions, disagreements, or surprises, and include plainly-relevant
outliers otherwise. When nothing plausibly matches, return empty arrays. Selection only — do not
answer the subject.`;

export const SECTION_SELECT_PROMPT = `You filter candidate wiki sections for relevance to a prompt. You
receive the full original prompt and a batch of candidate sections grouped by their source document
(document title, then each section's URI, title, and summary). Return the URIs — verbatim — of the
sections that could plausibly contain facts that help answer the prompt. Be selective: a section's
title/summary must indicate it bears on the prompt; drop sections that are only tangentially related
or merely from a relevant document. Return an empty array when none in this batch qualify. Selection
only — do not answer the prompt.`;

export const SUMMARIZE_PROMPT = `You summarize wiki sections for a question. You receive the question
and a BATCH of sections, each presented in XML tags: <section_title> (carrying its [[marker]]),
<section_description> (a prior narrative summary), and <raw_content> (the section's original text).
Produce ONE dense summary containing ONLY facts relevant to the question, grounded in the
<raw_content> of these sections, and discarding content unrelated to the question. Carry every
[[<uri>#<section>]] marker for a section that contributes a fact. Do not answer the question — only
summarize.`;

export const COMPOSE_PROMPT = `Answer the question grounded ONLY in the supplied rolling summaries.
Each summary comes with a \`refs\` list — the section citations it is grounded in. Return the answer as
\`claims\`: an ordered list where each claim has a \`statement\` (a sentence or bullet; markdown such as
**bold** or a "- " prefix is fine) and a \`citations\` array. Each claim's \`citations\` MUST contain one
or more refs drawn VERBATIM from the \`refs\` of the summaries that claim rests on. Every claim must be
citable: if you cannot cite a statement from the supplied refs, OMIT that claim — never emit a claim
with an empty citations array, and never invent or alter refs. Then judge sufficiency: set
\`sufficient\` true if the summaries fully and confidently answer the question; set it false when key
information needed to answer is absent and name the missing piece in \`missing\` (this triggers a wider
evidence search; use null when sufficient).`;
