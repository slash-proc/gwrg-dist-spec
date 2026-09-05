# Distribution

Where the files live, and how a tool finds them.

## The problem

GitHub release assets cannot be fetched by a browser from another origin.
Measured, not assumed:

| URL | `access-control-allow-origin` | Usable from a page |
|---|---|---|
| `api.github.com/repos/O/R/releases` | `*` | yes |
| `github.com/O/R/releases/download/TAG/FILE` | absent | **no** |
| `raw.githubusercontent.com/O/R/REF/PATH` | `*` | yes |
| `O.github.io/R/PATH` | `*` | yes |

Release downloads redirect to `release-assets.githubusercontent.com`, which
sends no CORS header. `curl` gets the bytes; a browser does not.

This fails only in a browser, and only cross-origin. Every local test passes.

## The model

**Releases are the source of truth.** Every file the manifest *names* is
attached to a GitHub release, along with the `manifest.json` describing them and
the offline bundle. That is the archival record.

"Names", not "installs": debug symbols are named and published but never
installed, and the mirror fetches them off the release like anything else. A
file the manifest names and the release lacks is a broken deploy.

The bundle is built at release time and attached, never assembled by the
mirror, so what a user downloads offline is what the project published.

**GitHub Pages is a mirror.** A CI job copies the released files into a Pages
site, where a browser can read them. Pages is static hosting — it serves bytes
baked in at deploy time and cannot proxy.

The mirror is derived. Delete it and CI rebuilds it from the releases.

## Layout

```
https://{owner}.github.io/{repo}/dist/versions.json
https://{owner}.github.io/{repo}/dist/v1.0.0/manifest.json
https://{owner}.github.io/{repo}/dist/v1.0.0/game.bin
https://{owner}.github.io/{repo}/dist/v1.0.0/extractor.wasm
```

`dist/versions.json` is the only path a tool hard-codes. Everything else is
reached by resolving relative URLs against the file that named them.

The site root is left free for a human-facing page.

## Resolution

1. Normalise the pasted URL to `owner/repo`.
2. `GET https://{owner}.github.io/{repo}/dist/versions.json`.
3. Pick a version. The newest is `versions[0]`; there is no `latest` file.
4. `GET` that entry's `manifest`, resolved against the `versions.json` URL.
5. Resolve every `url` in the manifest against the manifest's URL.

Two small requests get a user to a working install.

## Retention

Each deploy replaces the whole site, so the job regenerates it from the
releases list every time. Keep the newest N versions — 5 is a reasonable
default — and set `retained` in `versions.json` so a tool can say what it is
not showing. `releasesUrl` points users to the rest.

Projects with large paired data files should lower N. Pages allows roughly 1 GB
per site and 100 GB of bandwidth per month.

A retained release was published against whatever the spec said at the time. If
a later revision makes its manifest invalid, leave it in the releases and drop
it from the mirror: publishing it anyway would make the whole project fail
conformance over one old version nobody is installing.

## Asset names are not filenames

GitHub rewrites characters it will not accept in a release asset name. A space
becomes a dot, so `Super Mario World.bin` is attached as
`Super.Mario.World.bin`.

The manifest declares the name the *device* wants, because that is what the
launcher displays and what an installer writes to the card. So the mirror
downloads the asset under whatever GitHub called it and restores the declared
name on the way in. The rewrite is a property of the archival copy, not
something a manifest should have to know about.

A project whose filenames are all `[A-Za-z0-9._-]` never encounters this.

## Fallback

A repo that has not enabled Pages, or has not adopted this spec, has no
CORS-readable mirror. A tool may proxy that repo's release assets through a
service it operates. This is a compatibility path, not part of the spec: a
conforming project never needs it.

## Ordering

Deploy Pages only after the release exists and the module has passed
verification. A published site can then never advertise a file that failed the
gate.
