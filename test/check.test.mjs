// End-to-end: serves a fixture dist/ tree over http and runs the real checker
// against it, including the failure cases. Run: node test/check.test.mjs
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { check } from "../site/check.js";

const HASH_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
// sha256 of a single zero byte, for fixtures whose schema forbids bytes: 0.
const HASH_ONE = "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";
const schemaDir = new URL("../schema/", import.meta.url);

const manifest = (over = {}) => ({
  schemaVersion: 1,
  project: "minesweeper",
  title: "Minesweeper",
  source: { repo: "slash-proc/mine-sweeper-retro-go-sd", commit: "daf6c0f", ref: "v0.1.2" },
  tools: [],
  targets: [{
    id: "gnw-retro-go", platform: "game-and-watch",
    label: "Game & Watch (Retro-Go SD)", kind: "homebrew",
    requiresAbi: { version: 2, minSize: 824 },
    artifacts: [{
      filename: "MineSweeper.bin",
      bytes: 0, sha256: HASH_EMPTY, url: "MineSweeper.bin",
    }],
  }],
  ...over,
});

const index = (over = {}) => ({
  schemaVersion: 1,
  project: "minesweeper",
  title: "Minesweeper",
  repo: "slash-proc/mine-sweeper-retro-go-sd",
  releasesUrl: "https://github.com/slash-proc/mine-sweeper-retro-go-sd/releases",
  retained: 5,
  versions: [{
    tag: "v0.1.2", manifest: "v0.1.2/manifest.json",
    publishedAt: "2026-08-14T18:22:10Z", prerelease: false,
    kind: "homebrew", requiresAbi: { version: 2, minSize: 824 },
    needsUserFiles: false,
  }],
  ...over,
});

let files = {};
const server = createServer((req, res) => {
  const path = req.url.split("?")[0];
  if (path.startsWith("/schema/")) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(readFileSync(new URL(path.slice("/schema/".length), schemaDir)));
  }
  const body = files[path];
  if (body === undefined) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "content-type": "application/octet-stream", "content-length": body.length });
  res.end(req.method === "HEAD" ? undefined : body);
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
const opts = { base: `${origin}/dist/`, schemaBase: `${origin}/schema/` };

let failures = 0;
const expect = (name, cond, detail) => {
  if (cond) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const set = (idx, man, extra = {}) => {
  files = {
    "/dist/versions.json": Buffer.from(JSON.stringify(idx)),
    "/dist/v0.1.2/manifest.json": Buffer.from(JSON.stringify(man)),
    "/dist/v0.1.2/MineSweeper.bin": Buffer.alloc(0),
    ...extra,
  };
};
const errorsOf = (r) => r.checks.filter((c) => c.level === "error").map((c) => `${c.label}: ${c.detail}`);

// Happy path, including a real sha256 verification of the (empty) binary.
set(index(), manifest());
let r = await check("https://github.com/slash-proc/mine-sweeper-retro-go-sd", { ...opts, hash: true });
expect("conformant fixture passes", r.summary.conformant, errorsOf(r).join(" | "));
expect("reports the target", r.versions[0].targets[0].id === "gnw-retro-go");

// A declared bundle that is not published.
set(index({ versions: [{ ...index().versions[0], bundle: "minesweeper-v0.1.2-bundle.zip" }] }), manifest());
r = await check("owner/repo", opts);
expect("catches a missing bundle",
  errorsOf(r).some((e) => e.includes("bundle")), errorsOf(r).join(" | "));

// A published bundle passes and is not warned about.
set(index({ versions: [{ ...index().versions[0], bundle: "minesweeper-v0.1.2-bundle.zip" }] }), manifest(),
    { "/dist/minesweeper-v0.1.2-bundle.zip": Buffer.from("PK\x05\x06" + "\0".repeat(18)) });
r = await check("owner/repo", opts);
expect("accepts a published bundle", r.summary.conformant, errorsOf(r).join(" | "));
expect("does not warn when a bundle exists",
  !r.checks.some((c) => c.level === "warn" && c.label.includes("bundle")));

// No dist site at all.
files = {};
r = await check("owner/repo", opts);
expect("missing versions.json is an error", !r.summary.conformant);

// Index and manifest disagree — the duplication in versions.json must be checked.
set(index({ versions: [{ ...index().versions[0], needsUserFiles: true }] }), manifest());
r = await check("owner/repo", opts);
expect("catches needsUserFiles disagreement",
  errorsOf(r).some((e) => e.includes("needsUserFiles")), errorsOf(r).join(" | "));

// A converter can produce the whole install set, so the target ships no
// artifacts. This is the patcher shape: the user's ROM goes in, a runnable
// binary comes out, and the project publishes nothing but the converter.
const produced = manifest();
produced.tools = [{
  id: "patcher",
  title: { en: "Build the binary" },
  processor: { type: "wasm", version: 1 },
  binary: { file: "patch.wasm", bytes: 1, sha256: HASH_ONE, url: "patch.wasm" },
  limits: { maxMemoryPages: 256, maxOutputBytes: 1048576 },
  inputs: [{
    id: "rom", required: true, allowMultiple: false,
    label: { en: "ROM" }, extensions: [".bin"], maxBytes: 1048576,
  }],
  outputs: [{ id: "bin", filename: "minesweeper.bin", maxBytes: 1048576 }],
}];
produced.targets[0].artifacts = [];
produced.targets[0].uses = [{ tool: "patcher", outputs: ["bin"], required: true }];
set(index({ versions: [{ ...index().versions[0], needsUserFiles: true }] }), produced,
  { "/dist/v0.1.2/patch.wasm": Buffer.alloc(1) });
r = await check("owner/repo", opts);
expect("a produced file satisfies a target with no artifacts",
  r.summary.conformant, errorsOf(r).join(" | "));

// ...but a target that installs nothing at all is still an error.
const installsNothing = manifest();
installsNothing.targets[0].artifacts = [];
delete installsNothing.targets[0].uses;
set(index(), installsNothing);
r = await check("owner/repo", opts);
expect("catches a target that installs nothing",
  errorsOf(r).some((e) => e.includes("installs nothing")), errorsOf(r).join(" | "));

// A declared file that is not published.
const missing = manifest();
missing.targets[0].artifacts[0].url = "nope.bin";
set(index(), missing);
r = await check("owner/repo", opts);
expect("catches an unreachable artifact",
  errorsOf(r).some((e) => e.includes("not reachable")), errorsOf(r).join(" | "));

// A gzipped response reports the compressed length; that is not a size mismatch.
{
  const gz = createServer((req, res) => {
    const path = req.url.split("?")[0];
    if (path.startsWith("/schema/")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(readFileSync(new URL(path.slice("/schema/".length), schemaDir)));
    }
    const b = files[path];
    if (b === undefined) { res.writeHead(404); return res.end("no"); }
    // Serve gzipped, as GitHub Pages does: content-length is then the
    // compressed length, which is not the file's size.
    const z = gzipSync(b);
    res.writeHead(200, { "content-encoding": "gzip", "content-length": String(z.length) });
    res.end(req.method === "HEAD" ? undefined : z);
  });
  await new Promise((r) => gz.listen(0, "127.0.0.1", r));
  const p = gz.address().port;
  set(index(), manifest());
  const rz = await check("owner/repo", {
    base: `http://127.0.0.1:${p}/dist/`, schemaBase: `http://127.0.0.1:${p}/schema/`,
  });
  expect("ignores content-length on a compressed response", rz.summary.conformant,
    errorsOf(rz).join(" | "));
  gz.close();
}

// Declared size does not match what is served.
const wrongSize = manifest();
wrongSize.targets[0].artifacts[0].bytes = 999;
set(index(), wrongSize);
r = await check("owner/repo", opts);
expect("catches a size mismatch",
  errorsOf(r).some((e) => e.includes("declared size")), errorsOf(r).join(" | "));

// Declared hash does not match the bytes.
const wrongHash = manifest();
wrongHash.targets[0].artifacts[0].sha256 = "b".repeat(64);
set(index(), wrongHash);
r = await check("owner/repo", { ...opts, hash: true });
expect("catches a hash mismatch",
  errorsOf(r).some((e) => e.includes("sha256")), errorsOf(r).join(" | "));

// Versions must be newest first, since versions[0] is the latest.
set(index({ versions: [
  { ...index().versions[0], tag: "v0.1.1", publishedAt: "2026-01-01T00:00:00Z" },
  { ...index().versions[0], tag: "v0.1.2", publishedAt: "2026-08-14T18:22:10Z" },
] }), manifest());
r = await check("owner/repo", opts);
expect("catches out-of-order versions",
  errorsOf(r).some((e) => e.includes("newest first")), errorsOf(r).join(" | "));

// --- core rules the schema cannot state -------------------------------
//
// These live in check.js because site/validate.js implements only the keywords
// the schemas use, and if/then plus oneOf is a lot of machinery for two rules.

const emuTarget = () => ({
  id: "gnw-retro-go", platform: "game-and-watch",
  label: "Game & Watch (Retro-Go SD)", kind: "core",
  requiresAbi: { version: 2, minSize: 840 },
  artifacts: [{ filename: "MineSweeper.bin", bytes: 0, sha256: HASH_EMPTY, url: "MineSweeper.bin" }],
  systems: [{
    id: "md", longName: "Sega Genesis", shortName: "Genesis",
    extensions: [".md", ".gen"], browse: "file", compression: false,
  }],
});
const emuIndex = () => index({ versions: [{ ...index().versions[0], kind: "core",
  requiresAbi: { version: 2, minSize: 840 } }] });

set(emuIndex(), manifest({ targets: [emuTarget()] }));
r = await check("owner/repo", opts);
expect("a conformant core passes", r.summary.conformant, errorsOf(r).join(" | "));

// kind says core, nothing says which systems.
const noSystems = emuTarget();
delete noSystems.systems;
set(emuIndex(), manifest({ targets: [noSystems] }));
r = await check("owner/repo", opts);
expect("catches a core with no systems",
  errorsOf(r).some((e) => e.includes("declares no systems")), errorsOf(r).join(" | "));

// systems[] belongs to a core; a homebrew is one program.
set(index(), manifest({ targets: [{ ...manifest().targets[0], systems: emuTarget().systems }] }));
r = await check("owner/repo", opts);
expect("catches a homebrew declaring systems",
  errorsOf(r).some((e) => e.includes("homebrew declares systems")), errorsOf(r).join(" | "));

// Exactly one of required / requiredFor.
const bothWays = emuTarget();
bothWays.systems[0].bios = [{
  id: "x", filename: "x.rom", required: true, requiredFor: [".md"], label: { en: "X" },
}];
set(emuIndex({}), manifest({ targets: [bothWays] }));
r = await check("owner/repo", opts);
expect("catches a BIOS stating its requirement twice",
  errorsOf(r).some((e) => e.includes("requirement twice")), errorsOf(r).join(" | "));

const neitherWay = emuTarget();
neitherWay.systems[0].bios = [{ id: "x", filename: "x.rom", label: { en: "X" } }];
set(emuIndex(), manifest({ targets: [neitherWay] }));
r = await check("owner/repo", opts);
expect("catches a BIOS stating no requirement at all",
  errorsOf(r).some((e) => e.includes("requirement twice or not at all")), errorsOf(r).join(" | "));

// A strict slot with no hash can never be filled.
const strictNoHash = emuTarget();
strictNoHash.systems[0].bios = [{
  id: "x", filename: "x.rom", required: true, strict: true, label: { en: "X" },
}];
set(emuIndex(), manifest({ targets: [strictNoHash] }));
r = await check("owner/repo", opts);
expect("catches a strict BIOS with no hash",
  errorsOf(r).some((e) => e.includes("strict with no hash")), errorsOf(r).join(" | "));

// requiredFor must name an extension the system actually accepts.
const unknownExt = emuTarget();
unknownExt.systems[0].bios = [{
  id: "x", filename: "x.rom", requiredFor: [".fds"], label: { en: "X" },
}];
set(emuIndex(), manifest({ targets: [unknownExt] }));
r = await check("owner/repo", opts);
expect("catches requiredFor naming an unaccepted extension",
  errorsOf(r).some((e) => e.includes("does not accept")), errorsOf(r).join(" | "));

// A required BIOS means the user must supply something, even with tools: [].
const withBios = emuTarget();
withBios.systems[0].bios = [{
  id: "x", filename: "x.rom", required: true, label: { en: "X" },
}];
set(emuIndex(), manifest({ targets: [withBios] }));
r = await check("owner/repo", opts);
expect("a required BIOS makes needsUserFiles true",
  errorsOf(r).some((e) => e.includes("needsUserFiles")), errorsOf(r).join(" | "));

// Symbols are fetched and verified like an artifact, but never installed.
const withSymbols = emuTarget();
withSymbols.symbols = [{
  filename: "core.elf", url: "core.elf", bytes: 1, sha256: HASH_ONE,
}];
set(emuIndex(), manifest({ targets: [withSymbols] }),
    { "/dist/v0.1.2/core.elf": Buffer.from([0]) });
r = await check("owner/repo", { ...opts, hash: true });
expect("verifies a published symbols file", r.summary.conformant, errorsOf(r).join(" | "));
expect("symbols are not part of the install set",
  !r.versions[0].targets[0].installed.includes("core.elf"),
  r.versions[0].targets[0].installed.join(", "));

const missingSymbols = emuTarget();
missingSymbols.symbols = [{
  filename: "core.elf", url: "core.elf", bytes: 1, sha256: HASH_ONE,
}];
set(emuIndex(), manifest({ targets: [missingSymbols] }));
r = await check("owner/repo", opts);
expect("catches an unpublished symbols file",
  errorsOf(r).some((e) => e.includes("core.elf")), errorsOf(r).join(" | "));

// A full-size cover is published beside the manifest and verified like any
// other declared file, but it is not installed on the device.
const COVER = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const coverHash = createHash("sha256").update(COVER).digest("hex");
set(index(), manifest({ cover: {
  filename: "cover.png", url: "cover.png", bytes: COVER.length,
  sha256: coverHash, width: 800, height: 600,
} }), { "/dist/v0.1.2/cover.png": COVER });
r = await check("owner/repo", { ...opts, hash: true });
expect("verifies a published cover", r.summary.conformant, errorsOf(r).join(" | "));
expect("the cover is not part of the install set",
  !r.versions[0].targets[0].installed.includes("cover.png"),
  r.versions[0].targets[0].installed.join(", "));

set(index(), manifest({ cover: {
  filename: "cover.png", url: "cover.png", bytes: COVER.length, sha256: coverHash,
} }));
r = await check("owner/repo", opts);
expect("catches an unpublished cover",
  errorsOf(r).some((e) => e.includes("cover.png")), errorsOf(r).join(" | "));

// Provenance belongs to a homebrew; a core says systems[] instead.
set(emuIndex(), manifest({ targets: [emuTarget()], originalSystem: "snes" }));
r = await check("owner/repo", opts);
expect("warns about originalSystem on a core-only manifest",
  r.checks.some((c) => c.level === "warn" && c.label.includes("originalSystem")),
  r.checks.map((c) => `${c.level}:${c.label}`).join(" | "));

// A BIOS the project ships is fetched and verified like any other named file,
// and asks nothing of the user.
const BIOSBYTES = Buffer.from([1, 2, 3, 4]);
const biosHash = createHash("sha256").update(BIOSBYTES).digest("hex");
const shipped = emuTarget();
shipped.systems[0].bios = [{
  id: "msx1", filename: "MSX.rom", required: true, label: { en: "MSX BIOS" },
  url: "MSX.rom", bytes: BIOSBYTES.length, sha256: biosHash,
}];
set({ ...emuIndex(), versions: emuIndex().versions.map((v) => ({ ...v, needsUserFiles: false })) },
    manifest({ targets: [shipped] }), { "/dist/v0.1.2/MSX.rom": BIOSBYTES });
r = await check("owner/repo", { ...opts, hash: true });
expect("a shipped BIOS is verified and needs nothing from the user",
  r.summary.conformant, errorsOf(r).join(" | "));

const missingBios = emuTarget();
missingBios.systems[0].bios = [{
  id: "msx1", filename: "MSX.rom", required: true, label: { en: "MSX BIOS" },
  url: "MSX.rom", bytes: 4, sha256: biosHash,
}];
set({ ...emuIndex(), versions: emuIndex().versions.map((v) => ({ ...v, needsUserFiles: false })) },
    manifest({ targets: [missingBios] }));
r = await check("owner/repo", opts);
expect("catches an unpublished BIOS the manifest claims to ship",
  errorsOf(r).some((e) => e.includes("MSX.rom")), errorsOf(r).join(" | "));

// Cross-field rules the schema cannot state.
const toolManifest = (mutate) => {
  const m = manifest();
  m.tools = [{
    id: "conv", processor: { type: "wasm", version: 1 }, title: { en: "Conv" },
    binary: { file: "c.wasm", url: "c.wasm", bytes: 1, sha256: HASH_ONE },
    limits: { maxMemoryPages: 1, maxOutputBytes: 1 },
    inputs: [{ id: "wad", required: true, allowMultiple: true, extensions: [".wad"], maxBytes: 1 }],
    outputs: [{ id: "whd", filename: "out.whd", maxBytes: 1 }],
  }];
  mutate(m.tools[0]);
  return m;
};

set(index(), toolManifest((t) => { t.inputs[0].allowMultiple = false; t.inputs[0].runPerFile = true; }));
r = await check("owner/repo", opts);
expect("catches runPerFile without allowMultiple",
  errorsOf(r).some((e) => e.includes("takes only one")), errorsOf(r).join(" | "));

set(index(), toolManifest((t) => {
  t.inputs[0].runPerFile = true;
  t.outputs[0] = { id: "whd", extension: ".whd", maxBytes: 1 };
}));
r = await check("owner/repo", opts);
expect("accepts a per-file converter with a derived name",
  !errorsOf(r).some((e) => e.includes("derives an output name")), errorsOf(r).join(" | "));

set(index(), toolManifest((t) => { t.outputs[0] = { id: "whd", extension: ".whd", maxBytes: 1 }; }));
r = await check("owner/repo", opts);
expect("catches a derived name with no per-file input",
  errorsOf(r).some((e) => e.includes("derives an output name")), errorsOf(r).join(" | "));

set(index(), toolManifest((t) => { t.inputs[0].runPerFile = true; }));
r = await check("owner/repo", opts);
expect("warns when every run would write the same filename",
  r.checks.some((c) => c.level === "warn" && c.label.includes("names every output itself")),
  r.checks.filter((c) => c.level === "warn").map((c) => c.label).join(" | "));

set(index(), toolManifest((t) => {
  t.inputs[0].runPerFile = true;
  t.outputs = [
    { id: "pkd", extension: ".pkd", maxBytes: 1 },
    { id: "title", filename: "TITLE.SCR", maxBytes: 1 },
  ];
}));
r = await check("owner/repo", opts);
expect("catches a per-file tool that also writes a fixed name",
  errorsOf(r).some((e) => e.includes("TITLE.SCR")), errorsOf(r).join(" | "));

set(index(), toolManifest((t) => {
  t.inputs[0].runPerFile = true;
  t.outputs = [{ id: "pkd", extension: ".pkd", maxBytes: 1 }];
}));
r = await check("owner/repo", opts);
expect("accepts a per-file tool whose outputs are all derived",
  !errorsOf(r).some((e) => e.includes("once per converted file")), errorsOf(r).join(" | "));

set(index(), toolManifest(() => {}));
r = await check("owner/repo", opts);
expect("accepts a one-run tool whose outputs are all fixed",
  !errorsOf(r).some((e) => e.includes("once per converted file")), errorsOf(r).join(" | "));

// A core with two systems must say which one a converter's output belongs to.
const twoSystems = emuTarget();
twoSystems.systems = [twoSystems.systems[0], { ...twoSystems.systems[0], id: "gbc" }];
twoSystems.uses = [{ tool: "conv", outputs: ["whd"], required: true }];
set(emuIndex(), manifest({ targets: [twoSystems] }));
r = await check("owner/repo", opts);
expect("catches a multi-system core not saying which system a tool feeds",
  errorsOf(r).some((e) => e.includes("which system")), errorsOf(r).join(" | "));

const badSystem = emuTarget();
badSystem.uses = [{ tool: "conv", outputs: ["whd"], required: true, system: "nope" }];
set(emuIndex(), manifest({ targets: [badSystem] }));
r = await check("owner/repo", opts);
expect("catches uses[].system naming a system the target lacks",
  errorsOf(r).some((e) => e.includes("does not declare")), errorsOf(r).join(" | "));

// FAT and exFAT case-fold, so two declared names differing only in case are
// one file once installed. We do not write to the card; we refuse to publish
// a manifest that could not survive being written.
const caseClash = manifest();
caseClash.targets[0].artifacts = [
  { filename: "MineSweeper.bin", bytes: 0, sha256: HASH_EMPTY, url: "MineSweeper.bin" },
  { filename: "minesweeper.bin", bytes: 1, sha256: HASH_ONE, url: "minesweeper.bin" },
];
set(index(), caseClash);
r = await check("owner/repo", opts);
expect("catches two artifacts that fold to one filename",
  errorsOf(r).some((e) => e.includes("differ only in case")), errorsOf(r).join(" | "));

// Different directories cannot collide, however alike the names are.
const sameNameElsewhere = emuTarget();
sameNameElsewhere.artifacts = [
  { filename: "core.bin", bytes: 0, sha256: HASH_EMPTY, url: "core.bin" },
];
sameNameElsewhere.systems[0].bios = [{
  id: "b", filename: "CORE.BIN", required: false, label: { en: "B" },
}];
set(emuIndex(), manifest({ targets: [sameNameElsewhere] }));
r = await check("owner/repo", opts);
expect("does not confuse two directories",
  !errorsOf(r).some((e) => e.includes("differ only in case")), errorsOf(r).join(" | "));

// Two derived outputs have no names here; they must not look like two files
// called `undefined`.
const twoDerived = manifest();
twoDerived.tools = [{
  id: "conv", processor: { type: "wasm", version: 1 }, title: { en: "Conv" },
  binary: { file: "c.wasm", url: "c.wasm", bytes: 1, sha256: HASH_ONE },
  limits: { maxMemoryPages: 1, maxOutputBytes: 1 },
  inputs: [{ id: "src", required: true, allowMultiple: true, runPerFile: true,
             extensions: [".wad"], maxBytes: 1 }],
  outputs: [{ id: "a", extension: ".whd", maxBytes: 1 },
            { id: "b", extension: ".dat", maxBytes: 1 }],
}];
twoDerived.targets[0].uses = [{ tool: "conv", outputs: ["a", "b"], required: true }];
set(index(), twoDerived);
r = await check("owner/repo", opts);
expect("two derived outputs are not a duplicate-name collision",
  !errorsOf(r).some((e) => e.includes("undefined") || e.includes("differ only in case")),
  errorsOf(r).join(" | "));

// A target whose only install is a derived output still installs something.
const derivedOnly = manifest();
derivedOnly.tools = twoDerived.tools;
derivedOnly.targets[0].artifacts = [];
derivedOnly.targets[0].uses = [{ tool: "conv", outputs: ["a"], required: true }];
set(index(), derivedOnly);
r = await check("owner/repo", opts);
expect("a derived output counts as installing something",
  !errorsOf(r).some((e) => e.includes("installs nothing")), errorsOf(r).join(" | "));

// dataDir belongs to a homebrew; a core's placement follows from systems[].
const coreDataDir = emuTarget();
coreDataDir.dataDir = "whatever";
set(emuIndex(), manifest({ targets: [coreDataDir] }));
r = await check("owner/repo", opts);
expect("catches dataDir on a core",
  errorsOf(r).some((e) => e.includes("dataDir on a core")), errorsOf(r).join(" | "));

// A subdir is relative to dataDir, so it needs one to be relative to.
const orphanSubdir = manifest();
orphanSubdir.tools = [{
  id: "conv", processor: { type: "wasm", version: 1 }, title: { en: "C" },
  binary: { file: "c.wasm", url: "c.wasm", bytes: 1, sha256: HASH_ONE },
  limits: { maxMemoryPages: 1, maxOutputBytes: 1 },
  inputs: [{ id: "src", required: true, allowMultiple: false, extensions: [".phd"], maxBytes: 1 }],
  outputs: [{ id: "fmv", filename: "CAFE.AVI", subdir: "fmv", maxBytes: 1 }],
}];
orphanSubdir.targets[0].uses = [{ tool: "conv", outputs: ["fmv"], required: false }];
set(index(), orphanSubdir);
r = await check("owner/repo", opts);
expect("catches a subdir with no dataDir",
  errorsOf(r).some((e) => e.includes("declares no dataDir")), errorsOf(r).join(" | "));

const withDataDir = structuredClone(orphanSubdir);
withDataDir.targets[0].dataDir = "openlara";
set(index(), withDataDir);
r = await check("owner/repo", opts);
expect("accepts a subdir under a dataDir",
  !errorsOf(r).some((e) => e.includes("dataDir")), errorsOf(r).join(" | "));

// An artifact executed in place out of memory-mapped flash. It is a published
// file like any other -- hashed, mirrored, counted in the install set -- and
// the checker only rules on what a manifest can get wrong about the address.
const xip = (mapped) => {
  const m = manifest();
  m.targets[0].artifacts.push({
    filename: "gba.xip", bytes: 1, sha256: HASH_ONE, url: "gba.xip", mapped,
  });
  return m;
};
const withXip = { "/dist/v0.1.2/gba.xip": Buffer.alloc(1) };

set(index(), xip({ base: 0xDEC00000 }), withXip);
r = await check("owner/repo", { ...opts, hash: true });
expect("a mapped artifact with a sentinel base passes", r.summary.conformant, errorsOf(r).join(" | "));
expect("a mapped artifact is still fetched and hashed",
  r.checks.some((c) => c.level === "ok" && c.label.includes("gba.xip") && c.detail.includes("1 bytes")));
expect("a mapped artifact counts in the install set",
  r.versions[0].targets[0].installed.includes("gba.xip"),
  JSON.stringify(r.versions[0].targets[0].installed));

set(index(), xip({}), withXip);
r = await check("owner/repo", opts);
expect("mapped with no base is fine", r.summary.conformant, errorsOf(r).join(" | "));

// A sentinel is meant to be an address no real pointer can hold. One that
// names a region the device actually has is probably a mistake, not a plan.
for (const [why, base] of [["internal flash", 0x08000000], ["SRAM", 0x24000000],
                           ["QSPI", 0x90100000]]) {
  set(index(), xip({ base }), withXip);
  r = await check("owner/repo", opts);
  expect(`warns about a base in ${why}`,
    r.checks.some((c) => c.level === "warn" && c.label.includes("really exists")) && r.summary.conformant,
    r.checks.filter((c) => c.level === "warn").map((c) => c.label).join(" | "));
}

// The window the relocation walks is [base, base + bytes), so it has to exist.
const big = Buffer.alloc(4096);
const overflow = manifest();
overflow.targets[0].artifacts.push({
  filename: "gba.xip", bytes: big.length, url: "gba.xip",
  sha256: createHash("sha256").update(big).digest("hex"),
  mapped: { base: 0xFFFFFF00 },
});
set(index(), overflow, { "/dist/v0.1.2/gba.xip": big });
r = await check("owner/repo", opts);
expect("catches a window that runs off the end of the address space",
  errorsOf(r).some((e) => e.includes("past the end")), errorsOf(r).join(" | "));

// Two names that fold together are one file on the card, mapped or not.
const xipClash = xip({ base: 0xDEC00000 });
xipClash.targets[0].artifacts.push({
  filename: "GBA.XIP", bytes: 1, sha256: HASH_ONE, url: "gba.xip", mapped: {},
});
set(index(), xipClash, withXip);
r = await check("owner/repo", opts);
expect("a mapped artifact still collides by name",
  errorsOf(r).some((e) => e.includes("differ only in case")), errorsOf(r).join(" | "));

server.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
