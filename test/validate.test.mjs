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
  options: [],
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

// The device ships homebrews with spaces in their names, so a filename carries
// them. Leading and trailing whitespace stays refused: a card keeps it and
// nothing downstream would show it.
const good = (name, mutate) => {
  const doc = structuredClone(minimal);
  mutate(doc);
  expect(name, validate(doc, manifestSchema), true);
};

good("accepts a space in a filename", (d) => {
  d.targets[0].artifacts[0].filename = "Super Mario World.bin";
  d.targets[0].artifacts[0].url = "Super Mario World.bin";
});
bad("rejects a leading space in a filename", (d) => { d.targets[0].artifacts[0].filename = " smw.bin"; });
bad("rejects a trailing space in a filename", (d) => { d.targets[0].artifacts[0].filename = "smw.bin "; });
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

const docs = structuredClone(minimal);
docs.docs = "https://github.com/slash-proc/mine-sweeper-retro-go-sd#readme";
expect("accepts a docs link", validate(docs, manifestSchema), true);

// `docs` is the only absolute URL a manifest may carry, and it is for a human
// to read, never for an installer to fetch. Anything that is not https is a
// scheme an installer might be tempted to follow.
bad("rejects a non-https docs link", (d) => { d.docs = "http://example.com/"; });
bad("rejects a docs filename", (d) => { d.docs = "README.md"; });

const strictOff = structuredClone(full);
strictOff.tools[0].inputs[0].strict = false;
expect("accepts strict on an input", validate(strictOff, manifestSchema), true);

// The field it replaced. A manifest still emitting it was written against the
// older draft and means the opposite of what its name now suggests, so it is
// refused rather than quietly ignored.
const oldFlag = structuredClone(full);
oldFlag.tools[0].inputs[0].acceptsModified = true;
expect("rejects the old acceptsModified field", validate(oldFlag, manifestSchema), false);

const strictWord = structuredClone(full);
strictWord.tools[0].inputs[0].strict = "yes";
expect("rejects a non-boolean strict", validate(strictWord, manifestSchema), false);

// A tool with no user-settable choices says so. smw is the first: once the
// hash bypass became `strict`, it had no options left.
const noOptions = structuredClone(full);
noOptions.tools[0].options = [];
expect("accepts a tool with no options", validate(noOptions, manifestSchema), true);

// Copy a project owns: an input a user must go and find needs explaining, and
// the explanation belongs with the project rather than in each installer.
const copy = structuredClone(full);
copy.tools[0].inputs[0].description = { en: "US (NTSC) cartridge dump." };
copy.tools[0].outputs[0].label = { en: "Asset pack" };
copy.tools[0].outputs[0].description = { en: "What the game reads at startup." };
expect("accepts localised input and output copy", validate(copy, manifestSchema), true);

const plainDesc = structuredClone(full);
plainDesc.tools[0].inputs[0].description = "just a string";
expect("rejects an unlocalised description", validate(plainDesc, manifestSchema), false);

const noEn = structuredClone(full);
noEn.tools[0].title = { de: "Nur Deutsch" };
expect("rejects a localised object without en", validate(noEn, manifestSchema), false);

// --- emulator cores ---------------------------------------------------------

const emulator = {
  schemaVersion: 1,
  project: "gwenesis",
  title: "Gwenesis",
  source: { repo: "slash-proc/gwenesis-retro-go-sd", commit: "daf6c0f", ref: "v0.0.2" },
  tools: [],
  targets: [{
    id: "gnw-retro-go",
    platform: "game-and-watch",
    label: "Game & Watch (Retro-Go SD)",
    kind: "emulator",
    requiresAbi: { version: 2, minSize: 840 },
    artifacts: [{ filename: "gwenesis.bin", bytes: 262144, sha256: HASH, url: "gwenesis.bin" }],
    symbols: [{
      filename: "gwenesis_core.elf", url: "gwenesis_core.elf",
      bytes: 1184032, sha256: HASH,
    }],
    systems: [{
      id: "md",
      longName: "Sega Genesis",
      shortName: "Genesis",
      extensions: [".md", ".gen", ".bin"],
      browse: "file",
      compression: false,
    }],
  }],
};
expect("emulator with one system", validate(emulator, manifestSchema), true);

// One binary, several launcher tabs, a grouped extension and a BIOS.
const multi = structuredClone(emulator);
multi.project = "pce";
multi.targets[0].systems = [
  {
    id: "pce", longName: "PC Engine", shortName: "PCE",
    extensions: [".pce"], browse: "file", compression: false, cheatExt: "pceplus",
  },
  {
    id: "pcecd", longName: "PC Engine CD", shortName: "PCE CD",
    extensions: [[".cue", ".bin"]], browse: "directory", compression: false,
    cheatExt: "pceplus",
    bios: [{
      id: "syscard3",
      filename: ["syscard3.pce", "syscard3.bin"],
      required: true,
      sha1: "79F5FF55DD10187C7FD7B8DAAB0B3FFBD1F56A2C",
      strict: true,
      label: { en: "System Card 3" },
      description: { en: "Required. CD games will not start without it." },
    }],
  },
];
expect("emulator with several systems, a group and a BIOS", validate(multi, manifestSchema), true);

// A BIOS that only some of the system's extensions need.
const byExt = structuredClone(emulator);
byExt.targets[0].systems[0].bios = [{
  id: "disksys", filename: "disksys.rom", requiredFor: [".fds"],
  bytes: 8192, sha1: "5".repeat(40), strict: true,
  label: { en: "Famicom Disk System BIOS" },
}];
expect("a BIOS required by extension", validate(byExt, manifestSchema), true);

// A homebrew has no systems, and that is the normal case.
expect("homebrew without systems", validate(minimal, manifestSchema), true);

const badEmu = (name, mutate) => {
  const doc = structuredClone(emulator);
  mutate(doc);
  expect(name, validate(doc, manifestSchema), false);
};

// A group of one is a string written the long way, and two spellings of one
// thing is how a schema starts drifting.
badEmu("rejects a one-element extension group",
  (d) => { d.targets[0].systems[0].extensions = [[".cue"]]; });
badEmu("rejects an extension without its dot",
  (d) => { d.targets[0].systems[0].extensions = ["md"]; });
badEmu("rejects an empty extension list",
  (d) => { d.targets[0].systems[0].extensions = []; });
// Console names are regional, not linguistic: a language-keyed object is the
// wrong mechanism and would invite a wrong answer in a well-typed field.
badEmu("rejects a localised longName",
  (d) => { d.targets[0].systems[0].longName = { en: "Sega Genesis" }; });
badEmu("rejects a cheatExt with a leading dot",
  (d) => { d.targets[0].systems[0].cheatExt = ".ggcodes"; });
badEmu("rejects an unknown browse mode",
  (d) => { d.targets[0].systems[0].browse = "cdrom"; });
badEmu("rejects a system without compression stated",
  (d) => { delete d.targets[0].systems[0].compression; });
badEmu("rejects a system id with a slash",
  (d) => { d.targets[0].systems[0].id = "roms/md"; });
badEmu("rejects an absolute symbols url",
  (d) => { d.targets[0].symbols[0].url = "https://evil.example/x.elf"; });
// The field is gone, not loosened: additionalProperties keeps it out, so a
// manifest still declaring the old `format: "elf"` is refused rather than
// silently accepted. See ad8cd61, which made the same call for artifacts.
badEmu("rejects a format field on symbols",
  (d) => { d.targets[0].symbols[0].format = "elf"; });
badEmu("rejects a BIOS filename list of one",
  (d) => {
    d.targets[0].systems[0].bios = [{
      id: "x", filename: ["only.rom"], required: true, label: { en: "X" },
    }];
  });
badEmu("rejects a BIOS with an unlocalised label",
  (d) => {
    d.targets[0].systems[0].bios = [{
      id: "x", filename: "x.rom", required: true, label: "X",
    }];
  });

// Provenance and full-size box art. Neither is installed; both are optional.
const COVER = {
  filename: "cover.png", url: "cover.png", bytes: 264091,
  sha256: "b".repeat(64), width: 800, height: 600,
};
good("accepts originalSystem", (d) => { d.originalSystem = "snes"; });
good("accepts a cover", (d) => { d.cover = structuredClone(COVER); });
good("accepts a cover without dimensions", (d) => {
  d.cover = structuredClone(COVER);
  delete d.cover.width;
  delete d.cover.height;
});
bad("rejects an originalSystem with a slash", (d) => { d.originalSystem = "roms/snes"; });
// Same rule as every other published file: a plain name resolved beside the
// manifest, never an origin the mirror does not control.
bad("rejects an absolute cover url", (d) => {
  d.cover = structuredClone(COVER);
  d.cover.url = "https://evil.example/cover.png";
});
bad("rejects a cover with no hash", (d) => {
  d.cover = structuredClone(COVER);
  delete d.cover.sha256;
});
bad("rejects an unknown field on a cover", (d) => {
  d.cover = structuredClone(COVER);
  d.cover.format = "png";
});

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
