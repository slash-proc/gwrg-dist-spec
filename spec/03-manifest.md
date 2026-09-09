# `manifest.json`

One version. What files it needs, where they come from, and what the user must
supply.

## Two origins for files

Every file in an install comes from one of two places:

- **artifacts** — the project compiled them and published them. Fetch and
  install.
- **tool outputs** — a converter produced them from a file the *user* supplied.
  The project cannot publish these; they are derived from the user's own ROM.

`targets[].artifacts[]` lists the first. `tools[]` describes the converters, and
`targets[].uses[]` says which ones this target needs.

**The install set is every artifact, plus the declared outputs of every tool in
`uses[]`.** There is no separate list. Nothing to keep in sync.

**`symbols[]` is the one published thing that is not installed.** It is fetched
and hashed like an artifact and it lands in `dist/<tag>/`, so an offline bundle
carries it — but it never reaches the card. Read the sentence above as exactly
what it says: the install set is artifacts plus tool outputs, and symbols are
neither.

The file the launcher starts is the one named `.bin`; the firmware finds it by
scanning for that extension, so the manifest does not label it. It may arrive
from either half: usually the project ships it as an artifact, but it may
instead be produced — a converter that takes the user's ROM and emits a
ready-to-run binary rather than a data file. A target whose whole install set
is produced therefore has an empty `artifacts`, which is why the array is
required but may be empty. What a target may not do is install nothing at all.

When the binary is produced, `requiresAbi` cannot be read from bytes at publish
time, because the bytes do not exist yet. Treat it as advisory: use it to filter
versions before a run, and check the real requirement against the produced file
itself, whose header carries it.

## Minimal example — no converter

This is a real published manifest, not an illustration. Fetch
<https://slash-proc.github.io/mine-sweeper-retro-go-sd/dist/v0.1.3/manifest.json>
and you get these bytes.

```json
{
  "schemaVersion": 1,
  "project": "minesweeper",
  "title": "Mine Sweeper",
  "docs": "https://github.com/slash-proc/mine-sweeper-retro-go-sd#readme",
  "source": {
    "repo": "slash-proc/mine-sweeper-retro-go-sd",
    "commit": "61019df2b15b1665d6e878a7c891a2ec9250475a",
    "ref": "v0.1.3"
  },
  "tools": [],
  "targets": [
    {
      "id": "gnw-retro-go",
      "platform": "game-and-watch",
      "label": "Game & Watch (Retro-Go SD)",
      "kind": "homebrew",
      "requiresAbi": { "version": 2, "minSize": 832 },
      "artifacts": [
        {
          "filename": "minesweeper.bin",
          "bytes": 34320,
          "sha256": "e0dfe0b187824a772cebcd48941018d78fc4f013f6cfca69e8377910799136df",
          "url": "minesweeper.bin"
        }
      ]
    }
  ]
}
```

`"tools": []` states that no conversion is needed. Write it explicitly. An
absent key is indistinguishable from a truncated file.

**The longer examples below elide hashes and commits as `…`.** They are
readable rather than runnable; that one is both. A `…` never appears in a real
manifest — every `sha256` is 64 hex characters and the schema enforces it.

## Full example — with a converter

```json
{
  "schemaVersion": 1,
  "project": "zelda3",
  "title": "The Legend of Zelda: A Link to the Past",
  "source": { "repo": "slash-proc/zelda3-retro-go-sd", "commit": "9225af8…", "ref": "v1.0.0" },

  "tools": [
    {
      "id": "zelda3-assets",
      "processor": { "type": "wasm", "version": 1 },
      "title": { "en": "Zelda 3 asset extraction" },
      "binary": {
        "file": "extractor.wasm",
        "url": "extractor.wasm",
        "bytes": 1842301,
        "sha256": "a41b7c…"
      },
      "limits": { "maxMemoryPages": 4096, "maxOutputBytes": 4194304 },
      "options": [],
      "inputs": [
        {
          "id": "base",
          "required": true,
          "allowMultiple": false,
          "label": { "en": "Zelda 3 ROM (USA)" },
          "extensions": [".sfc", ".smc"],
          "maxBytes": 4194304,
          "variants": [
            { "id": "us", "sha1": "6D4F10A8B10E10DBE624CB23CF03B88BB8252973",
              "bytes": 1048576 }
          ]
        },
        {
          "id": "language",
          "required": false,
          "allowMultiple": true,
          "label": { "en": "Translated ROM (optional)" },
          "extensions": [".sfc", ".smc"],
          "maxBytes": 4194304,
          "variants": [
            { "id": "de", "sha1": "2E62494967FB0AFDF5DA1635607F9641DF7C6559" },
            { "id": "fr", "sha1": "229364A1B92A05167CD38609B1AA98F7041987CC" }
          ]
        }
      ],
      "outputs": [
        { "id": "assets", "filename": "zelda3_assets.dat",
          "maxBytes": 4194304 }
      ]
    }
  ],

  "targets": [
    {
      "id": "gnw-retro-go",
      "platform": "game-and-watch",
      "label": "Game & Watch (Retro-Go SD)",
      "kind": "homebrew",
      "requiresAbi": { "version": 2, "minSize": 832 },
      "artifacts": [
        { "filename": "zelda3.bin",
          "bytes": 262144, "sha256": "…", "url": "zelda3.bin" },
        { "filename": "zelda3.ro",
          "bytes": 1048576, "sha256": "…", "url": "zelda3.ro" }
      ],
      "uses": [
        { "tool": "zelda3-assets", "outputs": ["assets"], "required": true }
      ]
    }
  ]
}
```

## Top level

| Field | Required | |
|---|---|---|
| `schemaVersion` | yes | Integer |
| `project` | yes | Matches `versions.json` |
| `title` | yes | Display name |
| `docs` | no | Absolute `https://` URL. Where a human reads about this project |
| `originalSystem` | no | The console this work came from. Homebrew only |
| `cover` | no | Full-size box art, published beside the manifest |
| `storage` | no | Which installs this works on: `["sd"]`, `["flash"]`, or both |
| `source` | yes | `repo`, `commit`, `ref` — what built this |
| `tools` | yes | Converters. `[]` when none |
| `targets` | yes | One per platform |

## What a filename may contain

Anything a FAT or exFAT card will hold, which is most things. Ruled out are the
characters those filesystems refuse — `" * / : < > ? \ |` — control
characters, a leading or trailing space or dot, and anything over 200
characters.

Everything else is allowed on purpose, because the names people actually use
carry punctuation: `Doom (Shareware).whd`, `Kirby's Adventure.whd`,
`Legend of Zelda, The - A Link to the Past (USA).whd`. A whitelist of letters,
digits and three symbols reads tidy in a schema and then rejects the No-Intro
and GoodTools conventions every variant name follows.

The exclusions are not stylistic. A separator would let a name escape its
directory, and the rest are what the destination filesystem cannot store.

## Provenance and cover art

A homebrew is a native program under `/homebrews/`, so nothing about where it
sits says which console it came from. A core has no such gap: a ROM lives
under `roms/<system>/` and its core declares `systems[]`. That difference is
the whole reason `originalSystem` exists.

`originalSystem` names the console the work originated on — `snes` for a Super
Mario World port, `pico8` for a PICO-8 game. It is a hint for anything that
wants to look the title up in the right art library rather than searching blind
by name, and it is equally useful for grouping or filtering. Use the same
identifiers `systems[].id` uses, but note the value space is wider: a homebrew
may come from a console no core emulates. Omit the field for an original work
written for the Game & Watch itself, which came from nowhere else.

Declaring it on a manifest with no `homebrew` target is a warning, not an
error — a core states its systems in `systems[]`.

| `cover` | Required | |
|---|---|---|
| `filename` | yes | Name of the file |
| `url` | yes | A plain filename, resolved beside this manifest |
| `bytes` | yes | Size |
| `sha256` | yes | Of the file |
| `width` | no | Pixels |
| `height` | no | Pixels |

`cover` is full-size box art — the source image, not the thumbnail. A packed
homebrew can already embed a cover in its GWHB header, but that one is bounded
by what the device can decode and cache: 186×100 and 10 KiB. A catalogue, a
web installer or a launcher on a larger screen wants better than that, and the
project usually has the original artwork sitting in its tree already.

The two do not compete. The embedded thumbnail is what the device shows; the
published cover is what everything else can use. A project may ship either,
both, or neither.

Prefer shipping art over relying on a lookup. Embedded or published, real
artwork is exact and needs no network round-trip, where scraping by name is a
guess that can return the wrong regional box art. `originalSystem` is the
fallback for projects that ship no art of their own.

Like every other published file, `cover.url` is a plain filename resolved
beside the manifest, and it is mirrored and hash-checked the same way. It is
never installed on the device.

## Space, and where it fits

A tool that installs things has two questions to answer, and they are not the
same question.

**Will it fit?** Add up what the install occupies. Every installed file is an
artifact with a `bytes`, so the fixed part of that sum is already exact and
needs no new field. The variable part is a converter's output, bounded by
`outputs[].maxBytes` — see below, because that bound has to be honest to be
worth anything.

**Will it work?** Space is not the only way an install fails. A project may
use the SD card directly, or may be built to sit in internal flash, and a
device that has the wrong one cannot run it however much room is free.
`storage` says which installs a project supports:

```json
"storage": ["sd"]
```

Absent means both. `["sd"]` means an SD-modded device only; `["flash"]` means
a flash-only install. This is a top-level statement about the project, not a
per-target one — a project that grew a second build for the other install mode
would publish two targets, and at that point the honest answer is to revisit
this field rather than to have it disagree with itself.

### Runtime working space

`runtime` states what a thing needs *while running*, over and above the files
it installs:

| Field | Required | |
|---|---|---|
| `savestateBytes` | no | One savestate |
| `saveBytes` | no | Save data — SRAM, a settings blob |

It sits on a target for a homebrew and on a system for a core, because a
savestate is the whole machine's state and an emulated machine differs per
system.

This exists for the flash-only case. On a device with no SD card the user has
to size a filesystem by hand, and getting it right means knowing how big a
savestate is — an internal number nobody should have to learn to install a
game.

**There is deliberately no total.** The manifest publishes the parts and an
installer adds up the ones that apply to what the user is actually installing.
A precomputed "minimum free space" would be a derived number that can disagree
with the fields it was derived from, and then nothing says which is right.

### Honest ceilings

`outputs[].maxBytes` is the largest a converter's output can be. It has two
readers: a host refusing an implausible run, and anything working out whether
the result will fit.

Those two want the same number, but only if it is a real bound. A ceiling set
to the wasm safety limit satisfies the first reader and is useless to the
second: a bound of 64 MiB on an output that is never above 1.2 MiB says
nothing at all. Compute it from what the converter can actually emit — a
baseline plus the worst case of whatever the user can add — and round up.

`limits.maxOutputBytes` stays the safety ceiling, and the two are allowed to
differ. That is the point: one is what the module is permitted to write, the
other is what it will ever want to.

## Targets

| Field | Required | |
|---|---|---|
| `id` | yes | Stable slug, e.g. `gnw-retro-go` |
| `platform` | yes | Device family |
| `label` | yes | Plain string. Not localised — platform names are proper nouns |
| `kind` | yes | `homebrew` or `core` |
| `requiresAbi` | yes | Firmware ABI needed. Advisory when the binary is produced |
| `artifacts` | yes | Compiled files. May be empty if the binary is produced |
| `uses` | no | Converters this target needs |
| `symbols` | no | Debug symbols. Published, never installed |
| `systems` | see below | Launcher tabs. Cores only |
| `dataDir` | no | Folder under the install directory this homebrew reads from |
| `runtime` | no | Working space this needs beyond its files |

`systems[]` is required when `kind` is `core` and forbidden when `kind` is
`homebrew` — see [cores](07-cores.md). A homebrew is one program
and has no launcher tab of its own.

### Symbols

| Field | Required | |
|---|---|---|
| `filename` | yes | Name of the file |
| `url` | yes | A plain filename, resolved beside this manifest |
| `bytes` | yes | Size |
| `sha256` | yes | Of the file |

An ELF lets a tool turn a crash address into a function and a line, which turns
"it froze" into a bug report somebody can act on. Every project already builds
one; without a manifest entry no tool can find it.

There is no `format`. The filename says what the file is, the same reason
artifacts carry none — should a linker map ever be published beside the ELF,
its extension distinguishes it.

It is per-binary, so it belongs to a target rather than the manifest root: the
symbols must describe the artifact delivered beside them. It is deliberately
outside the install set — a megabyte of debug information on the card helps
nobody.

### Placement

**A project does not say where its files go.** The Retro-Go version being
installed decides that, and the layout changes between firmware versions.

A project says only:

- `kind` — whether this is a homebrew or a core. The installer maps
  that to a directory.

Within that directory the firmware picks out the file the launcher starts by
its `.bin` extension. Everything else in the install set is installed
alongside it.

#### A homebrew that keeps its data in a folder

Most homebrew load their files from beside the binary. Some do not: OpenLara
reads `/homebrews/openlara/TITLE.PKD`, and the folder name is compiled into the
binary — `os.cpp` searches a fixed list of paths.

`dataDir` states that folder:

```json
{ "id": "gnw-retro-go", "kind": "homebrew", "dataDir": "openlara", ... }
```

It is a name, not a flag, because nothing can derive it. This project's
`CORE_NAME` is `openlara`, its `HB_NAME` is `OpenLara` and its binary is
`OpenLara.bin` — three spellings, and only one is what the firmware opens. A
boolean meaning "put it in a folder named after the project" would pick one of
the three and be right by luck on a case-insensitive card and wrong elsewhere.
This is the same lesson `biosDir` records: state the key that cannot be worked
out, and omit it when there is nothing to state.

The binary is placed as always — `dataDir` moves the *data*, never the
executable. A file may sit deeper still with `subdir`, relative to `dataDir`,
which is how cutscenes reach `/homebrews/openlara/fmv/` while levels stay in
`/homebrews/openlara/`.

`dataDir` is homebrew-only. A core's converted output is a game and goes to
`roms/<system id>/`, which its own `systems[]` already determines.

**A converter's output is placed by what it is, not by where the project
lives.** A homebrew's converted assets sit beside its binary, because that is
what the homebrew loads at run time. A core is different: what its converter
produces is a *game*, and games live where the launcher browses for them.

| The project is | Its converter's output installs to |
|---|---|
| `kind: homebrew` | beside the binary, as the rest of the install set |
| `kind: core` | `roms/<system id>/` |

Nothing declares this. A core already states its systems, and a `.whd` produced
from a WAD is a Doom ROM whether or not it arrived converted — so it belongs in
the same folder as one the user supplied ready-made, and the launcher lists
both without knowing which was which.

A core that declares one system needs to say nothing more. A core with several
must say which one a tool's output belongs to, in `uses[]`:

```json
"uses": [{ "tool": "doom-whd", "outputs": ["whd"], "required": true,
           "system": "doom" }]
```

Required only when the core declares more than one system, for the same reason
`biosDir` is only stated when it differs from the ROM folder: say the thing
that cannot be worked out, and nothing else.

An output extension may also be one the system accepts directly. Doom takes
`.whd` files, and a user who already has one installs it as a ROM with no
conversion at all — the converter is how you *get* one, not a toll on having
one.

### Artifacts

| Field | Required | |
|---|---|---|
| `filename` | yes | Name on the card. No path separators. Spaces allowed |
| `bytes` | yes | Size |
| `sha256` | yes | Of the file |
| `url` | yes | A plain filename, resolved beside this manifest |

### `uses`

| Field | Required | |
|---|---|---|
| `tool` | yes | A `tools[].id` |
| `outputs` | yes | Which of that tool's output ids this target installs |
| `required` | yes | False if the install works without it |

A target may use only some of a tool's outputs. A tool may be used by several
targets; its outputs are the same bytes regardless of platform, which is why
tools sit at the top level and not inside a target.

## Tools

| Field | Required | |
|---|---|---|
| `id` | yes | Referenced by `uses[].tool` |
| `processor` | yes | `type` and `version`. Currently `wasm` / `1` |
| `title` | yes | Localised object. `en` required |
| `binary` | yes | `file`, `url`, `bytes`, `sha256` |
| `limits` | yes | Ceilings the host enforces |
| `options` | no | User-settable flag bits |
| `inputs` | yes | What to ask the user for |
| `outputs` | yes | What a successful run produces |

`processor.type` and `processor.version` are separate so a future non-WASM
processor is a new type rather than a schema break.

`binary` groups the four fields a host must check **before** instantiating.

`limits.maxMemoryPages` and `limits.maxOutputBytes` bound what the module may
claim at runtime. A module chooses its own output lengths; these are the
ceilings a host rejects it against.

### Inputs

| Field | Required | |
|---|---|---|
| `id` | yes | Role name, e.g. `base`, `language` |
| `required` | yes | Boolean |
| `allowMultiple` | yes | May the user supply more than one file |
| `runPerFile` | no | Convert each file separately. Requires `allowMultiple` |
| `maxCount` | no | Ceiling on how many files this slot accepts |
| `label` | no | Localised. Omit when the title says enough |
| `description` | no | Localised. What this file is and where a user gets it |
| `extensions` | yes | For the file picker. A hint, never a check |
| `maxBytes` | yes | Reject larger files without running |
| `variants` | no | Known-good files: `id`, `sha1`, optional `bytes` |
| `strict` | no | Default `true`. Refuse a file matching no variant |

**Roles are resolved by the module from file content, never from order or from
a name the host supplies.** `inputs[]` exists so a UI can ask for the right
files and reject an obviously wrong one before spending a run. It is not how
the module learns what it was given.

#### `strict`

`variants[]` says which files an input recognises. `strict` says what to do
about a file that is none of them:

- `strict: true`, the default — refuse it. zelda3's `language` input is strict:
  an unrecognised translation is useless, because the converter would not know
  which language it was reading.
- `strict: false` — try it, and tell the user it was not recognised. smw's
  `base` input is not strict: a Lunar Magic hack cannot match a known hash by
  construction, so refusing every unrecognised ROM would refuse the whole point.

**The host decides this, not the module.** The host has the file, the hashes
and the user in front of it; it hashes, compares, and either refuses before
spending a run or warns and proceeds. A module is handed whatever survives that
and converts it.

That is why no flag is involved. An earlier draft had each project declare an
option bit meaning "accept a stranger", which put the decision in two places
and let a manifest and a module disagree about it. One boolean, enforced in one
place, cannot.

### One run, or one run per file

Two different things can be true of a slot that takes several files, and they
are not variants of each other:

- **`allowMultiple`** — the slot accepts more than one file. Zelda 3 takes a
  base ROM plus any number of translated ROMs, and they all feed **one** run
  that produces **one** asset pack.
- **`runPerFile`** — each file is converted **separately**, one run each. Doom
  takes a library of WADs and produces one `.whd` per WAD.

`runPerFile` requires `allowMultiple`; a slot that takes one file has nothing
to iterate. `maxCount` caps how many files the slot accepts, and a host checks
it *before* running rather than discovering it afterwards — unbounded runs are
the one genuinely open-ended thing in this model.

The axis lives on the input because the input is what multiplies. The number
of outputs follows from it and is not stated separately.

### Outputs

| Field | Required | |
|---|---|---|
| `id` | yes | Referenced by `uses[].outputs`, and what the module emits |
| `filename` | either | Fixed name on the card |
| `extension` | either | Name comes from the input, with this extension |
| `subdir` | no | Folder within `dataDir` this file goes in |
| `maxBytes` | yes | Ceiling, per produced file |
| `label` | no | Localised. A name for the file a user just produced |
| `description` | no | Localised. What it is for |

Exactly one of `filename` and `extension`. A converter that always produces the
same file names it; one that converts a library derives each name from the file
it converted. Presence carries the meaning, so there is no boolean:

```json
{ "id": "assets", "filename": "smw_assets.dat", "maxBytes": 16777216 }
{ "id": "whd",    "extension": ".whd",          "maxBytes": 25165824 }
```

**A module labels its outputs; the manifest and the host decide their names.**
The module emits an `id`, which is checked against this list. It has no say in
any filename — not even a proposed one — which is a smaller attack surface than
having the host defensively validate a name the module chose.

#### How a derived name is resolved

1. The matched variant's `filename`, when the input was recognised and declares
   one. This is how a known IWAD becomes `Doom II.whd` rather than `DOOM2.whd`.
2. Otherwise the input file's own name, stem kept, extension **replaced** with
   the output's declared `extension`. `MYHACK.WAD` becomes `MYHACK.whd`, never
   `MYHACK.WAD.whd`.

The extension is always the declared one. A user's file cannot bring its own
extension into the install set, which is what stops a WAD named `doom.bin`
landing where the core binary goes.

A publisher-declared name always wins: a derived name that collides with an
artifact, with a fixed output, or with another derived name is refused and
shown to the user. A name that sanitises to nothing usable is an error the
user resolves, never a silent fallback — there is no canned name, because two
files that collide would still collide under one.

## Rules the schema does not state

JSON Schema describes the shape of one field at a time. These are relationships
between fields, so [`site/check.js`](../site/check.js) enforces them instead —
and a third-party tool validating with a full JSON Schema implementation will
accept a document that breaks them.

- **No two installed files share a name.** The install set lands in one
  directory, so a collision means one file silently overwrites the other. The
  set spans `artifacts[]` and the tool outputs a target uses, and the two halves
  are written independently, which is exactly how a collision gets missed.
- **A target installs something.** An empty `artifacts` is legal only when a
  tool produces the binary.
- **`uses[]` names a tool that exists, and outputs it declares.**
- **Tool ids are unique**, since `uses[].tool` resolves by id.
- **`project` matches `versions.json`.** The index and the manifest are
  generated separately and must describe the same project.

[Cores](07-cores.md) add a few more of their own.

## Localisation

Localised fields are objects keyed by language code, with `en` always present.
A tool falls back to `en` for any locale it has no entry for.

Localised: `tools[].title`, `tools[].inputs[].label`,
`tools[].inputs[].description`, `tools[].inputs[].variants[].label`,
`tools[].options[].label`, `tools[].outputs[].label`,
`tools[].outputs[].description`, and on a core
`targets[].systems[].bios[].label` and `.description`.

A manifest carries this copy so that every installer says the same thing. An
input is a file the user has to go and find, and "Translated ROM" does not tell
them why they would want one; the project knows and a generic installer does
not. Leaving it out means each consumer invents its own wording, and the
project cannot correct it without waiting for that consumer to ship.

Not localised: platform labels, filenames, ids, and a system's `longName` and
`shortName` — console names differ by region rather than language, which
[cores](07-cores.md) explains.

## URLs

Every `url` is a plain filename — no scheme, no host, no path separators, no
`..`. It resolves beside the manifest that named it.

This is what lets the same manifest work unchanged from a website and from
[an offline bundle](06-bundle.md), and it stops a manifest sending an installer
to another origin.

`docs` is the one exception, and it is not a `url`: it is an absolute
`https://` link a UI may show a human, and never something an installer
fetches. Point it at the project's README. Documentation is a property of the
project, not of an individual file — nothing below the top level links out.

A filename may contain spaces, because the device does: a homebrew ships as
`Super Mario World.bin` and the launcher displays what it finds. It must still
begin and end with a non-space character, so a name cannot hide leading or
trailing whitespace that a card would silently keep. Resolving such a `url`
percent-encodes the space, which is what every URL parser already does; a zip
entry keeps it literal.
