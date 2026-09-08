// A JSON Schema validator covering exactly the keywords the GWRG schemas use.
//
// Deliberately not Ajv: this file is loaded directly by a browser and by node,
// so it has no imports, no build step and nothing to keep in sync. If a schema
// grows a keyword that is not handled here, `validate` throws rather than
// silently passing it.

const HANDLED = new Set([
  "$schema", "$id", "$defs", "title", "description",
  "type", "const", "enum", "required", "properties", "additionalProperties",
  "propertyNames", "items", "minItems", "uniqueItems", "minLength", "maxLength", "pattern",
  "minProperties", "dependentRequired",
  "minimum", "maximum", "format", "$ref", "anyOf", "oneOf",
]);

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

function typeMatches(actual, want) {
  if (want === "number") return actual === "number" || actual === "integer";
  if (want === "integer") return actual === "integer";
  return actual === want;
}

function resolve(ref, root) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref: ${ref}`);
  let node = root;
  for (const part of ref.slice(2).split("/")) {
    node = node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (node === undefined) throw new Error(`unresolvable $ref: ${ref}`);
  }
  return node;
}

/**
 * @returns {string[]} human-readable errors; empty means valid.
 */
export function validate(instance, schema, root = schema, path = "") {
  const errors = [];
  const at = path || "(root)";

  for (const key of Object.keys(schema)) {
    if (!HANDLED.has(key)) throw new Error(`validator does not handle "${key}" at ${at}`);
  }

  if (schema.$ref) {
    return validate(instance, resolve(schema.$ref, root), root, path);
  }

  // A union of shapes. Needed because two fields are genuinely either a string
  // or a list: an extension entry (".cue" or [".cue", ".bin"]) and a BIOS
  // filename (one accepted name or several). Expressing that in the published
  // schema rather than in our own checker is the point -- a third party
  // validating with Ajv has to be able to reject a malformed one too.
  // Exactly one branch must match. Used where two fields are alternatives
  // rather than options: an output names itself or derives its name, never
  // both and never neither.
  if (schema.oneOf) {
    const matched = schema.oneOf.filter((sub) => validate(instance, sub, root, path).length === 0);
    if (matched.length !== 1) {
      errors.push(`${at}: must match exactly one of the alternatives, matched ${matched.length}`);
    }
  }

  if (schema.anyOf) {
    const attempts = schema.anyOf.map((sub) => validate(instance, sub, root, path));
    if (!attempts.some((errs) => errs.length === 0)) {
      const why = attempts.map((errs) => errs.join("; ")).join(" | ");
      return [`${at}: matches none of the allowed shapes (${why})`];
    }
  }

  const actual = typeOf(instance);

  if (schema.type && !typeMatches(actual, schema.type)) {
    return [`${at}: expected ${schema.type}, got ${actual}`];
  }
  if ("const" in schema && instance !== schema.const) {
    errors.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(instance)) {
    errors.push(`${at}: must be one of ${schema.enum.join(", ")}`);
  }

  if (actual === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(instance)) {
      errors.push(`${at}: ${JSON.stringify(instance)} does not match ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && instance.length < schema.minLength) {
      errors.push(`${at}: shorter than ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && instance.length > schema.maxLength) {
      errors.push(`${at}: longer than ${schema.maxLength}`);
    }
  }

  if (actual === "integer" || actual === "number") {
    if (schema.minimum !== undefined && instance < schema.minimum) {
      errors.push(`${at}: below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && instance > schema.maximum) {
      errors.push(`${at}: above maximum ${schema.maximum}`);
    }
  }

  if (actual === "array") {
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      errors.push(`${at}: needs at least ${schema.minItems} item(s)`);
    }
    if (schema.uniqueItems) {
      // Scalars only, which is all the schema asks for. Deep equality would be
      // a bigger promise than any field here needs.
      const seen = instance.map((v) => JSON.stringify(v));
      if (new Set(seen).size !== seen.length) {
        errors.push(`${at}: items must be unique`);
      }
    }
    if (schema.items) {
      instance.forEach((item, i) => {
        errors.push(...validate(item, schema.items, root, `${at}[${i}]`));
      });
    }
  }

  if (actual === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in instance)) errors.push(`${at}: missing required "${key}"`);
    }
    for (const [key, needed] of Object.entries(schema.dependentRequired ?? {})) {
      if (!(key in instance)) continue;
      for (const dep of needed) {
        if (!(dep in instance)) {
          errors.push(`${at}: "${key}" requires "${dep}"`);
        }
      }
    }
    if (schema.minProperties !== undefined
        && Object.keys(instance).length < schema.minProperties) {
      errors.push(`${at}: needs at least ${schema.minProperties} field(s)`);
    }
    if (schema.propertyNames?.pattern) {
      const re = new RegExp(schema.propertyNames.pattern);
      for (const key of Object.keys(instance)) {
        if (!re.test(key)) errors.push(`${at}: key ${JSON.stringify(key)} is not a language code`);
      }
    }
    for (const [key, value] of Object.entries(instance)) {
      const sub = schema.properties?.[key];
      if (sub) {
        errors.push(...validate(value, sub, root, `${at}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${at}: unexpected property "${key}"`);
      } else if (typeof schema.additionalProperties === "object") {
        errors.push(...validate(value, schema.additionalProperties, root, `${at}.${key}`));
      }
    }
  }

  return errors;
}
