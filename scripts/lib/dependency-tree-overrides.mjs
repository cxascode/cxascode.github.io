export function getHiddenResourceTypes(overrides) {
  const hidden = overrides?.hiddenResourceTypes;
  if (!Array.isArray(hidden)) return new Set();

  return new Set(
    hidden
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function getDeprecatedResourceTypes(overrides) {
  const deprecated = overrides?.deprecatedResourceTypes;
  if (!Array.isArray(deprecated)) return new Set();

  return new Set(
    deprecated
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function applyOverrides(raw, overrides) {
  if (!raw || !Array.isArray(raw.resources)) return raw;
  if (!overrides || typeof overrides !== "object") return raw;

  const patched = {
    ...raw,
    resources: raw.resources.map((resource) => ({ ...resource })),
  };

  const byType = new Map();
  for (const resource of patched.resources) {
    if (resource && typeof resource.type === "string") {
      byType.set(resource.type, resource);
    }
  }

  const replace = overrides.replaceDependencies;
  if (replace && typeof replace === "object") {
    for (const [type, mapping] of Object.entries(replace)) {
      const resource = byType.get(type);
      if (
        !resource ||
        !Array.isArray(resource.dependencies) ||
        typeof mapping !== "object"
      ) {
        continue;
      }

      resource.dependencies = resource.dependencies.map((dependency) =>
        typeof dependency === "string" ? mapping[dependency] || dependency : dependency
      );
    }
  }

  const add = overrides.addDependencies;
  if (add && typeof add === "object") {
    for (const [type, additions] of Object.entries(add)) {
      if (!Array.isArray(additions)) continue;

      const resource = byType.get(type);
      if (!resource) continue;

      const current = Array.isArray(resource.dependencies) ? resource.dependencies : [];
      const set = new Set(current.filter((dependency) => typeof dependency === "string"));

      for (const dependency of additions) {
        if (typeof dependency === "string" && dependency.trim()) {
          set.add(dependency.trim());
        }
      }

      resource.dependencies = [...set];
    }
  }

  return patched;
}
