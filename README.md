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

| Project | Version | Features |
|---|---|---|
| [mine-sweeper](https://github.com/slash-proc/mine-sweeper-retro-go-sd) | v0.2.0 | — |
| [snake](https://github.com/slash-proc/snake-retro-go-sd) | v1.1.0 | — |
| [pong](https://github.com/slash-proc/pong-retro-go-sd) | v0.0.2 | — |
| [ccleste](https://github.com/slash-proc/ccleste-retro-go-sd) | v0.0.2 | originalSystem |
| [smw](https://github.com/slash-proc/smw-retro-go-sd) | v0.4.1 | originalSystem, converter, 1 variant |
| [zelda3](https://github.com/slash-proc/zelda3-retro-go-sd) | v0.3.2 | originalSystem, converter, 2 inputs, 12 variants |
| [openlara](https://github.com/slash-proc/openlara-retro-go-sd) | v0.0.1 | originalSystem, dataDir, converter, runPerFile, derived names, 21 variants |

**Cores**

| Project | Version | Features |
|---|---|---|
| [pce-go](https://github.com/slash-proc/pce-go-retro-go-sd) | v0.0.3 | 2 systems, extension groups, 1 BIOS, biosDir |
| [SMSPlusGX](https://github.com/slash-proc/SMSPlusGX-retro-go-sd) | v0.0.5 | 4 systems, 1 BIOS, biosDir |
| [tgb-dual](https://github.com/slash-proc/tgb-dual-retro-go-sd) | v0.1.1 | 2 systems |
| [blueMSX](https://github.com/slash-proc/blueMSX-retro-go-sd) | v0.0.3 | 11 BIOS (shipped) |
| [fceumm](https://github.com/slash-proc/fceumm-retro-go-sd) | v0.1.1 | 2 BIOS, requiredFor |
| [PokeMini](https://github.com/slash-proc/PokeMini-retro-go-sd) | v0.0.3 | 1 BIOS |
| [gba](https://github.com/slash-proc/gba-retro-go-sd) | v0.0.4 | 1 BIOS, mapped, sidecar |
| [doom](https://github.com/slash-proc/doom-retro-go-sd) | v0.2.1 | converter, runPerFile, derived names, 4 variants |
| [caprice32](https://github.com/slash-proc/caprice32-retro-go-sd) | v0.1.1 | — |
| [gwenesis](https://github.com/slash-proc/gwenesis-retro-go-sd) | v0.0.3 | — |
| [LCD-Game-Emulator](https://github.com/slash-proc/LCD-Game-Emulator-retro-go-sd) | v0.0.3 | — |
| [lynx](https://github.com/slash-proc/lynx-retro-go-sd) | v0.0.3 | — |
| [potator](https://github.com/slash-proc/potator-retro-go-sd) | v0.0.3 | — |
| [prosystem](https://github.com/slash-proc/prosystem-retro-go-sd) | v0.0.3 | — |
| [snes](https://github.com/slash-proc/snes-retro-go-sd) | v0.0.4 | — |
| [stella2014](https://github.com/slash-proc/stella2014-retro-go-sd) | v0.1.1 | — |
| [tama](https://github.com/slash-proc/tama-retro-go-sd) | v0.0.2 | — |

A dash means the project uses none of the optional fields: a binary, its
metadata and nothing else.

Breaking changes are still expected: nothing here is public yet, and the
spec is worth more correct than stable.
