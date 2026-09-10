# GWRG distribution spec

How a project publishes a Game & Watch Retro-Go homebrew or core so a
web tool can install it from nothing but the repo URL.

A user pastes `https://github.com/owner/repo`. The tool reads one file, learns
what versions exist, what files they need, and whether the user must supply a
ROM. It then fetches the files, runs any conversion in the browser, and writes
an SD card. No coordination with the tool's authors is required.

## The pieces

| Piece | What it is |
|---|---|
| [Distribution](spec/01-distribution.md) | Where files live and how a tool finds them |
| [`versions.json`](spec/02-versions.md) | The index. One fetch, all versions |
| [`manifest.json`](spec/03-manifest.md) | One version: its files and its converter |
| [Processor ABI](spec/04-processor.md) | How a converter is called |
| [Offline bundles](spec/06-bundle.md) | Installing without a network |
| [Cores](spec/07-cores.md) | The systems a core provides |

Tool authors also read [host requirements](spec/05-host.md), which are
mandatory, not advisory.

## Minimum conforming project

A homebrew with no proprietary assets publishes three files:

```
dist/versions.json
dist/v1.0.0/manifest.json
dist/v1.0.0/game.bin
```

That is a complete implementation. Converters are only needed when the user
must supply their own ROM.

A core publishes the same three, and its manifest adds `systems[]` —
the launcher tabs the binary provides, read out of the packed core rather than
written by hand. See [cores](spec/07-cores.md).

## Conformance checker

<https://slash-proc.github.io/gwrg-dist-spec/> takes a repository URL and reports
what the project publishes and whether it conforms.

It is a static page. It fetches the project's `dist/` tree from the browser, so
it exercises exactly the path a real installer takes — a project that passes
there is readable by any web tool.

```
site/validate.js   JSON Schema validator, no dependencies
site/check.js      the checks themselves; runs in a browser and under node
test/              schema fixtures and an end-to-end run against a local tree
```

Both files are meant to be copied. `check(repo, { base, schemaBase })` runs
outside a browser, so a project can gate its own release on conformance:

```bash
node test/validate.test.mjs
node test/check.test.mjs
```

## Versioning

`schemaVersion` appears at the top of `versions.json` and `manifest.json`. It
is a single integer covering both files and the processor ABI, because they
change together. A tool that does not implement a version refuses it.

Current version: **1**.

While the spec is a draft it moves faster than the projects that implement it,
and the two are deployed separately. **Deploy a spec change before a project
publishes a manifest that uses it.** The conformance checker validates against
the schema hosted here, so a project that ships a new field first is reported
as broken until this site catches up. The reverse case is handled: a mirror
drops a release whose manifest no longer validates, rather than failing the
whole project over an old version.

## Status

Draft. The spec is written alongside its implementations, and every field in it
exists because a real project needed it.

Twenty-four projects publish under it today — seven homebrew and seventeen
cores. The newest release of every one is conformant against the checker;
releases superseded by a later one keep whatever the spec said when they were
cut, and are knowingly left that way.

**Homebrew**

| Project | Version | What it exercises |
|---|---|---|
| [mine-sweeper](https://github.com/slash-proc/mine-sweeper-retro-go-sd) | v0.2.0 | the plain case: one binary, no user files |
| [snake](https://github.com/slash-proc/snake-retro-go-sd) | v1.1.0 | the plain case |
| [pong](https://github.com/slash-proc/pong-retro-go-sd) | v0.0.2 | no cover art to publish — the cover is generated at build time |
| [ccleste](https://github.com/slash-proc/ccleste-retro-go-sd) | v0.0.2 | `originalSystem: pico8`, a console no core emulates |
| [smw](https://github.com/slash-proc/smw-retro-go-sd) | v0.4.1 | a converter: one ROM in, one asset pack out |
| [zelda3](https://github.com/slash-proc/zelda3-retro-go-sd) | v0.3.2 | two inputs, 12 variants, many files into **one** asset pack |
| [openlara](https://github.com/slash-proc/openlara-retro-go-sd) | v0.0.1 | `runPerFile` with derived names, 21 variants, `dataDir` |

**Cores**

| Project | Version | What it exercises |
|---|---|---|
| [pce-go](https://github.com/slash-proc/pce-go-retro-go-sd) | v0.0.3 | two systems, a `.cue` and its tracks, `biosDir` differing from the ROM folder |
| [SMSPlusGX](https://github.com/slash-proc/SMSPlusGX-retro-go-sd) | v0.0.5 | four systems from one binary; `col` browsing but reading `bios/coleco/` |
| [blueMSX](https://github.com/slash-proc/blueMSX-retro-go-sd) | v0.0.3 | eleven BIOS files, all shipped by the project rather than found by the user |
| [fceumm](https://github.com/slash-proc/fceumm-retro-go-sd) | v0.1.1 | a BIOS required only for one extension (`requiredFor: .fds`) |
| [gba](https://github.com/slash-proc/gba-retro-go-sd) | v0.0.3 | `mapped` — a blob executed in place from memory-mapped flash |
| [tgb-dual](https://github.com/slash-proc/tgb-dual-retro-go-sd) | v0.1.1 | two genuinely different systems from one binary |
| [PokeMini](https://github.com/slash-proc/PokeMini-retro-go-sd) | v0.0.3 | an optional BIOS with a linked-in fallback |
| [doom](https://github.com/slash-proc/doom-retro-go-sd) | v0.2.1 | a core that emulates nothing, and a converter with derived names |
| [gwenesis](https://github.com/slash-proc/gwenesis-retro-go-sd) | v0.0.3 | the plain case |
| [lynx](https://github.com/slash-proc/lynx-retro-go-sd) | v0.0.3 | the plain case |
| [snes](https://github.com/slash-proc/snes-retro-go-sd) | v0.0.4 | the plain case |
| [caprice32](https://github.com/slash-proc/caprice32-retro-go-sd) | v0.1.1 | disks found by scanning siblings — the case the spec declines to model |
| [stella2014](https://github.com/slash-proc/stella2014-retro-go-sd) | v0.1.1 | the plain case |
| [prosystem](https://github.com/slash-proc/prosystem-retro-go-sd) | v0.0.3 | a BIOS the upstream emulator supports and this port never loads |
| [potator](https://github.com/slash-proc/potator-retro-go-sd) | v0.0.3 | the plain case |
| [LCD-Game-Emulator](https://github.com/slash-proc/LCD-Game-Emulator-retro-go-sd) | v0.0.3 | self-contained `.gw` packages |
| [tama](https://github.com/slash-proc/tama-retro-go-sd) | v0.0.2 | the plain case |

Between them they exercise the shapes the model was designed for: one binary
serving four launcher tabs, two systems from one binary, a system whose game is
a `.cue` and its tracks, a BIOS folder that is not the ROM folder, a BIOS the
project ships and one the user supplies, a required sidecar beside the core, a
blob executed in place from mapped flash, a core that emulates nothing at all,
a converter that turns one file into one file and another that turns a shelf of
them into a shelf of them, and a homebrew whose data lives in a folder of its
own.

Breaking changes are still expected: nothing here is public yet, and the
spec is worth more correct than stable.
