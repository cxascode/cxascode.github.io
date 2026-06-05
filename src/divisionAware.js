export const AUTH_DIVISION_RESOURCE_TYPE = "genesyscloud_auth_division";

export const DIVISION_FILTER_ALL = "";
export const DIVISION_FILTER_AWARE = "yes";
export const DIVISION_FILTER_NOT_AWARE = "no";

/** Heuristic: division-aware when Depends on includes genesyscloud_auth_division. */
export function isDivisionAwareByDependencies(dependencies) {
  if (!dependencies) return false;
  if (dependencies instanceof Set) {
    return dependencies.has(AUTH_DIVISION_RESOURCE_TYPE);
  }
  if (!Array.isArray(dependencies)) return false;
  return dependencies.includes(AUTH_DIVISION_RESOURCE_TYPE);
}

export function isDivisionAwareResourceType(resourceType, depsMap) {
  return isDivisionAwareByDependencies(depsMap?.get(resourceType));
}

export function matchesDivisionFilter(resourceType, depsMap, divisionFilter) {
  if (!divisionFilter || divisionFilter === DIVISION_FILTER_ALL) return true;

  const aware = isDivisionAwareResourceType(resourceType, depsMap);
  return divisionFilter === DIVISION_FILTER_AWARE ? aware : !aware;
}
