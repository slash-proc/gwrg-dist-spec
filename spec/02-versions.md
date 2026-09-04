# `versions.json`

The index. One fetch tells a tool every version it can offer and enough about
each to render a picker without fetching anything else.

## Example

```json
{
  "schemaVersion": 1,
  "project": "minesweeper",
  "title": "Minesweeper",
  "repo": "slash-proc/mine-sweeper-retro-go-sd",
  "releasesUrl": "https://github.com/slash-proc/mine-sweeper-retro-go-sd/releases",
  "retained": 5,
  "versions": [
    {
      "tag": "v0.1.2",
      "manifest": "v0.1.2/manifest.json",
      "publishedAt": "2026-08-14T18:22:10Z",
      "prerelease": false,
      "kind": "homebrew",
      "requiresAbi": { "version": 2, "minSize": 824 },
      "needsUserFiles": false
    }
  ]
}
```

## Fields

| Field | Required | |
|---|---|---|
| `schemaVersion` | yes | Integer. Refuse a version you do not implement |
| `project` | yes | Short slug, stable across versions |
| `title` | yes | Display name |
| `repo` | yes | `owner/name` |
| `releasesUrl` | yes | Where users find versions not listed here |
| `retained` | no | How many versions this file keeps |
| `versions` | yes | Newest first. `versions[0]` is the latest |

## Version entries

| Field | Required | |
|---|---|---|
| `tag` | yes | Release tag |
| `manifest` | yes | URL, relative to this file |
| `publishedAt` | yes | RFC 3339 |
| `prerelease` | yes | Boolean |
| `kind` | yes | `homebrew` or `emulator` |
| `requiresAbi` | yes | Firmware ABI this build needs |
| `needsUserFiles` | yes | True if the user must supply a ROM |
| `bundle` | no | Filename of an [offline bundle](06-bundle.md) for this version |

`requiresAbi.version` and `requiresAbi.minSize` are read out of the packed
binary at build time — `pack_homebrew.py` and `pack_core.py` print both. Never
write them by hand. `minSize` is `sizeof(gw_firmware_abi_t)` in **bytes**, not
a count of functions.

`kind`, `requiresAbi` and `needsUserFiles` are duplicated from the manifest so
a picker can warn about incompatible firmware and label a version as needing a
ROM before fetching anything. They must agree with the manifest; the manifest
wins.

## Rules

Newest first. A tool takes `versions[0]` as the default.

Entries are immutable. A published tag's files never change. Removing an entry
when it falls out of retention is the only permitted edit.

Regenerate the whole file on every deploy. Never edit it in place — that is how
it drifts from the releases it describes.
