export function newUpdatesTracker<D = unknown, R = D, K = D>({
  onEnter = ([data]) => data as unknown as R,
  onUpdate = ([data]) => data as unknown as R,
  onExit = () => void 0,
  getKey = (v: D) => v as unknown as K,
}: {
  onEnter?: (params: [data: D, index: number]) => R;
  onUpdate?: (
    params: [data: D, index: number],
    prevResult: R,
    prevParams: [data: D, index: number],
  ) => R;
  onExit?: (params: [data: D, index: number], result: R) => void;
  getKey?: (data: D) => K;
} = {}): (values: D[]) => R[] {
  let slotsIndex = new Map();
  return (values: D[] = []) => {
    const newSlotsIndex = new Map<
      K,
      [data: D, index: number] & { result: R }
    >();
    const resultingValues: R[] = [];
    for (const data of values) {
      const key = getKey(data);
      const slot = slotsIndex.get(key);
      const idx = resultingValues.length;
      const nextSlot = [data, idx] as [data: D, index: number] & { result: R };
      nextSlot.result = slot
        ? (onUpdate(nextSlot, slot.result, slot) ?? slot.result)
        : onEnter(nextSlot);
      slotsIndex.delete(key);
      newSlotsIndex.set(key, nextSlot);
      resultingValues.push(nextSlot.result);
    }
    for (const slotToExit of slotsIndex.values()) {
      onExit(slotToExit, slotToExit.result);
    }
    slotsIndex = newSlotsIndex;
    return resultingValues;
  };
}
