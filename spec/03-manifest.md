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

A target installs **exactly one binary**, and it may arrive from either half.
Usually the project ships it as an artifact with `role: "binary"`. It may
instead be produced, as a tool output with `role: "binary"` — a converter that
takes the user's ROM and emits a ready-to-run binary rather than a data file.
A target whose whole install set is produced therefore has an empty
`artifacts`, which is why the array is required but may be empty. What a target
may not do is install nothing at all.

When the binary is produced, `requiresAbi` cannot be read from bytes at publish
time, because the bytes do not exist yet. Treat it as advisory: use it to filter
versions before a run, and check the real requirement against the produced file
itself, whose header carries it.

## Minimal example — no converter

```json
{
  "schemaVersion": 1,
  "project": "minesweeper",
  "title": "Minesweeper",
  "source": {
    "repo": "slash-proc/mine-sweeper-retro-go-sd",
    "commit": "daf6c0f4e2b1a09c3d5f7e8a1b2c3d4e5f6a7b8c",
    "ref": "v0.1.2"
  },
  "tools": [],
  "targets": [
    {
      "id": "gnw-retro-go",
      "platform": "game-and-watch",
      "label": "Game & Watch (Retro-Go SD)",
      "kind": "homebrew",
      "requiresAbi": { "version": 2, "minSize": 824 },
      "artifacts": [
        {
          "filename": "minesweeper.bin",
          "role": "binary",
          "format": "gwhb",
          "bytes": 51328,
          "sha256": "9f2c1d…",
          "url": "minesweeper.bin"
        }
      ]
    }
  ]
}
```

`"tools": []` states that no conversion is needed. Write it explicitly. An
absent key is indistinguishable from a truncated file.

## Full example — with a converter

```json
{
  "schemaVersion": 1,
  "project": "zelda3",
  "title": "The Legend of Zelda: A Link to the Past",
  "source": { "repo": "slash-proc/zelda3", "commit": "9225af8…", "ref": "v1.0.0" },

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
      "options": [
        { "id": "noHashCheck", "bit": 0, "default": false,
          "label": { "en": "Accept a modified ROM" } }
      ],
      "inputs": [
        {
          "id": "base",
          "required": true,
          "repeatable": false,
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
          "repeatable": true,
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
        { "id": "assets", "filename": "zelda3_assets.dat", "role": "data",
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
      "requiresAbi": { "version": 2, "minSize": 824 },
      "artifacts": [
        { "filename": "zelda3.bin", "role": "binary", "format": "gwhb",
          "bytes": 262144, "sha256": "…", "url": "zelda3.bin" },
        { "filename": "zelda3.ro", "role": "data", "format": "raw",
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
| `source` | yes | `repo`, `commit`, `ref` — what built this |
| `tools` | yes | Converters. `[]` when none |
| `targets` | yes | One per platform |

## Targets

| Field | Required | |
|---|---|---|
| `id` | yes | Stable slug, e.g. `gnw-retro-go` |
| `platform` | yes | Device family |
| `label` | yes | Plain string. Not localised — platform names are proper nouns |
| `kind` | yes | `homebrew` or `emulator` |
| `requiresAbi` | yes | Firmware ABI needed. Advisory when the binary is produced |
| `artifacts` | yes | Compiled files. May be empty if the binary is produced |
| `uses` | no | Converters this target needs |

### Placement

**A project does not say where its files go.** The Retro-Go version being
installed decides that, and the layout changes between firmware versions.

A project says only:

- `kind` — whether this is a homebrew or an emulator core. The installer maps
  that to a directory.
- `role` — `binary` for the file the launcher starts, `data` for everything
  that must sit beside it.

Exactly one artifact per target has `role: "binary"`. `data` files are
installed alongside it.

### Artifacts

| Field | Required | |
|---|---|---|
| `filename` | yes | Name on the card. No path separators |
| `role` | yes | `binary` or `data` |
| `format` | yes | `gwhb`, `raw`, or `elf` |
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
| `repeatable` | yes | May the user supply more than one |
| `label` | no | Localised. Omit when the title says enough |
| `extensions` | yes | For the file picker. A hint, never a check |
| `maxBytes` | yes | Reject larger files without running |
| `variants` | no | Known-good files: `id`, `sha1`, optional `bytes` |
| `acceptsModified` | no | True if a non-matching file may still be tried |

**Roles are resolved by the module from file content, never from order or from
a name the host supplies.** `inputs[]` exists so a UI can ask for the right
files and reject an obviously wrong one before spending a run. It is not how
the module learns what it was given.

### Outputs

| Field | Required | |
|---|---|---|
| `id` | yes | Referenced by `uses[].outputs` |
| `filename` | yes | Name on the card |
| `role` | yes | `binary` or `data` |
| `maxBytes` | yes | Ceiling |

A module names its own outputs at runtime. Those names are checked against this
list. The manifest decides what a legitimate run produces; the module does not
get to name its own destination.

## Localisation

Localised fields are objects keyed by language code, with `en` always present.
A tool falls back to `en` for any locale it has no entry for.

Localised: `tools[].title`, `tools[].inputs[].label`,
`tools[].options[].label`.

Not localised: platform labels, filenames, ids.

## URLs

Every `url` is a plain filename — no scheme, no host, no path separators, no
`..`. It resolves beside the manifest that named it.

This is what lets the same manifest work unchanged from a website and from
[an offline bundle](06-bundle.md), and it stops a manifest sending an installer
to another origin.
