// This file was copied from the @uwdata/flechette (v2.0.0) library.
// See https://github.com/uwdata/flechette/blob/main/src/build/infer-type.js
// @license BSD 3-Clause License
// Copyright(c) 2024, UW Interactive Data Lab

import {
  type DataType,
  bool,
  dateDay,
  dictionary,
  field,
  fixedSizeList,
  float64,
  int8,
  int16,
  int32,
  int64,
  list,
  nullType,
  struct,
  timestamp,
  utf8,
} from "@uwdata/flechette";

const TypedArray = Object.getPrototypeOf(Int8Array);
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value) || value instanceof TypedArray;
}
// import { isArray } from "../util/arrays.js";

/**
 * Infer the data type for a given input array.
 * @param {(visitor: (value: any) => void) => void} visit
 *  A function that applies a callback to successive data values.
 * @returns   The data type.
 */
export function inferType<T = unknown>(
  visit: (visitor: (value: T) => void) => void,
  defaultType: (() => DataType) = null!,
): DataType {
  const profile = profiler();
  visit((value) => profile.add(value));
  const type = profile.type();
  return (defaultType !== null && type.typeId < 0) ? defaultType() : type;
}

function profiler<T = unknown>(): {
  add: (value: T) => void,
  type: () => DataType
} {
  let length = 0;
  let nullCount = 0;
  let boolCount = 0;
  let numberCount = 0;
  let intCount = 0;
  let bigintCount = 0;
  let dateCount = 0;
  let dayCount = 0;
  let stringCount = 0;
  let arrayCount = 0;
  let structCount = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let minLength = Number.POSITIVE_INFINITY;
  let maxLength = Number.NEGATIVE_INFINITY;
  let minBigInt: number | bigint | undefined;
  let maxBigInt: number | bigint | undefined;
  let arrayProfile: undefined | ReturnType<typeof profiler>;
  const structProfiles = {} as Record<keyof T, ReturnType<typeof profiler>>;

  return {
    add(value: T) {
      length++;
      if (value == null) {
        nullCount++;
        return;
      }
      switch (typeof value) {
        case "string":
          stringCount++;
          break;
        case "number":
          numberCount++;
          if (value < min) { min = value; }
          if (value > max) { max = value; }
          if (Number.isInteger(value)) { intCount++; }
          break;
        case "bigint":
          bigintCount++;
          if (minBigInt === undefined || maxBigInt === undefined) {
            minBigInt = value;
            maxBigInt = value;
          } else {
            if (value < minBigInt) { minBigInt = value; }
            if (value > maxBigInt) { maxBigInt = value; }
          }
          break;
        case "boolean":
          boolCount++;
          break;
        case "object":
          if (value instanceof Date) {
            dateCount++;
            // 1 day = 1000ms * 60s * 60min * 24hr = 86400000
            if (value.getTime() % 864e5 === 0) { dayCount++; }
          } else if (isArray(value)) {
            arrayCount++;
            const len = value.length;
            if (len < minLength) { minLength = len; }
            if (len > maxLength) { maxLength = len; }
            arrayProfile ??= profiler();
            value.forEach(arrayProfile.add);
          } else {
            structCount++;
            for (const key in value) {
              let fieldProfiler = structProfiles[key];
              if (!fieldProfiler) {
                fieldProfiler = profiler();
                structProfiles[key] = fieldProfiler;
              };
              fieldProfiler.add(value[key]);
            }
          }
      }
    },
    type(): DataType {
      const valid = length - nullCount;
      return valid === 0
        ? nullType()
        : intCount === valid
          ? intType(min, max)
          : numberCount === valid
            ? float64()
            : bigintCount === valid
              ? bigintType(minBigInt as bigint, maxBigInt as bigint)
              : boolCount === valid
                ? bool()
                : dayCount === valid
                  ? dateDay()
                  : dateCount === valid
                    ? timestamp()
                    : stringCount === valid
                      ? dictionary(utf8())
                      : arrayCount === valid
                        ? arrayType((arrayProfile as ReturnType<typeof profiler>).type(), minLength, maxLength)
                        : structCount === valid
                          ? struct(
                            Object.entries(structProfiles).map(([key, p]) =>
                              field(key, (p as ReturnType<typeof profiler>).type() as DataType),
                            ),
                          )
                          : unionType();
    },
  };
}

/**
 * Return a list or fixed list type.
type The child data type.
 * @param {number} minLength The minumum list length.
 * @param {number} maxLength The maximum list length.
 * @returns The data type.
 */
function arrayType(type: DataType, minLength: number, maxLength: number) {
  return maxLength === minLength ? fixedSizeList(type, minLength) : list(type);
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {import('../types.js').DataType}
 */
function intType(min, max) {
  const v = Math.max(Math.abs(min) - 1, max);
  return v < 1 << 7
    ? int8()
    : v < 1 << 15
      ? int16()
      : v < 2 ** 31
        ? int32()
        : float64();
}

/**
 * @param {bigint} min
 * @param {bigint} max
 * @returns {import('../types.js').IntType}
 */
function bigintType(min: bigint, max: bigint) {
  const v = -min > max ? -min - 1n : max;
  if (v >= 2 ** 63) {
    throw new Error(`BigInt exceeds 64 bits: ${v}`);
  }
  return int64();
}

/**
 * @returns {import('../types.js').UnionType}
 */
function unionType(): DataType {
  throw new Error("Mixed types detected, please define a union type.");
}
