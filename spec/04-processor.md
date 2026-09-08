# Processor ABI

`processor: { "type": "wasm", "version": 1 }`

A converter turns files the user supplies into files the installer writes. It
is one `.wasm` binary.

## The security property

**The module imports nothing.** Not a filesystem, not a clock, not randomness,
not a host callback of any kind. The host instantiates it with no import object
at all, so the engine enforces this rather than merely documenting it.

There is no shim. Data crosses through the module's own linear memory and
nowhere else. A module cannot observe or affect anything outside the bytes the
host hands it, because no mechanism exists through which it could ask.

This is why a converter may use whatever libraries it likes. In Rust they are
crates, statically linked into the binary at build time — YAML parsers, image
decoders, compressors, anything. They are not loaded at runtime and the host
neither provides nor approves them; they are inside the hashed `.wasm`. The
only constraint is that a crate touching `std::fs`, `std::time` or `getrandom`
introduces an import, and the build then fails verification. Nobody has to
audit for this. The gate catches it.

## Exports

```text
memory                                the module's linear memory
abi_version() -> u32                  the ABI this module implements

alloc(len: u32) -> u32                reserve len bytes, returns an offset
input_clear()                         discard registered inputs
input_add(ptr: u32, len: u32) -> u32  register one input, returns its index
run(flags: u32) -> u32                0 = ok, else an error code

run_begin(flags: u32) -> u32          start a stepped run
run_step() -> u32                     0 = done, 1 = more work, else error
stage_count() -> u32                  total stages
stage_index() -> u32                  stages completed
stage_name_ptr(i: u32) -> u32         UTF-8 name of stage i
stage_name_len(i: u32) -> u32

output_count() -> u32                 files produced
output_name_ptr(i: u32) -> u32        UTF-8 id of output i, from outputs[]
output_name_len(i: u32) -> u32
output_ptr(i: u32) -> u32             bytes of output i
output_len(i: u32) -> u32

error_ptr() -> u32                    message, empty when run returned 0
error_len() -> u32
warnings_ptr() -> u32                 newline-separated, may be empty
warnings_len() -> u32
```

**A module labels its outputs, it does not name them.** `output_name_*` is the
`id` of an entry in `tools[].outputs[]`, not a filename. The host resolves the
name — from the manifest for a fixed output, from the converted file for a
derived one — so a module cannot propose a path, an extension, or a name that
collides with anything already on the card.

The ABI is unchanged by this: same exports, same semantics, same string. Only
what the string means changed, and it means something the host was already
checking against `outputs[]`.



Every export is fixed by the ABI version. A `wasm`/`1` module has exactly
these. The manifest does not list them; a host re-derives them from the binary
and refuses a module that disagrees.

A "pointer" here is a `u32` offset into `memory.buffer`. Not a machine address.

## Passing data in

The host never picks an address. It asks:

```js
const ptr = mod.alloc(file.length);
new Uint8Array(mod.memory.buffer, ptr, file.length).set(file);
mod.input_add(ptr, file.length);
```

Repeat per file, then `run(flags)`, then read each output at `output_ptr(i)`
for `output_len(i)` bytes.

`input_add` takes no name and no role. The module identifies each file by
hashing its content, so a mislabelled file cannot be smuggled into the wrong
role.

**A module hashes to resolve roles, never to refuse a file.** Whether an
unrecognised file is allowed at all is settled before the run, by the host,
from the input's `strict` flag and its `variants[]` — see
[host requirements](05-host.md). By the time bytes reach `input_add` that
decision has been made, and a module that second-guesses it can only disagree
with the manifest it was published beside.

So a module handed a file it cannot place must do the best it can — treat it as
the role its position and the project's own rules imply — and say so through
`warnings`, rather than failing the run. Failing is for a file it cannot
process at all, which is a different statement: not "I do not recognise this"
but "this is not usable".

## Progress

A module that imports nothing cannot call out to report progress, and its
memory is non-shared, so the host cannot watch a counter while `run` is on the
stack.

So progress works by returning control. The work is divided into named stages.
The host calls `run_begin`, then `run_step` in a loop, and between steps it may
update a UI, or stop calling — which is what cancellation is.

`stage_count()` is available after `run_begin`, so a host can show a determinate
bar. Stage names are short and user-facing.

`run(flags)` is exactly that loop, for hosts that do not care.

## Flags

`flags` is a bitfield. Bit meanings are per-project and declared in the
manifest's `tools[].options[]`. Unlisted bits are reserved and must be zero. A
module with nothing to offer the user declares `"options": []` and is always
called with `flags` of zero.

Options are for genuine choices about what to produce. They are not a channel
for telling a module how to treat its inputs: that is decided by the manifest
and enforced by the host before the run starts.

## Errors

`run`, `run_begin` and `run_step` return 0 for success. On a non-zero return,
read `error_ptr`/`error_len` for a UTF-8 message.

`warnings_ptr`/`warnings_len` may hold newline-separated diagnostics after a
successful run.

## Building one

Rust, `crate-type = ["cdylib", "rlib"]`, target `wasm32-unknown-unknown`,
exports marked `#[no_mangle] pub extern "C"`.

`.cargo/config.toml` must cap memory growth:

```toml
[target.wasm32-unknown-unknown]
rustflags = ["-C", "link-arg=--max-memory=268435456"]
```

Without it the module declares unbounded growth and fails verification.

The number is per-project and should be measured, not copied. Cap it at a
comfortable multiple of the worst case an actual run needs, and say in the file
what that measurement was — zelda3 peaks at 118 pages converting three
languages and caps at 1024; smw caps at 4096. `limits.maxMemoryPages` in the
manifest reports whatever the binary declares, so the two cannot disagree.

Keep an `rlib` and a native `[[bin]]` harness alongside the `cdylib`. The same
extraction code then runs without a WASM runtime, which is what makes it
diffable against the original script.

## Porting an existing extractor

Get a byte-exact oracle first. Run the original script on real input and record
the output hash before writing any of the port. Byte-for-byte parity against
real data is the only thing that makes a port of this kind trustworthy.

Keep the original script. It is the oracle, not dead code.
