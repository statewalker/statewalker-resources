export async function* fetchData(url, params) {
  const res = await fetchWithAbort(url, params);
  yield* handleFetchResults(res);
}

export async function fetchWithAbort(url, params = {}) {
  const controller = new AbortController();
  const signal = controller.signal;
  const abort = () => (controller.abort(), {});
  if (typeof params === 'function')
    params = await params(abort);
  const res = await fetch(url, { ...params, signal });
  res.abort = abort;
  return res;
}

export async function* handleFetchResults(res) {
  try {
    const body = res.body;
    if (typeof body.getReader === 'function') { // Browser
      const reader = body.getReader();
      let chunk;
      while ((chunk = await reader.read()) && !chunk.done) {
        yield chunk.value;
      }
    } else {
      yield* body;
    }
  } finally {
    if (typeof res.abort === 'function')
      res.abort();
  }
}
