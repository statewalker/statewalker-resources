#!/bin/bash
dir=`dirname $0`
currentDir=`pwd`
deno run --allow-read --allow-write --allow-net --import-map="${dir}/import_map.json" "${dir}/deno-test.ts" $@