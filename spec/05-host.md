# Host requirements

For tools that run converters. These are requirements. The module sandbox does
not cover any of them.

The module cannot reach the outside world. But **everything it hands back is a
value it chose** — lengths, names, messages. Treat all of it as untrusted
input. This is where the residual risk lives.

## Required

**Verify before instantiating.** Check the binary's imports, exports and
declared memory bounds, then call `WebAssembly.instantiate` with **no import
object**. The second is not redundant: it makes the engine enforce what the
verifier asserted.

**Check the binary against its manifest.** Hash the bytes you fetched and
compare with `tools[].binary.sha256`. If they disagree, refuse — do not prefer
one over the other. Re-derive the ABI from the binary; the manifest is a
convenience, never the source of truth. A manifest claiming a module imports
nothing would not make it so.

**Bound every length before allocating.** `output_len()` is a `u32` the module
chooses. Compare against `limits.maxOutputBytes` and reject an absurd claim
rather than discovering it when the tab dies. Check `ptr + len` against
`memory.buffer.byteLength` before constructing a view.

**Re-read `memory.buffer` after any call that can grow memory.** Growing
detaches every `ArrayBuffer` captured beforehand. A view taken before `alloc`
is unusable after it.

**Treat module strings as text, never markup or paths.** Insert messages with
`textContent`. Rendering them as HTML is XSS in your own origin. A module's
output string is an `id`: match it against `tools[].outputs[]` and refuse
anything unrecognised.

**Resolve names yourself, and force the declared extension.** For an output
declaring `filename`, that is the name. For one declaring `extension`, take the
matched variant's `filename` if it has one, otherwise the converted file's own
stem with the declared extension **replacing** whatever it had. Validate the
result the way you would any name from outside — plain file name, no
separators, no `..`, no control characters, length capped — and then:

- **A publisher-declared name wins.** A derived name colliding with an
  `artifacts[]` entry, a fixed output, or another derived name is refused and
  shown to the user, never silently written.
- **Compare names case-insensitively, and compare them within one directory.**
  The card is FAT or exFAT, which case-folds: `Doom.whd` and `DOOM.whd` are one
  file there and two in any ordinary map or set. A collision check that
  distinguishes them passes in the tool and then overwrites on the card, which
  is the failure this rule exists to prevent. Fold case before comparing.

  The comparison is per destination directory, not across the whole install
  set. A core's converted outputs land in `roms/<system id>/` and its artifacts
  in the core directory, so those two cannot collide with each other; two files
  headed for the same directory can, whatever produced them.
- **A name that sanitises to nothing usable is an error the user resolves.**
  There is no canned fallback: two files that collide would still collide
  under one.

Forcing the extension is the load-bearing rule. The install set is a flat
directory, so a user-supplied stem entering it is untrusted input — a WAD named
`doom.bin` must never land where a core binary goes.

**Place a homebrew's data under `dataDir` when it declares one.** The binary
still goes where it always went; only the data moves, into
`<install dir>/<dataDir>/`, and a file with a `subdir` goes deeper still,
relative to that. Both are manifest-declared path segments, so validate them as
paths — no leading separator, no `..`, no empty segment — and refuse rather
than sanitising, the same as any other name you did not choose yourself.

The collision rules apply per directory as before, so files in `openlara/` and
`openlara/fmv/` cannot collide with each other or with the binary beside them.

**Run a converter once per file when the input says `runPerFile`.** Check
`maxCount` before running, not after: the run count is otherwise the one
unbounded quantity in the model. Accumulate the produced files across runs
rather than replacing them, and place each by the rule for the project's kind —
beside the binary for a homebrew, in `roms/<system id>/` for a core.

**Run it in a Worker with a timeout.** The ABI has no cancellation flag and
cannot have one. Terminating the Worker is the only way to stop a run and the
only way to reclaim its memory.

**Enforce `strict` yourself.** Hash each file the user supplies and compare it
against that input's `variants[]`. On no match: refuse the file when the input
is `strict` (the default), and when it is not, accept it but tell the user it
was not recognised. Check `maxBytes` in the same pass.

This is the host's job because the host is the only party that can do it. It
has the file, the hash table and the user; the module has bytes and no way to
ask a question. Doing it before a run also means an obviously wrong file costs
nothing.

A module cannot be relied on to do this for you: it hashes content to work out
which input is which — that is how roles are resolved — but it must accept what
it is handed. If a module refuses a file the host chose to allow, the two
disagree about a decision that has only one right answer, which is why the
`strict` boolean sits in the manifest and no flag bit does.

**Check a BIOS the same way, and do not assume the device will.** A BIOS is a
user-supplied file like a converter input, but it is installed rather than
converted, so nothing downstream looks at it again. Where `sha1` is published,
hash the file and compare; refuse a mismatch when the entry is `strict`. Honour
`required` and `requiredFor` — the latter only bites when the user is installing
a game with one of the extensions it names.

The device is not a backstop here. ColecoVision's core allocates its 8 KiB,
calls `odroid_sdcard_read_file` and ignores the return value: a truncated BIOS
boots into uninitialised heap with no error. The firmware skips these checks
because it runs on a slow machine. A browser has cycles to spare.

**Place a `mapped` artifact where the device can address it.** An artifact
carrying `"mapped": true` is not a file the program opens; it is memory the
program executes or reads in place, and a copy of it in a filesystem is no use
at all. An installer writing to an SD card has nothing extra to do — the core caches
the file into QSPI itself at load time and patches it on the way in — but a
builder laying out a flash image has no such runtime help, and must put the
file in memory-mapped flash at an address of its own choosing.

**Apply the relocation when `relocBase` is present.** The blob holds absolute
addresses in `[relocBase, relocBase + bytes)`. Having chosen a real address,
walk the file as 32-bit words, and for each word whose value falls in that
window — mask bit 0 off first, since a function pointer carries the Thumb bit
there — add `actual - relocBase`. The sentinel is an impossible address, so a
word in range is a pointer and not a coincidence. Skipping this step is not a
degraded install; it writes a blob full of addresses that cannot exist, and the
device faults the first time it uses one.

**Store it whole, uncompressed, and patch it after the layout is fixed.**
Three things follow from the file being memory rather than data, and each is a
way to produce an image that looks finished and faults on first use.

It cannot be compressed. A builder that packs it — the firmware's own image
builder has a `--rom-compression` switch driven by `COMPRESS`, and it is
applied by the builder, not chosen by the core — leaves bytes that are in
mapped flash and still unreadable in place. Nothing in the artifact says
"compress me", so the rule has to be that nothing may.

It cannot be split. Addressable means one run of bytes at one address; a file
scattered across blocks has no address to give the core.

And the patch happens once the address is final, not before. Relocating to an
address the layout later moves is worse than not relocating, because the result
still looks plausible.

Place it on a 4-byte boundary. The relocation reads 32-bit words, and the
device fetches instructions from it; an odd address breaks both. No artifact
has yet needed more than that, so the spec asks for no more.

**Only whole aligned words are relocated.** The scan reads the file as an array
of 32-bit words, so it can only fix an address stored as one. A toolchain that
materialises an address as a `MOVW`/`MOVT` pair splits it across two instruction
encodings, where neither half is the value being looked for and the scan walks
straight past. That is a property of how the blob was built, not of the patcher
— see [cores](07-cores.md) — and a blob built that way cannot be relocated by
this method at all.

**Refuse rather than guess when you cannot place it addressably.** A host or
builder with no memory-mapped region to give the file, or no way to relocate it,
has not got a partial install — it has one that hardfaults. Say so and stop.

**Reject unknown versions.** If `schemaVersion`, `processor.version` or
`abi_version()` is a number you do not implement, refuse rather than guessing.

**Verify artifacts too.** Every artifact carries a `sha256`. Check it. A
mirror is not a trust boundary. The same goes for anything else the manifest
names and you choose to fetch, `symbols[]` included — though a host is free not
to fetch those at all, since they are never installed.

**A produced binary is checked differently.** A file a converter produces has
no published hash, because it is derived from what the user supplied and no two
users need get the same bytes. Identify the binary the way the firmware does —
by its `.bin` extension, since that is what the launcher scans for — and check
its header instead: read the firmware ABI version and minimum size out of the
file itself and compare those against the device, rather than trusting the
target's advisory `requiresAbi`.

## Recommended

**Drive the stepped path.** Call `run_begin` then `run_step` in a loop even
when you do not display progress, so the incremental route is the one your
tests cover rather than a second, less-travelled one.

**Warn on firmware mismatch.** Compare `requiresAbi` against the Retro-Go
version being installed. A binary built for a newer ABI hardfaults on device
with nothing to explain it.

## One warning from experience

Verifier and host helpers get loaded directly by browsers as well as by node.
Node-only constructs in them — a shebang, a bare `process.argv` — throw at
import time and take the importing page down *silently*, with no error visible
anywhere. Guard them, and test in an actual browser.
