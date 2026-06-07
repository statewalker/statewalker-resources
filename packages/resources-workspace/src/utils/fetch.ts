export async function* fetchData(
  url: string,
  params?: RequestInit | ((abort: () => void) => Promise<RequestInit>),
): AsyncGenerator<Uint8Array> {
  const res = await fetchWithAbort(url, params);
  yield* handleFetchResults(res);
}

export async function fetchWithAbort(
  url: string,
  params: RequestInit | ((abort: () => void) => Promise<RequestInit>) = {},
): Promise<Response & { abort?: () => void }> {
  const controller = new AbortController();
  const signal = controller.signal;
  const abort = () => controller.abort();
  if (typeof params === "function") {
    params = await params(abort);
  }
  const res = await fetch(url, { ...params, signal });
  (res as Response & { abort?: () => void }).abort = abort;
  return res as Response & { abort?: () => void };
}

export async function* handleFetchResults(
  res: Response & { abort?: () => void },
): AsyncGenerator<Uint8Array> {
  try {
    const body = res.body;
    if (!body) return;
    if (typeof (body as ReadableStream).getReader === "function") {
      // Browser
      const reader = (body as ReadableStream<Uint8Array>).getReader();
      let chunk: ReadableStreamReadResult<Uint8Array>;
      while ((chunk = await reader.read()) && !chunk.done) {
        yield chunk.value;
      }
    } else {
      yield* body as AsyncIterable<Uint8Array>;
    }
  } finally {
    if (typeof res.abort === "function") {
      res.abort();
    }
  }
}
