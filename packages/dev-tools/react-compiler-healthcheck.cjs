#!/usr/bin/env node
/**
 * pnpm + Node 22+ can resolve `require("yargs/yargs")` inside the healthcheck CJS bundle
 * to yargs's ESM subpath. Redirect to the CJS entry before loading CLI.
 */
const Module = require("node:module");
const path = require("node:path");

const healthcheckRoot = path.dirname(require.resolve("react-compiler-healthcheck/package.json"));
const yargsCjs = require.resolve("yargs", { paths: [healthcheckRoot] });
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "yargs" || request === "yargs/yargs") {
    return yargsCjs;
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};

process.argv = [
  process.argv[0],
  path.join(healthcheckRoot, "dist/index.js"),
  "--src",
  "../../apps/web-app/app/**/*.{ts,tsx}",
];

require("react-compiler-healthcheck/dist/index.js");
