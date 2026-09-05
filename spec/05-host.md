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
`textContent`. Rendering them as HTML is XSS in your own origin. Validate
output names against a strict pattern — plain file name, no separators, no
`..`, no control characters — *and* against `tools[].outputs[]`.

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

**Reject unknown versions.** If `schemaVersion`, `processor.version` or
`abi_version()` is a number you do not implement, refuse rather than guessing.

**Verify artifacts too.** Every artifact carries a `sha256`. Check it. A
mirror is not a trust boundary.

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
