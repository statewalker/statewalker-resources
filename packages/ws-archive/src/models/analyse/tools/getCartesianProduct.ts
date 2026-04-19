// See https://stackoverflow.com/a/55695103
export function getCartesianProduct<T = unknown>(arrays: T[][]): T[][] {
  let quant = 1; // Total quantity of possibilities
  const counters: number[] = [];

  // Counts total possibilities and build the counters Array;
  for (let i = 0; i < arrays.length; i++) {
    counters[i] = 0;
    quant *= arrays[i].length;
  }

  // Iterate all possibilities
  const retArr: T[][] = new Array<T[]>(arrays.length);
  for (let i = 0; i < arrays.length; i++) {
    retArr[i] = new Array<T>(quant);
  }

  for (let i = 0; i < quant; i++) {
    for (let j = 0; j < counters.length; j++) {
      if (counters[j] < arrays[j].length) {
        retArr[j][i] = arrays[j][counters[j]];
      } else {
        // In case there is no such an element it restarts the current counter
        counters[j] = 0;
        retArr[j][i] = arrays[j][counters[j]];
      }
      counters[j]++;
    }
  }
  return retArr;
}

// See https://stackoverflow.com/a/55695103
export function getCartesianProduct1<T = unknown>(arrays: T[][]): T[][] {
  let quant = 1; // Total quantity of possibilities
  const counters: number[] = [];
  const retArr: T[][] = [];

  // Counts total possibilities and build the counters Array;
  for (let i = 0; i < arrays.length; i++) {
    counters[i] = 0;
    quant *= arrays[i].length;
  }

  // Iterate all possibilities
  for (let i = 0; i < quant; i++) {
    const nRow: T[] = [];
    for (let j = 0; j < counters.length; j++) {
      if (counters[j] < arrays[j].length) {
        nRow.push(arrays[j][counters[j]]);
      } else {
        // In case there is no such an element it restarts the current counter
        counters[j] = 0;
        nRow.push(arrays[j][counters[j]]);
      }
      counters[j]++;
    }
    retArr.push(nRow);
  }
  return retArr;
}
