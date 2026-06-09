/** System prompts for the query-FSM stages. Kept terse; schemas carry field-level detail. */

export const INTENT_DETECTION_PROMPT = `You triage a user prompt against an LLM-curated wiki.
First decide whether it is ON-corpus (concerns the wiki's domain, given the supplied topic and
outlier class vocabulary) or OFF-corpus. When on-corpus, decompose the prompt into its distinct
SUBJECTS and re-formulate each as a standalone, vault-aligned search prompt using the corpus's own
wording. A single-subject prompt yields exactly one subject. When off-corpus, set onCorpus false,
give a one-line offCorpusReason, and return no subjects. Do NOT answer the prompt.`;

export const TOPIC_SELECT_PROMPT = `You select the topic and outlier classes worth searching for a
subject. You receive the subject and the corpus's topic + outlier classes, each as
key/name/description with no documents attached. Return the KEY SLUGS — drawn verbatim from the
supplied lists — of every class plausibly relevant to the subject. Be EXHAUSTIVE: over-inclusion is
corrected by later grounding, but a class omitted here can never contribute. Populate outlierKeys for
questions about anomalies, exceptions, disagreements, or surprises, and include plainly-relevant
outliers otherwise. When nothing plausibly matches, return empty arrays. Selection only — do not
answer the subject.`;

export const DOC_TOPIC_SELECT_PROMPT = `You pre-filter candidate document-topics for a subject. Each
candidate is a per-document topic with a uri, name, description, and brief. Return the uris of the
candidates to KEEP. Be RECALL-FIRST: remove only the ones clearly non-relevant to the subject — when
in doubt, keep. Never return an empty list if any candidate is even plausibly relevant. Selection
only — do not answer the subject.`;

export const SUMMARIZE_PROMPT = `You maintain a rolling summary that serves a question. You receive
the question and one section presented in XML tags: <previous_summary> (the summary so far; absent on
the first section), <section_title>, <section_description> (a prior narrative summary), and
<raw_content> (the section's original text). Fold the new section into the previous summary: produce
ONE dense, fact-only summary that serves the question, grounded in <raw_content>, preserving every
fact already captured. Carry forward every [[<uri>#<section>]] marker you are given and add the
current section's marker when it contributes a fact. Do not answer the question — only summarize.`;

export const COMPOSE_PROMPT = `Answer the question grounded ONLY in the supplied rolling summaries.
Every claim MUST carry a [[wiki://<key>/<uri>#<sectionKey>]] citation to the summary content it rests
on, drawn from the [[...]] markers in the summaries. Do not invent citations. If the summaries do not
support an answer, say so plainly.`;
