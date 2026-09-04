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

**Reject unknown versions.** If `schemaVersion`, `processor.version` or
`abi_version()` is a number you do not implement, refuse rather than guessing.

**Verify artifacts too.** Every artifact carries a `sha256`. Check it. A
mirror is not a trust boundary.

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
