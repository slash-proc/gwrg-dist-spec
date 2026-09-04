# GWRG distribution spec

How a project publishes a Game & Watch Retro-Go homebrew or emulator core so a
web tool can install it from nothing but the repo URL.

A user pastes `https://github.com/owner/repo`. The tool reads one file, learns
what versions exist, what files they need, and whether the user must supply a
ROM. It then fetches the files, runs any conversion in the browser, and writes
an SD card. No coordination with the tool's authors is required.

## The four pieces

| Piece | What it is |
|---|---|
| [Distribution](spec/01-distribution.md) | Where files live and how a tool finds them |
| [`versions.json`](spec/02-versions.md) | The index. One fetch, all versions |
| [`manifest.json`](spec/03-manifest.md) | One version: its files and its converter |
| [Processor ABI](spec/04-processor.md) | How a converter is called |
| [Offline bundles](spec/06-bundle.md) | Installing without a network |

Tool authors also read [host requirements](spec/05-host.md), which are
mandatory, not advisory.

## Minimum conforming project

A homebrew with no proprietary assets publishes two files:

```
dist/versions.json
dist/v1.0.0/manifest.json
dist/v1.0.0/game.bin
```

That is a complete implementation. Converters are only needed when the user
must supply their own ROM.

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

## Status

Draft. The spec is being written alongside its first three implementations:

- [mine-sweeper-retro-go-sd](https://github.com/slash-proc/mine-sweeper-retro-go-sd) — homebrew, no converter
- [smw](https://github.com/slash-proc/smw) — homebrew with a converter
- [zelda3](https://github.com/slash-proc/zelda3) — homebrew with a converter, multiple inputs

Breaking changes are expected until all three ship a tagged release.
