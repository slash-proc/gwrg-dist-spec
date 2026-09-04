// End-to-end: serves a fixture dist/ tree over http and runs the real checker
// against it, including the failure cases. Run: node test/check.test.mjs
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { check } from "../site/check.js";

const HASH_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
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
      filename: "MineSweeper.bin", role: "binary", format: "gwhb",
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

// Two artifacts claiming role "binary".
const twoBinaries = manifest();
twoBinaries.targets[0].artifacts.push({
  filename: "other.bin", role: "binary", format: "gwhb",
  bytes: 0, sha256: HASH_EMPTY, url: "MineSweeper.bin",
});
set(index(), twoBinaries);
r = await check("owner/repo", opts);
expect("catches two binaries in one target",
  errorsOf(r).some((e) => e.includes('role "binary"')), errorsOf(r).join(" | "));

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

server.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
