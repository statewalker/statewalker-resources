// import {
//   beforeEach,
//   describe,
//   it,
//   run
// } from "https://deno.land/x/deno_mocha/mod.ts";

// import "https://deno.land/x/deno_mocha/global.ts"
import "https://deno.land/x/deno_mocha/global.ts";
import 'https://deno.land/x/deno_mocha/mod.ts';

describe('Sample TS', () => {
  it('should run TypeScript', () => {
    console.log('Sample TypeScript ran!')
  })
})

import "./test/index.js";
// describe('Sample TS', async() => {
//   await import("./test/index.js");
//   afterAll(() => console.log('FUCK'));
// })



