import { check, distBase, parseRepo } from "./check.js";

const form = document.getElementById("form");
const repoInput = document.getElementById("repo");
const hashInput = document.getElementById("hash");
const result = document.getElementById("result");

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  // Everything rendered here comes from a third-party file. Text only, never markup.
  if (text !== undefined) n.textContent = text;
  return n;
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = repoInput.value.trim();
  if (!raw) return;

  result.hidden = false;
  result.replaceChildren(el("p", "status", "Checking…"));

  let report;
  try {
    report = await check(raw, { hash: hashInput.checked });
  } catch (err) {
    result.replaceChildren(el("p", "bad", err.message));
    return;
  }

  history.replaceState(null, "", `?repo=${encodeURIComponent(raw)}`);
  render(report);
});

function render(r) {
  const out = document.createDocumentFragment();

  const { errors, warnings, passed, conformant } = r.summary;
  const banner = el("div", `banner ${conformant ? "good" : "bad"}`);
  banner.append(
    el("strong", null, conformant ? "Conformant" : "Not conformant"),
    el("span", null,
      `${passed} passed · ${errors} error${errors === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}`),
  );
  out.append(banner);

  const src = el("p", "muted");
  src.append(document.createTextNode("Read from "), el("code", null, r.base));
  out.append(src);

  for (const v of r.versions ?? []) {
    if (!v.manifest) continue;
    out.append(renderVersion(v));
  }

  const h = el("h2", null, "Checks");
  out.append(h);
  const list = el("ul", "checks");
  for (const c of r.checks) {
    const li = el("li", c.level);
    li.append(el("span", "label", c.label));
    if (c.detail) li.append(el("span", "detail", c.detail));
    list.append(li);
  }
  out.append(list);

  result.replaceChildren(out);
}

function renderVersion(v) {
  const m = v.manifest;
  const sec = el("section", "version");
  sec.append(el("h2", null, `${m.title} — ${v.tag}`));

  const meta = el("p", "muted",
    `${m.tools.length ? "needs a user-supplied file" : "no conversion needed"} · ` +
    `${m.targets.length} target${m.targets.length === 1 ? "" : "s"} · ` +
    `commit ${m.source.commit.slice(0, 10)}`);
  sec.append(meta);

  for (const t of v.targets) {
    const card = el("div", "card");
    card.append(el("h3", null, t.label));
    card.append(el("p", "muted",
      `${t.kind} · ${t.platform} · firmware ABI ${t.requiresAbi.version}, ` +
      `min size ${t.requiresAbi.minSize} bytes`));

    const files = el("ul", "files");
    for (const a of t.artifacts) {
      const li = el("li");
      li.append(el("code", null, a.filename));
      li.append(el("span", "tag", a.role));
      li.append(el("span", "tag", a.format));
      li.append(el("span", "muted", `${a.bytes.toLocaleString()} bytes`));
      files.append(li);
    }
    for (const use of t.uses ?? []) {
      const tool = m.tools.find((x) => x.id === use.tool);
      for (const id of use.outputs) {
        const o = tool?.outputs.find((x) => x.id === id);
        if (!o) continue;
        const li = el("li");
        li.append(el("code", null, o.filename));
        li.append(el("span", "tag", o.role));
        li.append(el("span", "tag derived", `from ${use.tool}`));
        if (!use.required) li.append(el("span", "muted", "optional"));
        files.append(li);
      }
    }
    card.append(files);
    sec.append(card);
  }

  for (const tool of m.tools) {
    const card = el("div", "card");
    card.append(el("h3", null, tool.title.en));
    card.append(el("p", "muted",
      `${tool.processor.type} ${tool.processor.version} · ` +
      `${tool.binary.bytes.toLocaleString()} bytes · ` +
      `max ${tool.limits.maxMemoryPages} pages`));

    const inputs = el("ul", "files");
    for (const i of tool.inputs) {
      const li = el("li");
      li.append(el("strong", null, i.label?.en ?? i.id));
      li.append(el("span", "tag", i.required ? "required" : "optional"));
      if (i.repeatable) li.append(el("span", "tag", "repeatable"));
      li.append(el("span", "muted",
        `${i.extensions.join(" ")} · ${(i.variants ?? []).length} known variant(s)`));
      inputs.append(li);
    }
    card.append(el("p", "sub", "Accepts"));
    card.append(inputs);

    if (tool.options?.length) {
      card.append(el("p", "sub", "Options"));
      const opts = el("ul", "files");
      for (const o of tool.options) {
        const li = el("li");
        li.append(el("strong", null, o.label.en));
        li.append(el("span", "muted", `bit ${o.bit}, default ${o.default}`));
        opts.append(li);
      }
      card.append(opts);
    }
    sec.append(card);
  }

  return sec;
}

const preset = new URLSearchParams(location.search).get("repo");
if (preset) {
  repoInput.value = preset;
  form.requestSubmit();
}
