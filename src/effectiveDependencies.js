/**
 * Dependencies that apply for export replace_with_datasource and spreadsheet
 * "possible dependencies" counts — excludes self-referential entries.
 */
export function effectiveDependencies(resourceType, dependencies) {
  const type = (resourceType || "").trim();
  if (!type) return [];

  return (Array.isArray(dependencies) ? dependencies : []).filter(
    (d) => typeof d === "string" && d.trim() && d.trim() !== type
  );
}
