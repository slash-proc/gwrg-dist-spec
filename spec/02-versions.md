# `versions.json`

The index. One fetch tells a tool every version it can offer and enough about
each to render a picker without fetching anything else.

## Example

Real, not illustrative — this is the head of
<https://slash-proc.github.io/mine-sweeper-retro-go-sd/dist/versions.json>.

```json
{
  "schemaVersion": 1,
  "project": "minesweeper",
  "title": "Mine Sweeper",
  "repo": "slash-proc/mine-sweeper-retro-go-sd",
  "releasesUrl": "https://github.com/slash-proc/mine-sweeper-retro-go-sd/releases",
  "retained": 5,
  "versions": [
    {
      "tag": "v0.1.3",
      "manifest": "v0.1.3/manifest.json",
      "publishedAt": "2026-09-05T19:44:57Z",
      "prerelease": false,
      "kind": "homebrew",
      "requiresAbi": { "version": 2, "minSize": 832 },
      "needsUserFiles": false,
      "bundle": "minesweeper-v0.1.3-bundle.zip"
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
| `kind` | yes | `homebrew` or `core` |
| `requiresAbi` | yes | Firmware ABI this build needs |
| `needsUserFiles` | yes | True if the user must supply a file — see below |
| `bundle` | no | Filename of an [offline bundle](06-bundle.md) for this version |

`requiresAbi.version` and `requiresAbi.minSize` are read out of the packed
binary at build time — `pack_homebrew.py` and `pack_core.py` print both. Never
write them by hand.

`minSize` is `sizeof(gw_firmware_abi_t)` in **bytes**: the firmware's own check
is `required_abi_min_size <= g_firmware_abi.size`, and that is the unit it
compares in. The table is 4-byte entries — two `uint32_t` header fields
followed by function pointers — so 840 bytes is a table of 210 entries. Since
fields are only ever appended, "needs at least 840 bytes" and "needs at least
the first 210 entries" say the same thing.

`needsUserFiles` is true when **a tool the target requires declares a required
input, or any system declares a required BIOS the project does not ship**. Both
mean the same thing to a user: they have to go and find a file before this will
work.

Counting only tool inputs would be wrong for every core, because a core
has `tools: []` — PC Engine CD would advertise `needsUserFiles: false` and then
refuse to start without a System Card. A conditionally required BIOS
(`requiredFor`) counts too: the flag warns that files may be needed, and it
cannot know which games somebody intends to play.

Note *a tool the target requires*. `uses[].required` is "false if the install
works without it", and `inputs[].required` is whether the tool can run at all —
two different questions that happened to have the same answer until a project
could ship a game. Doom ships the shareware episode and converts the WADs a
user owns: its converter still cannot run without a WAD (`inputs[].required`
stays true), but the install no longer needs it (`uses[].required` is false), so
the user is asked for nothing. Read the wrong one and every such project warns
about files it is about to install itself.

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
