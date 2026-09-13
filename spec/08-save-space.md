# Save-space bounds

Retro-Go keeps runtime data in its LFS partition. Installed binaries and ROMs
can fit while the first save later fails, so install size alone is not a safe
partition estimate. [`runtime`](03-manifest.md#runtime-working-space) publishes
the two per-title bounds an installer cannot learn from artifact sizes:

- `savestate.bytes`: all files belonging to one state slot, including its
  preview;
- `save.bytes`: all other title-specific persistent data combined.

Each entry also has `supported`. A false value is a positive claim that the
feature is unwired; true without `bytes` records support whose ceiling is not
yet known. An absent entry is simply undeclared.

The distinction matters because state space scales with the number of slots,
while battery SRAM and native saves ordinarily exist once per title.

## How a publisher derives the numbers

Use the bytes actually written by the device build. Upstream emulator limits
are supporting evidence, but the port's wrapper is authoritative: several
ports add headers or settings, pad a buffer, or deliberately cap hardware that
the upstream emulator models more broadly.

In descending order of confidence:

1. Save a worst-case title on the device and measure every resulting file.
   Repeat for content types that take different paths.
2. For a fixed writer, sum every `fwrite` length and any wrapper header. A
   callback that always writes its whole work buffer publishes that buffer's
   size, not the smaller number its serializer happened to fill today.
3. For a tagged or streamed writer, sum its fixed records and the maximum size
   of every variable block. Build-time `sizeof` values must come from the
   shipped target ABI; host `sizeof` can differ through alignment or pointer
   width.
4. For cartridge saves, follow the ROM header or mapper table and take the
   largest value the port accepts. Include RTC trailers and separate memory
   cards. Do not use the size of one convenient test ROM.
5. If no defensible ceiling exists, omit the member. A guessed number is worse
   than an explicit unknown because an installer may rely on it to make a
   partition that later fills.

The manifest value is bytes, not LFS blocks. Filesystem allocation, directory
entries, wear margin and free-space reserve belong to the image builder because
they depend on its LFS geometry.

## Audit of the current ports

The current trees confirm that both fields are needed and that the values are
derivable, but not from one common symbol.

| Pattern | Current examples | What establishes the bound |
|---|---|---|
| Fixed state buffer | SMSPlusGX, LCD Game Emulator, Tama, Celeste Classic, Cupcake Crisis, Potator, ProSystem | The buffer or serialized structure size, plus wrapper fields |
| Explicit state stream | PCE, PokeMini, FCEUmm, Caprice32, blueMSX, Stella, Gwenesis, Lynx | Sum the records; use the largest machine/content configuration |
| RAM snapshot | Doom | Snapshot header plus the linker-defined RAM regions copied by the device build |
| ROM-dependent state | gpSP/GBA, TGB Dual, SNES | Fixed machine state plus the maximum mapped RAM/backup blocks the port writes |
| Native battery/EEPROM sidecar | PCE, PokeMini, gpSP/GBA, TGB Dual, FCEUmm, SNES, Zelda 3 | Maximum write accepted by the port, not the size used by an arbitrary ROM |
| Application settings/progress | Snake, Pong and other homebrew | Sum title-specific records only when they live in LFS |
| Callback present but unwired/stubbed | OpenLara and several template-derived ports | Omit until the callback can successfully create a file |

Concrete ceilings visible in the current source illustrate the spread:

- PCE battery BRAM is a fixed 2,048 bytes.
- PokeMini writes an 8,192-byte EEPROM sidecar.
- SMSPlusGX carries a 32,768-byte SRAM block inside its fixed savestate.
- Zelda 3 writes an 8,192-byte SRAM sidecar.
- SNES reserves up to 32,768 bytes of ordinary cart SRAM in this port and may
  append 16 RTC bytes for SPC7110 content.
- TGB Dual derives cartridge RAM from the ROM header and can reach 131,072
  bytes with the table used by the port.
- Doom's native three savegames live inside its RAM snapshot; counting them
  again as `save.bytes` would double-count them. Its separate settings blob is
  non-state save data.

These are evidence for project manifests, not a central registry. Values can
change whenever serialization code, linker layout, preview format, or supported
hardware changes, so each release publishes its own bounds beside the binary.

## Consumer calculation

For each installed homebrew, use the target's `runtime`. For each installed
core title, use the matching system's `runtime`. A directory-browsed multi-file
game is still one title. Then compute:

```
runtime data = sum(save.bytes) + sum(savestate.bytes * plannedSlots)
LFS size     = runtime data + LFS allocation overhead + chosen free-space margin
```

If either applicable member is absent, the corresponding sum is incomplete.
Report that fact alongside any numeric estimate. Do not substitute another
core's value merely because it emulates the same console: the serialized format
belongs to the implementation and release.
