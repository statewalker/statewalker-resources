import * as aq from "arquero";
import { DataSet } from "../DataSet.js";

export function transformKeysValuesToDataSet<K = number, V = number>({
  index,
  keyName,
  valueName,
  numbers = true,
}: {
  index: Record<K, V>;
  keyName: string;
  valueName: string;
  numbers?: boolean;
}) {
  const entriesList = Object.entries(index);
  const len = entriesList.length;
  const keysList = numbers ? new Uint32Array(len) : new Array(len);
  const valuesList = numbers ? new Uint32Array(len) : new Array(len);
  const columns = entriesList.reduce(
    (acc, [key, value], idx) => {
      acc[keyName][idx] = key;
      acc[valueName][idx] = value;
      return acc;
    },
    {
      [keyName]: keysList,
      [valueName]: valuesList,
    },
  );
  const table = aq.table(columns);
  const dataSet = new DataSet(table);
  return dataSet;
}
