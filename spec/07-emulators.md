# Emulator cores

An emulator core is a homebrew manifest with `kind: "emulator"` and one
addition: `systems[]`, the launcher tabs the binary provides.

Everything else is unchanged. `project`, `title`, `source`, `artifacts`, hashes,
bundles, the mirror, the offline story — a core publishes exactly as a homebrew
does. If you have read [`03-manifest.md`](03-manifest.md) you already know most
of this document.

## Almost all of it is derived

The packed core carries `gnw_core_meta_t`, and inside it up to four
`gnw_core_system_t`. That struct is where `systems[]` comes from:

| Struct field | Manifest | |
|---|---|---|
| `dirname[16]` | `id` | the `roms/<id>/` folder |
| `system_name[32]` | `longName` | the console's name |
| `extensions[32]` | `extensions[]` | space-separated in the struct, a list here |
| `parse_type` | `browse` | `file` or `directory` |
| `cheat_ext[8]` | `cheatExt` | omitted when the struct's is empty |

Read these out of the binary at publish time, the same way `requiresAbi`
already is. Never write them by hand. The point is not convenience: it is that
the manifest and the firmware then cannot disagree about which folder a system
reads or which files it accepts.

Two fields in `systems[]` are **not** in the struct and must be declared:
`shortName`, and the grouping inside `extensions[]`. `bios[]` is declared
entirely — nothing in the binary mentions a BIOS.

Not carried at all: `segments[]` and the logo offsets. Those are load-time and
firmware concerns. An installer copies a file and needs its size, which it has.

`core_name` is the emulator's own name — `gpSP`, `Handy`, `lakesnes` — and is
*not* a console name. It is available; it is not the title. Somebody choosing
what to play is looking for "Game Boy Advance".

## Systems

| Field | Required | |
|---|---|---|
| `id` | yes | The `roms/<id>/` folder key |
| `longName` | yes | Plain string. The console's name in full |
| `shortName` | yes | Plain string. The abbreviation |
| `extensions` | yes | See below. At least one |
| `browse` | yes | `file` or `directory` |
| `compression` | yes | Boolean. See below |
| `cheatExt` | no | No leading dot: `ggcodes`, `pceplus`, `mcf` |
| `bios` | no | Files the user must supply that are not games |

`systems[]` is required when `kind` is `emulator` and forbidden when `kind` is
`homebrew`. A homebrew is one program; it has no launcher tab of its own.

### The names are not localised

`longName` and `shortName` are plain strings while every other display string
in this spec is a localised object. That is deliberate.

Console names differ by **region, not language**. A German and an English
speaker in Europe both say Mega Drive; an American says Genesis. Localisation is
keyed by language, so it cannot express that — and a language-keyed field would
invite somebody to file a regional answer under a linguistic key, which is a
wrong answer in a well-typed field. Whatever the binary declares is what ships.

`longName` is the colloquial long form, not the short name with a manufacturer
bolted on. Sometimes the maker is part of how people say it — *Sega Genesis*,
*Atari Lynx* — and sometimes it is not: nobody says *Nintendo Game Boy Advance*.
Where a console has nothing to abbreviate, both names are the same word. Repeat
it rather than inventing an abbreviation nobody uses.

### Extensions, and games made of several files

An entry is either an extension or a group of two or more:

```json
"extensions": [".md", ".gen", ".bin"]      // three spellings of one file
"extensions": [[".cue", ".bin"]]           // one game = a .cue and its tracks
"extensions": [".iso", [".cue", ".bin"]]   // both shapes, one list
```

**In a group the first entry is the file the launcher lists and the user picks;
the rest travel with it.** A group of one is refused: that is a plain string
written the long way, and two spellings of one thing is how a schema starts
drifting.

Grouping resolves an ambiguity that is already live: `.bin` is a whole Genesis
game in one system and a single CD track in another. A flat list cannot tell
those apart, and an installer that guesses wrong produces a card that fails on
device with nothing to explain it.

A group is a hint for a file picker, **not a filter to apply to a folder**. A
cue sheet names its own tracks and may reference `.wav` as well as `.bin`;
filtering a game folder against the group can silently drop a track.

### `browse`

Whether the launcher lists one entry per file or one per folder.

- `file` — the ordinary case. MSX multi-disk games share a folder, but each
  disk is its own entry.
- `directory` — a PC Engine CD folder *is* one game.

This is not the same fact as grouping, and both are needed. An installer that
recurses into `roms/pcecd/Ys/` looking for ROMs finds three `.bin` tracks and
offers three games.

### `compression`

Whether the core reads LZMA-compressed ROMs.

Today every system publishes `false`. `.lzma` appears in fourteen of the
firmware's extension lists, but `-DGNW_DISABLE_COMPRESSION` is unconditional on
SD builds and every decompression path is `#ifndef`-guarded with an `#error`.
The lists are a leftover from the flash build: on SD a `.lzma` file is listed in
the menu and then handed raw to the core.

The field earns its place by saying so. Without it an installer infers support
from an extension list that lies.

## BIOS

Files the user must supply that are not games. They are installed as they are —
nothing converts them — and they do not live beside the ROMs.

| Field | Required | |
|---|---|---|
| `id` | yes | Stable slug |
| `filename` | yes | A name, or a list of two or more accepted names |
| `required` | one of | Boolean |
| `requiredFor` | one of | Extensions that need it |
| `bytes` | no | Expected size |
| `sha1` | no | Expected hash |
| `strict` | no | Refuse a file that does not match `sha1` |
| `label` | yes | Localised |
| `description` | no | Localised. When it is needed, and what happens without |

Exactly one of `required` and `requiredFor` — never both, never neither.

`filename` is a list when one slot accepts several names: PC Engine CD takes
`syscard3.pce` or `syscard3.bin`, and they are one requirement, not two.

### Required by extension

`requiredFor` exists because a requirement is sometimes narrower than a system.
`disksys.rom` is mandatory for `.fds` disk images and irrelevant to `.nes`
cartridges and `.nsf` music — all three inside one system, because that is how
the firmware registers them.

Splitting the system in two would make the manifest disagree with the device
about which folder exists. Saying "required" would over-state it for everyone
who only has cartridges. So the requirement attaches to the extension, and every
extension in `requiredFor` must be one the system accepts.

### The host checks the hash

Publish `sha1` where it is known, and check it before writing the file.

The device frequently does not. ColecoVision is the case that settles it:
`coleco.bin` is required, and the core allocates its 8 KiB and calls
`odroid_sdcard_read_file` **ignoring the return value** — a missing or truncated
BIOS leaves uninitialised heap and boots into garbage with no error at all. The
firmware skips these checks because it runs on a slow machine; a browser has
cycles to spare, so the check belongs there. This is the same reasoning that put
[`strict`](03-manifest.md) in the host rather than the converter.

A `strict` slot with no `sha1` can never be filled, and is refused.

## Rules the schema does not state

Two rules are conditional, and [`site/validate.js`](../site/validate.js)
implements only the keywords the schemas use. `if`/`then` and `oneOf` are a lot
of machinery for two rules, so they are enforced by the conformance checker
instead:

- `systems[]` is required for `kind: "emulator"` and forbidden for
  `kind: "homebrew"`.
- exactly one of `required` and `requiredFor` on each BIOS entry.

The checker also refuses a `strict` BIOS with no hash, a `requiredFor` naming an
extension the system does not accept, and duplicate system ids within a target.

A third-party tool validating with a full JSON Schema implementation will accept
a document that breaks those two rules. Run the checker as well.

## The template gate

`retro-go-sd-templates` ships a Makefile that declares:

```
--system-name "Example Core" --dirname example --extensions "bin" --core-name "Example"
```

A generator **must refuse to publish** a core whose `core_name` is `Example` or
whose `dirname` is `example`. Ported projects overwrite those values; a project
that has not been ported yet still carries them, and publishing it mechanically
would put a phantom "Example Core" tab reading `roms/example/` in front of every
user.

Treat it the same way as a module that fails the verifier: not a warning, a
refusal.

## Worked example

Hashes and the commit are elided as `…`, the convention
[`03-manifest.md`](03-manifest.md) describes.

```json
{
  "schemaVersion": 1,
  "project": "pce",
  "title": "PCE-GO",
  "docs": "https://github.com/slash-proc/pce-go-retro-go-sd#readme",
  "source": { "repo": "slash-proc/pce-go-retro-go-sd", "commit": "…", "ref": "v0.1.0" },
  "tools": [],
  "targets": [
    {
      "id": "gnw-retro-go",
      "platform": "game-and-watch",
      "label": "Game & Watch (Retro-Go SD)",
      "kind": "emulator",
      "requiresAbi": { "version": 2, "minSize": 840 },
      "artifacts": [
        { "filename": "pce.bin", "bytes": 262144, "sha256": "…", "url": "pce.bin" }
      ],
      "symbols": [
        { "filename": "pce_core.elf", "bytes": 1184032, "sha256": "…",
          "url": "pce_core.elf" }
      ],
      "systems": [
        {
          "id": "pce",
          "longName": "PC Engine",
          "shortName": "PCE",
          "extensions": [".pce"],
          "browse": "file",
          "compression": false,
          "cheatExt": "pceplus"
        },
        {
          "id": "pcecd",
          "longName": "PC Engine CD",
          "shortName": "PCE CD",
          "extensions": [[".cue", ".bin"]],
          "browse": "directory",
          "compression": false,
          "cheatExt": "pceplus",
          "bios": [
            {
              "id": "syscard3",
              "filename": ["syscard3.pce", "syscard3.bin"],
              "required": true,
              "sha1": "79F5FF55DD10187C7FD7B8DAAB0B3FFBD1F56A2C",
              "strict": true,
              "label": { "en": "System Card 3" },
              "description": {
                "en": "Required. PC Engine CD games will not start without it."
              }
            }
          ]
        }
      ]
    }
  ]
}
```

One binary, two launcher tabs, one of which needs a file the other does not.
