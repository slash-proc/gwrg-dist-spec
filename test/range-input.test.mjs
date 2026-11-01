// Run: node test/range-input.test.mjs
import { readFileSync } from "node:fs";
import { validate } from "../site/validate.js";

const manifestSchema = JSON.parse(
  readFileSync(new URL("../schema/manifest.schema.json", import.meta.url)),
);
const processorSchema = manifestSchema.$defs.tool.properties.processor;
const check = (label, processor, expected) => {
  const errors = validate(processor, processorSchema, manifestSchema, "processor");
  const passed = expected ? errors.length === 0 : errors.length > 0;
  if (!passed) {
    console.error(`FAIL ${label}: ${errors.join("; ") || "unexpectedly accepted"}`);
    process.exitCode = 1;
  } else {
    console.log(`ok   ${label}`);
  }
};

check("legacy processor without extensions", { type: "wasm", version: 1 }, true);
check("range-input extension v1", {
  type: "wasm", version: 1, extensions: { "range-input": 1 },
}, true);
check("future extension version passes schema for host negotiation", {
  type: "wasm", version: 1, extensions: { "future-feature": 2 },
}, true);
check("extension version must be positive", {
  type: "wasm", version: 1, extensions: { "range-input": 0 },
}, false);
check("extension key must be a stable identifier", {
  type: "wasm", version: 1, extensions: { "Range Input": 1 },
}, false);
