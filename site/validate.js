// A JSON Schema validator covering exactly the keywords the GWRG schemas use.
//
// Deliberately not Ajv: this file is loaded directly by a browser and by node,
// so it has no imports, no build step and nothing to keep in sync. If a schema
// grows a keyword that is not handled here, `validate` throws rather than
// silently passing it.

const HANDLED = new Set([
  "$schema", "$id", "$defs", "title", "description",
  "type", "const", "enum", "required", "properties", "additionalProperties",
  "propertyNames", "items", "minItems", "minLength", "pattern",
  "minimum", "maximum", "format", "$ref",
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
