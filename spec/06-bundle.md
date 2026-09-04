# Offline bundles

A zip that installs without a network.

Projects disappear. A bundle is the archival form of a release, so a homebrew
outlives the repository that published it.

## Format

**A bundle is `dist/<tag>/` zipped.** Nothing is added and nothing is
rewritten.

```
minesweeper-v0.1.2-bundle.zip
├── manifest.json
└── minesweeper.bin
```

Every `url` in a manifest is a plain relative filename, so the same resolution
works against zip entries as against a URL. A tool needs one new resolver, not
a second format.

Name it `<project>-<tag>-bundle.zip`, all lower case.

`-bundle` keeps it distinct from any other archive a project attaches to the
same release. GitHub compares release asset names case-insensitively, so two
that differ only in case cannot both be attached.

## Multi-version bundles

An archivist may package a project's whole retained history. Put `versions.json`
at the zip root and one directory per tag, exactly as the site is laid out:

```
minesweeper-all-bundle.zip
├── versions.json
├── v0.1.2/
│   ├── manifest.json
│   └── minesweeper.bin
└── v0.1.1/
    ├── manifest.json
    └── minesweeper.bin
```

A tool reads `versions.json` when present and falls back to a lone
`manifest.json` at the root.

## Reading one

1. Reject entry names containing `..`, a leading `/`, or a backslash. Zip paths
   are attacker-controlled.
2. Read `versions.json`, or `manifest.json` if there is none.
3. Validate against the schema, exactly as for a fetched manifest.
4. Resolve each `url` to a zip entry in the same directory as its manifest.
   A `url` that names no entry is an error.
5. Check every file's `bytes` and `sha256` before installing it.

Ignore entries the manifest does not name. Do not install them.

## Provenance

A bundle proves its own integrity and nothing else. The manifest carries a
`sha256` for every file, so tampering with a payload is caught — but whoever
edited the payload could edit the manifest to match.

**Label an imported bundle as unverified.** Do not present it as equivalent to
a fetched release.

When `source.repo` is still reachable, fetch that project's live manifest for
the same tag and compare. Tell the user whether it matched. That turns an
unverifiable bundle into a verified one whenever the project still exists.

The residual risk is the device binary, which is as trusted as any homebrew
somebody hands you. A converter is not part of that risk: it is still a
zero-import module that cannot reach anything (see
[the processor ABI](04-processor.md)).

## Exporting

A tool that installs from a live site should offer the same set back as a
bundle. Preservation works when it is a side effect of ordinary use, not a
thing somebody has to remember to do.

An exported bundle must be byte-identical in content to the published one:
the same manifest, unmodified, and the files it names.
