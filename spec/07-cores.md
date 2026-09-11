# Cores

A core is a homebrew manifest with `kind: "core"` and one
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

`core_name` is the core's own name — `gpSP`, `Handy`, `lakesnes` — and is
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
| `biosDir` | no | BIOS folder key, when it is not `id` |
| `bios` | no | Files that are not games. Supplied by the user, or shipped |
| `games` | no | Games the project ships. See below |

`systems[]` is required when `kind` is `core` and forbidden when `kind` is
`homebrew`. A homebrew is one program; it has no launcher tab of its own.

### The BIOS folder is not always the ROM folder

`id` is the `roms/<id>/` key. BIOS files live under `bios/<key>/`, and the two
keys usually match — `nes` and `msx` use the same word for both. Two do not:

| System | ROM folder | BIOS folder |
|---|---|---|
| ColecoVision | `col` | `bios/coleco` |
| PC Engine CD | `pcecd` | `bios/pce` |

So a consumer cannot derive one from the other, and guessing `bios/<id>` puts
a ColecoVision BIOS somewhere nothing will look for it.

### Where a BIOS file goes

A BIOS file installs to:

```
/bios/<biosDir or id>/<filename>
```

Nothing declares that path. It is derived from two things the manifest already
states: that the entry is a `bios[]` entry, and the system's folder key. A
`bios[]` entry cannot install anywhere else, so a per-file destination would be
a field with one legal value — and `destination` was removed from artifacts for
exactly that reason.

So `syscard3.pce` on a system with `"id": "pcecd", "biosDir": "pce"` installs
to `/bios/pce/syscard3.pce`, and an MSX ROM on `"id": "msx"` installs to
`/bios/msx/MSX.rom`.

`biosDir` states the BIOS key when it differs. Omit it and the folder is `id`,
which is the common case and stays uncluttered:

```json
{
  "id": "pcecd",
  "biosDir": "pce",
  "bios": [ { "id": "syscard3", "filename": "syscard3.pce", "required": true } ]
}
```

### A project may ship a BIOS itself

Not every BIOS file is something the user has to find. blueMSX's ten MSX ROMs
are freely distributable and vendored in the core's own tree; asking a user to
supply them would send them hunting for files the project already has.

A `bios[]` entry that carries `url`, `bytes` and `sha256` **is published by
this project**, beside the manifest, mirrored and hash-checked like every other
named file. One without them is the user's to supply. That single distinction
replaces a "who provides this" flag, because the answer is simply whether a
file was published or not:

```json
{
  "id": "msx1",
  "filename": "MSX.rom",
  "required": true,
  "url": "MSX.rom",
  "bytes": 32768,
  "sha256": "…"
}
```

`url` may not appear without `bytes` and `sha256`: a published file with no
hash is a file a consumer cannot verify.

This also settles what `needsUserFiles` counts. A required BIOS the project
ships needs nothing from the user, so it does not make `needsUserFiles` true —
otherwise every MSX install would warn about files it was about to install
itself.

The PC Engine case shows why this is a per-system field rather than a per-file
one: `pce` and `pcecd` are two systems from one core, sharing one BIOS folder.
A path on each BIOS entry would repeat the same folder on every file and let
two files in the same system disagree.

### A project may ship a game itself

Some games are free to pass on. Doom's shareware episode has been
redistributable since 1993, and a Doom core that ships it is a core a user can
install and play without owning anything. The same is true of a demo disc, a
homebrew title, or a test cartridge a core's author wrote.

`games[]` is the ROM-folder counterpart of a shipped `bios[]`, and works the
same way: the file is published beside the manifest, mirrored, and hash-checked
like every other named file.

```json
{
  "id": "doom1-shareware",
  "filename": "Doom (Shareware).whd",
  "url": "Doom (Shareware).whd",
  "bytes": 3373180,
  "sha256": "…",
  "label": { "en": "Doom (shareware episode)" }
}
```

It installs to `roms/<system id>/` — the folder the launcher browses, never
`biosDir`. A game is a game; only BIOS files answer to that key.

Unlike `bios[]`, there is no unpublished form. `url`, `bytes` and `sha256` are
required, because an entry without them would describe a game the user already
has, and a game the user already has needs no manifest entry — they put it on
the card themselves. That is also why the generator refuses a declaration with
no file behind it, and a file with nothing declaring it.

**It does not make `needsUserFiles` false.** That flag answers "must the user
supply something to get what this project offers", and for Doom the answer
stays yes: the shareware episode is three of the nine episodes, and the
converter exists for the WADs a user owns. A shipped game widens what an
install does out of the box; it does not replace what the user brings. A core
whose shipped game really is the whole offering simply has no required tool
input and no user-supplied BIOS, so the flag is already false on its own.

Ship only what the licence allows. The spec cannot check this, and a
redistributable original does not make a converted derivative redistributable
— that depends on the licence, not on the conversion.

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

- `systems[]` is required for `kind: "core"` and forbidden for
  `kind: "homebrew"`.
- exactly one of `required` and `requiredFor` on each BIOS entry.

The checker also refuses a `strict` BIOS with no hash, a `requiredFor` naming an
extension the system does not accept, and duplicate system ids within a target.

A third-party tool validating with a full JSON Schema implementation will accept
a document that breaks those two rules. Run the checker as well.

## The build contract behind `mapped`

A core that ships part of itself as a `mapped` artifact — see
[`03-manifest.md`](03-manifest.md) — is asking a builder to relocate a blob by
scanning it for 32-bit words in the sentinel window. Nothing checks that the
blob can actually be relocated that way, and the failure is silent until the
device faults, so the requirement is worth stating.

**`relocBase`-style relocation works only if every reference to the sentinel
range exists in the blob as a whole 32-bit word.** A toolchain is free to materialise
an address as a MOVW/MOVT immediate pair instead, splitting it across two
instructions where sixteen bits live in each — and a word scan cannot see
either half. Such a blob passes every check, relocates cleanly as far as the
builder can tell, and then jumps to `0xDEC00000`.

The remedy is a build flag on the objects that go into the blob:
`-mword-relocations` on GCC, or whatever the equivalent is for another
toolchain. It costs a literal pool entry per address and buys the only property
the relocation pass depends on. A project that declares `relocBase` without it has
declared something untrue.

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
      "kind": "core",
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
