// Conformance checks for a GWRG dist site.
//
// Runs in a browser and under node. No imports beyond ./validate.js, and no
// node-only constructs, because this file is loaded directly by both.

import { validate } from "./validate.js";

const ERROR = "error", WARN = "warn", OK = "ok", INFO = "info";

export function distBase(owner, repo) {
  return `https://${owner.toLowerCase()}.github.io/${repo}/dist/`;
}

/** Accepts a URL, `owner/repo`, or `git@github.com:owner/repo.git`. */
export function parseRepo(input) {
  const s = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m =
    s.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i) ??
    s.match(/^git@github\.com:([^/]+)\/([^/]+)$/i) ??
    s.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
  if (!m) throw new Error("Not a GitHub repository. Try https://github.com/owner/repo");
  return { owner: m[1], repo: m[2] };
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function head(url) {
  const res = await fetch(url, { method: "HEAD", cache: "no-store" });
  const len = res.headers.get("content-length");
  // A compressed response reports the compressed length, which says nothing
  // about the file's real size. GitHub Pages gzips by default, so treating
  // content-length as the size fails every artifact it serves.
  const encoding = res.headers.get("content-encoding");
  const encoded = encoding !== null && encoding !== "identity";
  return {
    ok: res.ok,
    status: res.status,
    bytes: len === null || encoded ? null : Number(len),
    encoded,
  };
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {string} input        repo URL or owner/repo
 * @param {object} opts
 * @param {boolean} opts.hash   download every file and verify its sha256
 * @param {function} opts.onProgress
 * @returns {Promise<{base, owner, repo, checks, summary, versions, error}>}
 */
export async function check(input, opts = {}) {
  const { owner, repo } = parseRepo(input);
  // `base` is overridable so the checker can be pointed at a local tree or a
  // project that serves its dist/ from somewhere other than GitHub Pages.
  const base = opts.base ?? distBase(owner, repo);
  const checks = [];
  const say = (level, label, detail) => {
    checks.push({ level, label, detail });
    opts.onProgress?.(checks[checks.length - 1]);
  };

  // Where the schemas live. Defaults to this page's own origin; node callers
  // pass an explicit base, because there is no `location` outside a browser.
  const schemaBase =
    opts.schemaBase ?? (typeof location !== "undefined" ? new URL("schema/", location.href).href : null);
  if (!schemaBase) throw new Error("schemaBase is required outside a browser");

  const [versionsSchema, manifestSchema] = await Promise.all([
    getJson(new URL("versions.schema.json", schemaBase).href),
    getJson(new URL("manifest.schema.json", schemaBase).href),
  ]);

  let index;
  try {
    index = await getJson(base + "versions.json");
    say(OK, "dist/versions.json is reachable", base + "versions.json");
  } catch (e) {
    say(ERROR, "dist/versions.json is not reachable", `${base}versions.json — ${e.message}`);
    say(
      INFO,
      "Nothing else can be checked",
      "Either the repository has no Pages site, or it does not publish a dist/ tree. " +
        "A tool would fall back to proxying its release assets, if it supports that.",
    );
    return { base, owner, repo, checks, summary: summarise(checks), versions: [] };
  }

  const indexErrors = validate(index, versionsSchema);
  if (indexErrors.length) {
    for (const e of indexErrors) say(ERROR, "versions.json fails the schema", e);
  } else {
    say(OK, "versions.json matches the schema", `schemaVersion ${index.schemaVersion}`);
  }

  const list = Array.isArray(index.versions) ? index.versions : [];
  if (!list.length) say(ERROR, "versions[] is empty", "There is nothing to install");

  // Newest first is what makes versions[0] the latest.
  const dates = list.map((v) => Date.parse(v.publishedAt ?? ""));
  const sorted = dates.every((d, i) => i === 0 || !(d > dates[i - 1]));
  if (list.length > 1) {
    say(
      sorted ? OK : ERROR,
      sorted ? "versions[] is newest first" : "versions[] is not newest first",
      sorted ? `${list.length} versions, latest ${list[0].tag}` : "versions[0] must be the newest",
    );
  }

  if (index.repo && index.repo.toLowerCase() !== `${owner}/${repo}`.toLowerCase()) {
    say(WARN, "repo field does not match this repository", `manifest says ${index.repo}`);
  }

  const versions = [];
  for (const entry of list) {
    versions.push(await checkVersion(entry, base, manifestSchema, index, say, opts));
  }

  return { base, owner, repo, index, versions, checks, summary: summarise(checks) };
}

async function checkVersion(entry, base, manifestSchema, index, say, opts) {
  const tag = entry.tag ?? "(untagged)";
  const url = new URL(entry.manifest ?? "", base).href;
  const out = { tag, url, manifest: null, targets: [], tools: [] };

  let manifest;
  try {
    manifest = await getJson(url);
  } catch (e) {
    say(ERROR, `${tag}: manifest is not reachable`, `${url} — ${e.message}`);
    return out;
  }
  out.manifest = manifest;

  const errors = validate(manifest, manifestSchema);
  if (errors.length) {
    for (const e of errors) say(ERROR, `${tag}: manifest fails the schema`, e);
    return out;
  }
  say(OK, `${tag}: manifest matches the schema`, url);

  if (manifest.project !== index.project) {
    say(ERROR, `${tag}: project does not match the index`,
      `index says "${index.project}", manifest says "${manifest.project}"`);
  }

  // The index duplicates these so a picker need not fetch manifests. They must agree.
  const kinds = new Set(manifest.targets.map((t) => t.kind));
  if (entry.kind && !kinds.has(entry.kind)) {
    say(ERROR, `${tag}: index kind is not offered by any target`,
      `index says "${entry.kind}", targets offer ${[...kinds].join(", ")}`);
  }
  // `originalSystem` says which console a homebrew's work came from, so a
  // scraper can look it up in the right art library instead of searching by
  // name. A core has no such provenance -- its system lives in
  // `systems[]`, and a ROM's own folder already says which console it is.
  if (manifest.originalSystem !== undefined && !kinds.has("homebrew")) {
    say(WARN, `${tag}: originalSystem on a manifest with no homebrew target`,
      "The field describes where a homebrew came from; a core declares systems[] instead");
  }

  // Where a core's converter output goes is derived from the system it belongs
  // to, so with more than one system the manifest has to say which.
  for (const target of manifest.targets) {
    const ids = (target.systems ?? []).map((s) => s.id);
    for (const use of target.uses ?? []) {
      if (use.system !== undefined && !ids.includes(use.system)) {
        say(ERROR, `${tag}: ${target.id} uses ${use.tool} for system "${use.system}", which it does not declare`,
          ids.length ? `declares ${ids.join(", ")}` : "declares no systems");
      }
      if (use.system === undefined && ids.length > 1) {
        say(ERROR, `${tag}: ${target.id} uses ${use.tool} but does not say which system its output belongs to`,
          `declares ${ids.join(", ")}`);
      }
    }
  }

  // "Must the user supply something?" -- a converter input or a BIOS both count.
  // Most cores have `tools: []`, so counting only tool inputs would publish
  // false for a core that cannot run a game without a System Card. A
  // conditionally required BIOS (`requiredFor`) counts too: the picker's job is
  // to warn that files may be needed, not to predict which games get played.
  // A BIOS the project publishes itself (it carries a url) is installed from
  // the release like any other file, so it asks nothing of the user.
  const needsBios = manifest.targets.some((t) =>
    (t.systems ?? []).some((sys) =>
      (sys.bios ?? []).some((b) =>
        !b.url && (b.required === true || (b.requiredFor ?? []).length > 0))));
  const needsFiles = manifest.tools.some((t) => t.inputs.some((i) => i.required)) || needsBios;
  if (entry.needsUserFiles !== undefined && entry.needsUserFiles !== needsFiles) {
    say(ERROR, `${tag}: needsUserFiles disagrees with the manifest`,
      `index says ${entry.needsUserFiles}, manifest implies ${needsFiles}`);
  }
  const abis = manifest.targets.map((t) => `${t.requiresAbi.version}/${t.requiresAbi.minSize}`);
  if (entry.requiresAbi && !abis.includes(`${entry.requiresAbi.version}/${entry.requiresAbi.minSize}`)) {
    say(ERROR, `${tag}: requiresAbi disagrees with every target`,
      `index says ${entry.requiresAbi.version}/${entry.requiresAbi.minSize}, targets need ${abis.join(", ")}`);
  }

  const toolIds = new Set(manifest.tools.map((t) => t.id));
  if (toolIds.size !== manifest.tools.length) say(ERROR, `${tag}: duplicate tool ids`, "");

  for (const target of manifest.targets) {
    // A target's install set is its artifacts plus the outputs of the tools it
    // uses. Which half a file arrives from is a distribution detail: a project
    // may ship its files, or a converter may produce them from something the
    // user supplies. The rule below counts the whole set rather than the
    // shipped half.
    // JSON Schema could say these with if/then and oneOf; site/validate.js
    // deliberately implements only the keywords the schemas use, and a
    // conditional keyword set is a lot of machinery for two rules. They live
    // here instead, and spec/07-cores.md says so.
    if (target.kind === "core" && !(target.systems ?? []).length) {
      say(ERROR, `${tag}/${target.id}: a core declares no systems`,
        "kind is core, so systems[] must list at least one launcher tab");
    }
    if (target.kind === "homebrew" && target.systems !== undefined) {
      say(ERROR, `${tag}/${target.id}: a homebrew declares systems`,
        "systems[] belongs to a core; a homebrew is one program");
    }

    const sysIds = (target.systems ?? []).map((sys) => sys.id);
    const sysDupes = sysIds.filter((id, i) => sysIds.indexOf(id) !== i);
    if (sysDupes.length) {
      say(ERROR, `${tag}/${target.id}: duplicate system ids`, [...new Set(sysDupes)].join(", "));
    }

    for (const sys of target.systems ?? []) {
      for (const b of sys.bios ?? []) {
        const hasRequired = b.required !== undefined;
        const hasRequiredFor = b.requiredFor !== undefined;
        if (hasRequired === hasRequiredFor) {
          say(ERROR, `${tag}/${target.id}/${sys.id}: bios "${b.id}" states its requirement twice or not at all`,
            "exactly one of required or requiredFor");
        }
        // A slot that refuses anything it does not recognise, with nothing to
        // recognise, can never be filled.
        if (b.strict === true && !b.sha1) {
          say(ERROR, `${tag}/${target.id}/${sys.id}: bios "${b.id}" is strict with no hash`,
            "strict rejects every file when no sha1 is published");
        }
        for (const ext of b.requiredFor ?? []) {
          const known = (sys.extensions ?? []).some((e) =>
            Array.isArray(e) ? e.includes(ext) : e === ext);
          if (!known) {
            say(ERROR, `${tag}/${target.id}/${sys.id}: bios "${b.id}" is required for ${ext}`,
              `which this system does not accept`);
          }
        }
      }
    }

    // Names of everything that lands in the install set. A derived output has
    // no name here on purpose -- it is decided per converted file at install
    // time -- so it is counted but not named, or two derived outputs would
    // look like two files called `undefined`.
    const installed = target.artifacts.map((a) => a.filename);
    let derivedOutputs = 0;

    for (const use of target.uses ?? []) {
      const tool = manifest.tools.find((t) => t.id === use.tool);
      if (!tool) {
        say(ERROR, `${tag}/${target.id}: uses unknown tool "${use.tool}"`, "");
        continue;
      }
      for (const id of use.outputs) {
        const output = tool.outputs.find((o) => o.id === id);
        if (!output) {
          say(ERROR, `${tag}/${target.id}: tool "${use.tool}" has no output "${id}"`, "");
        } else if (output.filename !== undefined) {
          installed.push(output.filename);
        } else {
          derivedOutputs += 1;
        }
      }
    }

    if (installed.length === 0 && derivedOutputs === 0) {
      say(ERROR, `${tag}/${target.id}: installs nothing`,
        "a target needs at least one artifact or one used tool output");
    }

    const dupes = installed.filter((n, i) => installed.indexOf(n) !== i);
    if (dupes.length) {
      say(ERROR, `${tag}/${target.id}: two installed files share a name`, [...new Set(dupes)].join(", "));
    }

    out.targets.push({ ...target, installed });
  }

  // An offline bundle is optional, but a broken link to one is still a defect.
  if (entry.bundle) {
    const bundleUrl = new URL(entry.bundle, base).href;
    try {
      const h = await head(bundleUrl);
      say(h.ok ? OK : ERROR,
        h.ok ? `${tag}: offline bundle is available` : `${tag}: offline bundle is not reachable`,
        h.ok ? `${entry.bundle}${h.bytes ? ` — ${h.bytes} bytes` : ""}` : `${bundleUrl} — HTTP ${h.status}`);
    } catch (e) {
      say(ERROR, `${tag}: offline bundle could not be fetched`, `${bundleUrl} — ${e.message}`);
    }
  } else {
    say(WARN, `${tag}: no offline bundle`,
      "A bundle lets the release be installed if this project disappears");
  }

  const files = [];
  for (const target of manifest.targets) {
    for (const a of target.artifacts) files.push({ what: `${target.id}/${a.filename}`, ...a });
    // A BIOS the project ships is a published file: it installs to
    // /bios/<biosDir or id>/, which is derived, never declared.
    for (const sys of target.systems ?? []) {
      for (const b of sys.bios ?? []) {
        if (!b.url) continue;
        files.push({ what: `${sys.id}/${b.url} (bios)`, ...b, filename: b.url });
      }
    }
    // Published and hashed like an artifact, but never installed.
    for (const sym of target.symbols ?? []) {
      files.push({ what: `${target.id}/${sym.filename} (symbols)`, ...sym });
    }
  }
  // Full-size box art, published beside the manifest. Nothing installs it --
  // it is there for a launcher or a catalogue that wants better art than the
  // thumbnail the binary carries.
  if (manifest.cover) {
    files.push({ what: `${manifest.cover.filename} (cover)`, ...manifest.cover });
  }
  // Two declared names that fold together are one file on the card. The card
  // is FAT or exFAT and case-folds; we are not the ones writing to it, but a
  // manifest that declares such a pair is broken before any host sees it.
  // Grouped by where each file lands, because two different directories
  // cannot collide.
  for (const target of manifest.targets) {
    const byDir = new Map();
    const place = (dir, name, what) => {
      if (!byDir.has(dir)) byDir.set(dir, new Map());
      const seen = byDir.get(dir);
      const key = name.toLowerCase();
      if (seen.has(key)) {
        say(ERROR, `${tag}: ${target.id} declares two files that are one file on the card`,
          `${dir}: "${seen.get(key)}" and "${name}" differ only in case`);
      } else {
        seen.set(key, name);
      }
    };
    const home = target.kind === "core" ? "cores/" : "homebrews/";
    for (const a of target.artifacts ?? []) place(home, a.filename, "artifact");
    for (const sys of target.systems ?? []) {
      for (const b of sys.bios ?? []) {
        const names = Array.isArray(b.filename) ? b.filename : [b.filename];
        for (const n of names) place(`bios/${sys.biosDir ?? sys.id}/`, n, "bios");
      }
    }
    // A fixed output installs beside the binary for a homebrew, and into the
    // system's ROM folder for a core. A derived name is not knowable here.
    for (const use of target.uses ?? []) {
      const tool = manifest.tools.find((t) => t.id === use.tool);
      for (const id of use.outputs ?? []) {
        const out = (tool?.outputs ?? []).find((o) => o.id === id);
        if (!out?.filename) continue;
        const dir = target.kind === "core"
          ? `roms/${use.system ?? (target.systems ?? [])[0]?.id}/`
          : home;
        place(dir, out.filename, "output");
      }
    }
  }

  // dataDir moves a homebrew's data, and a core's output placement already
  // follows from systems[]. Allowing both would give two answers for one file.
  for (const target of manifest.targets) {
    if (target.dataDir !== undefined && target.kind !== "homebrew") {
      say(ERROR, `${tag}: ${target.id} declares dataDir on a ${target.kind}`,
        "dataDir is homebrew-only; a core's output goes to roms/<system id>/");
    }
  }
  // A subdir with nothing to be relative to is a path the installer cannot
  // resolve: it would land beside the binary, which is not what was meant.
  for (const target of manifest.targets) {
    if (target.dataDir !== undefined) continue;
    for (const use of target.uses ?? []) {
      const tool = manifest.tools.find((t) => t.id === use.tool);
      for (const id of use.outputs ?? []) {
        const out = (tool?.outputs ?? []).find((o) => o.id === id);
        if (out?.subdir !== undefined) {
          say(ERROR, `${tag}: ${target.id} uses ${use.tool}/${id} with a subdir but declares no dataDir`,
            `subdir "${out.subdir}" is relative to dataDir, which is absent`);
        }
      }
    }
  }

  // Cross-field rules JSON Schema cannot state.
  for (const tool of manifest.tools) {
    for (const inp of tool.inputs ?? []) {
      if (inp.runPerFile && !inp.allowMultiple) {
        say(ERROR, `${tag}: ${tool.id}/${inp.id} converts each file but takes only one`,
          "runPerFile needs allowMultiple: a single-file slot has nothing to iterate");
      }
      if (inp.maxCount !== undefined && !inp.allowMultiple) {
        say(ERROR, `${tag}: ${tool.id}/${inp.id} caps a count it cannot have`,
          "maxCount without allowMultiple");
      }
    }
    // A derived name comes from the file being converted, so exactly one input
    // has to be the thing being iterated.
    const perFile = (tool.inputs ?? []).filter((i) => i.runPerFile);
    const derived = (tool.outputs ?? []).filter((o) => o.extension !== undefined);
    if (derived.length && perFile.length !== 1) {
      say(ERROR, `${tag}: ${tool.id} derives an output name from no single input`,
        `${derived.length} derived output(s), ${perFile.length} input(s) with runPerFile`);
    }
    if (!derived.length && perFile.length) {
      say(WARN, `${tag}: ${tool.id} converts each file but names every output itself`,
        "Every run would write the same filename, so only the last survives");
    }
    out.tools.push(tool);
    files.push({ what: `${tool.id}/${tool.binary.file}`, ...tool.binary, filename: tool.binary.file });
  }

  for (const f of files) {
    const fileUrl = new URL(f.url, url).href;
    try {
      const h = await head(fileUrl);
      if (!h.ok) {
        say(ERROR, `${tag}: ${f.what} is not reachable`, `${fileUrl} — HTTP ${h.status}`);
        continue;
      }
      if (h.bytes !== null && f.bytes !== undefined && h.bytes !== f.bytes) {
        say(ERROR, `${tag}: ${f.what} is not the declared size`,
          `declared ${f.bytes}, served ${h.bytes}`);
        continue;
      }
      if (!opts.hash) {
        say(OK, `${tag}: ${f.what} is reachable`, `${f.bytes ?? h.bytes} bytes`);
        continue;
      }
      const res = await fetch(fileUrl, { cache: "no-store" });
      const body = await res.arrayBuffer();
      // fetch decompresses, so this is the real size even when HEAD could not
      // tell us one.
      if (f.bytes !== undefined && body.byteLength !== f.bytes) {
        say(ERROR, `${tag}: ${f.what} is not the declared size`,
          `declared ${f.bytes}, downloaded ${body.byteLength}`);
        continue;
      }
      const got = await sha256(body);
      if (got !== f.sha256) {
        say(ERROR, `${tag}: ${f.what} does not match its sha256`, `served ${got.slice(0, 16)}…`);
      } else {
        say(OK, `${tag}: ${f.what} matches its sha256`, `${f.bytes} bytes`);
      }
    } catch (e) {
      say(ERROR, `${tag}: ${f.what} could not be fetched`, `${fileUrl} — ${e.message}`);
    }
  }

  return out;
}

function summarise(checks) {
  const n = (level) => checks.filter((c) => c.level === level).length;
  return { errors: n(ERROR), warnings: n(WARN), passed: n(OK), conformant: n(ERROR) === 0 };
}
