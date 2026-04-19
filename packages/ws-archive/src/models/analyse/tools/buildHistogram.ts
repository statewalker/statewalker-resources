export function buildHistogram({
  full,
  selected,
  length,
  numBins,
}: {
  full: (idx: number) => number;
  selected: (idx: number) => boolean;
  length: number;
  numBins: number;
}) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < length; i++) {
    const value = full(i);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const fullHistogram = new Uint32Array(numBins);
  const selectedHistogram = new Uint32Array(numBins);
  [min, max] = [Math.min(min, max), Math.max(min, max)];
  const k = (numBins - 1) / (max - min);
  for (let i = 0; i < length; i++) {
    const score = full(i);
    const bin = Math.floor((score - min) * k);
    fullHistogram[bin]++;
    if (selected(i)) {
      selectedHistogram[bin]++;
    }
  }
  return {
    min,
    max,
    data: fullHistogram,
    selected: selectedHistogram,
  };
}
