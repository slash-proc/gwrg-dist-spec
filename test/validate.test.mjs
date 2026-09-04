// Checks the schemas against known-good and known-bad documents, and proves the
// validator rejects what it should. Run: node test/validate.test.mjs
import { readFileSync } from "node:fs";
import { validate } from "../site/validate.js";

const schema = (n) => JSON.parse(readFileSync(new URL(`../schema/${n}.schema.json`, import.meta.url)));
const manifestSchema = schema("manifest");
const versionsSchema = schema("versions");

const HASH = "a".repeat(64);
let failures = 0;

const expect = (name, errors, shouldPass) => {
  const ok = shouldPass ? errors.length === 0 : errors.length > 0;
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}`);
    for (const e of errors) console.error(`     ${e}`);
    if (shouldPass === false) console.error("     expected at least one error, got none");
  } else {
    console.log(`ok   ${name}`);
  }
};

const versions = {
  schemaVersion: 1,
  project: "minesweeper",
  title: "Minesweeper",
  repo: "slash-proc/mine-sweeper-retro-go-sd",
  releasesUrl: "https://github.com/slash-proc/mine-sweeper-retro-go-sd/releases",
  retained: 5,
  versions: [{
    tag: "v0.1.2",
    manifest: "v0.1.2/manifest.json",
    publishedAt: "2026-08-14T18:22:10Z",
    prerelease: false,
    kind: "homebrew",
    requiresAbi: { version: 2, minSize: 824 },
    needsUserFiles: false,
  }],
};

const minimal = {
  schemaVersion: 1,
  project: "minesweeper",
  title: "Minesweeper",
  source: { repo: "slash-proc/mine-sweeper-retro-go-sd", commit: "daf6c0f", ref: "v0.1.2" },
  tools: [],
  targets: [{
    id: "gnw-retro-go",
    platform: "game-and-watch",
    label: "Game & Watch (Retro-Go SD)",
    kind: "homebrew",
    requiresAbi: { version: 2, minSize: 824 },
    artifacts: [{
      filename: "MineSweeper.bin",
      bytes: 51328, sha256: HASH, url: "MineSweeper.bin",
    }],
  }],
};

const full = structuredClone(minimal);
full.project = "zelda3";
full.title = "The Legend of Zelda: A Link to the Past";
full.tools = [{
  id: "zelda3-assets",
  processor: { type: "wasm", version: 1 },
  title: { en: "Zelda 3 asset extraction", de: "Zelda 3 Ressourcen" },
  binary: { file: "extractor.wasm", url: "extractor.wasm", bytes: 1842301, sha256: HASH },
  limits: { maxMemoryPages: 4096, maxOutputBytes: 4194304 },
  options: [{ id: "noHashCheck", bit: 0, default: false, label: { en: "Accept a modified ROM" } }],
  inputs: [
    {
      id: "base", required: true, repeatable: false, label: { en: "Zelda 3 ROM (USA)" },
      extensions: [".sfc", ".smc"], maxBytes: 4194304,
      variants: [{ id: "us", sha1: "6D4F10A8B10E10DBE624CB23CF03B88BB8252973", bytes: 1048576 }],
    },
    {
      id: "language", required: false, repeatable: true, label: { en: "Translated ROM" },
      extensions: [".sfc"], maxBytes: 4194304,
      variants: [{ id: "de", sha1: "2E62494967FB0AFDF5DA1635607F9641DF7C6559" }],
    },
  ],
  outputs: [{ id: "assets", filename: "zelda3_assets.dat", maxBytes: 4194304 }],
}];
full.targets[0].artifacts.push({
  filename: "zelda3.ro",
  bytes: 1048576, sha256: HASH, url: "zelda3.ro",
});
full.targets[0].uses = [{ tool: "zelda3-assets", outputs: ["assets"], required: true }];

expect("versions.json", validate(versions, versionsSchema), true);

const withBundle = structuredClone(versions);
withBundle.versions[0].bundle = "minesweeper-v0.1.2-bundle.zip";
expect("versions.json with a bundle", validate(withBundle, versionsSchema), true);

const badBundle = structuredClone(versions);
badBundle.versions[0].bundle = "../evil-bundle.zip";
expect("rejects a traversing bundle name", validate(badBundle, versionsSchema), false);

const wrongSuffix = structuredClone(versions);
wrongSuffix.versions[0].bundle = "minesweeper-v0.1.2.zip";
expect("rejects a bundle without the -bundle suffix", validate(wrongSuffix, versionsSchema), false);

const upperBundle = structuredClone(versions);
upperBundle.versions[0].bundle = "MineSweeper-v0.1.2-bundle.zip";
expect("rejects an upper-case bundle name", validate(upperBundle, versionsSchema), false);
expect("manifest without a converter", validate(minimal, manifestSchema), true);
expect("manifest with a converter", validate(full, manifestSchema), true);

const bad = (name, mutate) => {
  const doc = structuredClone(minimal);
  mutate(doc);
  expect(name, validate(doc, manifestSchema), false);
};

bad("rejects an unknown kind", (d) => { d.targets[0].kind = "game"; });
bad("rejects a role field", (d) => { d.targets[0].artifacts[0].role = "binary"; });
bad("rejects a destination field", (d) => { d.targets[0].artifacts[0].destination = "/homebrews/"; });
bad("rejects a path in a filename", (d) => { d.targets[0].artifacts[0].filename = "../evil.bin"; });
bad("rejects a short sha256", (d) => { d.targets[0].artifacts[0].sha256 = "abc"; });
bad("rejects a missing tools key", (d) => { delete d.tools; });
bad("rejects a future schemaVersion", (d) => { d.schemaVersion = 2; });
bad("rejects a localised platform label", (d) => { d.targets[0].label = { en: "G&W" }; });
bad("rejects an absolute url", (d) => { d.targets[0].artifacts[0].url = "https://evil.example/x.bin"; });
bad("rejects a traversing url", (d) => { d.targets[0].artifacts[0].url = "../../x.bin"; });
bad("rejects a rooted url", (d) => { d.targets[0].artifacts[0].url = "/x.bin"; });
bad("rejects a subdirectory url", (d) => { d.targets[0].artifacts[0].url = "files/x.bin"; });

const toolUrl = structuredClone(full);
toolUrl.tools[0].binary.url = "https://evil.example/extractor.wasm";
expect("rejects an absolute tool binary url", validate(toolUrl, manifestSchema), false);

const noEn = structuredClone(full);
noEn.tools[0].title = { de: "Nur Deutsch" };
expect("rejects a localised object without en", validate(noEn, manifestSchema), false);

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
