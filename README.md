# GWRG distribution spec

How a project publishes a Game & Watch Retro-Go homebrew or emulator core so a
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
| [Emulator cores](spec/07-emulators.md) | The systems a core provides |

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

An emulator core publishes the same three, and its manifest adds `systems[]` —
the launcher tabs the binary provides, read out of the packed core rather than
written by hand. See [emulator cores](spec/07-emulators.md).

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

Four homebrew projects publish under it today, all conformant against the
checker:

| Project | Shape | State |
|---|---|---|
| [mine-sweeper-retro-go-sd](https://github.com/slash-proc/mine-sweeper-retro-go-sd) | no converter | published, v0.1.3 |
| [snake-retro-go-sd](https://github.com/slash-proc/snake-retro-go-sd) | no converter | published, v1.0.1 |
| [smw-retro-go-sd](https://github.com/slash-proc/smw-retro-go-sd) | one converter, one input | published, v0.3.0 |
| [zelda3-retro-go-sd](https://github.com/slash-proc/zelda3-retro-go-sd) | one converter, many files into one asset pack | published, v0.3.0 |

Seven emulator cores are prepared and none has been released yet: pce-go, gba,
gwenesis, lynx and snes were already ported and now emit manifests; blueMSX and
tama have just been converted from the project template.

Between them they exercise the shapes the emulator half was designed for — one
binary serving four launcher tabs, a system whose game is a `.cue` and its
tracks, a required BIOS, an optional one, and a required sidecar beside the
core.

Breaking changes are expected until the first cores ship.
