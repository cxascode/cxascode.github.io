import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AboutCxAsCode from "./AboutCxAsCode.jsx";
import DependencyNote from "./DependencyNote.jsx";
import OrderOfOperationsDialog from "./OrderOfOperationsDialog.jsx";
import overrides from "./overrides.json";
import {
  buildTfExportAttributes,
  resolveTfExportResourceName,
} from "./tfExportTemplate.js";
import { buildTerraformRegistryDocsUrl } from "./terraformRegistry.js";
import {
  DIVISION_FILTER_ALL,
  DIVISION_FILTER_AWARE,
  DIVISION_FILTER_NOT_AWARE,
  isDivisionAwareByDependencies,
  matchesDivisionFilter,
} from "./divisionAware.js";

const INDEX_URL = `${import.meta.env.BASE_URL}dependency-tree-json/index.json`;
const LATEST_URL = `${import.meta.env.BASE_URL}dependency-tree-json/latest.json`;
const VERSION_URL = (v) => `${import.meta.env.BASE_URL}dependency-tree-json/${v}.json`;

const READ_WRITE_ROLE_URL =
  `${import.meta.env.BASE_URL}resource-permissions-tf/latest-read-write-role.tf`;
const READ_ONLY_ROLE_URL =
  `${import.meta.env.BASE_URL}resource-permissions-tf/latest-read-only-role.tf`;

const VERSIONED_READ_WRITE_ROLE_URL = (v) =>
  `${import.meta.env.BASE_URL}resource-permissions-tf/${v}-read-write-role.tf`;
const VERSIONED_READ_ONLY_ROLE_URL = (v) =>
  `${import.meta.env.BASE_URL}resource-permissions-tf/${v}-read-only-role.tf`;

const SPREADSHEET_TEMPLATE_URL =
  `${import.meta.env.BASE_URL}spreadsheet-templates/latest-cx-as-code-template.xlsx`;
const VERSIONED_SPREADSHEET_TEMPLATE_URL = (v) =>
  `${import.meta.env.BASE_URL}spreadsheet-templates/${v}-cx-as-code-template.xlsx`;

const MIN_DEPENDENCY_VERSION = "1.60.0";
const MIN_ROLE_DOWNLOAD_VERSION = "1.76.0";

const VERSION_PICKER_TOOLTIP = `Dependencies - v${MIN_DEPENDENCY_VERSION}+, Permissions - v${MIN_ROLE_DOWNLOAD_VERSION}+`;

function normalizeType(s) {
  return (s || "").trim();
}

/** Query param used for shareable links to a selected resource type (?type=...) */
const TYPE_QUERY_KEY = "type";

function readTypeFromSearch() {
  try {
    const raw = new URLSearchParams(window.location.search).get(TYPE_QUERY_KEY);
    return normalizeType(raw);
  } catch {
    return "";
  }
}

function replaceUrlForActiveType(activeType) {
  try {
    const url = new URL(window.location.href);
    const typed = normalizeType(activeType);
    if (typed) url.searchParams.set(TYPE_QUERY_KEY, typed);
    else url.searchParams.delete(TYPE_QUERY_KEY);
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      history.replaceState(null, "", next);
    }
  } catch {
    /* ignore invalid URLs */
  }
}

function buildResourceTypePermalink(resourceType) {
  try {
    const url = new URL(window.location.href);
    const typed = normalizeType(resourceType);
    if (typed) url.searchParams.set(TYPE_QUERY_KEY, typed);
    else url.searchParams.delete(TYPE_QUERY_KEY);
    return url.toString();
  } catch {
    return "";
  }
}

function sortAlpha(arr) {
  return arr
    .filter((x) => typeof x === "string")
    .sort((a, b) => a.localeCompare(b));
}

function moveResourceListSelection(filteredTypes, activeType, direction) {
  if (!filteredTypes.length) return "";

  const currentIndex = activeType ? filteredTypes.indexOf(activeType) : -1;

  if (direction === "down") {
    if (currentIndex < 0) return filteredTypes[0];
    return filteredTypes[(currentIndex + 1) % filteredTypes.length];
  }

  if (direction === "up") {
    if (currentIndex < 0) return filteredTypes[filteredTypes.length - 1];
    return filteredTypes[(currentIndex - 1 + filteredTypes.length) % filteredTypes.length];
  }

  if (direction === "home") return filteredTypes[0];
  if (direction === "end") return filteredTypes[filteredTypes.length - 1];

  return activeType;
}

function isResourceListNavKey(key) {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

function compareVersions(a, b) {
  const aParts = String(a)
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);

  const bParts = String(b)
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);

  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i += 1) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;

    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
}

function isRoleDownloadSupported(version) {
  if (!version || version === "latest") return false;
  return compareVersions(version, MIN_ROLE_DOWNLOAD_VERSION) >= 0;
}

/** index.json may only list semver trees; exclude bundled filenames if present. */
function firstReleaseVersionInIndex(versions) {
  if (!Array.isArray(versions)) return "";
  const found = versions.find(
    (v) => typeof v === "string" && v.trim() && v !== "latest" && v !== "index"
  );
  return found ? found.trim() : "";
}

/**
 * Apply optional overrides to a dependency tree JSON.
 *
 * overrides.json (src/overrides.json, bundled at build time) shape:
 * {
 *   "addDependencies": {
 *     "<resource_type>": ["other_type", ...]
 *   },
 *   "replaceDependencies": {
 *     "<resource_type>": {
 *       "<bad_dep_type>": "<correct_dep_type>"
 *     }
 *   },
 *   "tfExportResourceNames": {
 *     "<resource_type>": "Genesys Cloud resource name"
 *   },
 *   "tfExportNote": "Markdown note shown in the genesyscloud_tf_export template panel when a type is selected",
 *   "dependencyNotes": {
 *     "<resource_type>": "Markdown note shown in Resource Type Details"
 *   },
 *   "guiMenuPaths": {
 *     "<resource_type>": "Admin > Menu > Path"
 *   },
 *   "hiddenResourceTypes": ["genesyscloud_bcp_tf_exporter", ...]
 *   "spreadsheetScopePrefixes": {
 *     "In scope - ": ["genesyscloud_flow", "genesyscloud_script"]
 *   }
 * }
 *
 * Behavior:
 * - addDependencies: union the dependencies list (no duplicates).
 * - replaceDependencies: string-replace dependency entries for a given resource_type.
 * - If a resource_type is not present in the JSON, it is ignored (no auto-create).
 */
function applyOverrides(raw, overrides) {
  if (!raw || !Array.isArray(raw.resources)) return raw;
  if (!overrides || typeof overrides !== "object") return raw;

  const patched = {
    ...raw,
    resources: raw.resources.map((r) => ({ ...r })),
  };

  const byType = new Map();
  for (const r of patched.resources) {
    if (r && typeof r.type === "string") byType.set(r.type, r);
  }

  const replace = overrides.replaceDependencies;
  if (replace && typeof replace === "object") {
    for (const [type, mapping] of Object.entries(replace)) {
      const r = byType.get(type);
      if (!r || !Array.isArray(r.dependencies) || typeof mapping !== "object") continue;

      r.dependencies = r.dependencies.map((d) =>
        typeof d === "string" ? mapping[d] || d : d
      );
    }
  }

  const add = overrides.addDependencies;
  if (add && typeof add === "object") {
    for (const [type, additions] of Object.entries(add)) {
      if (!Array.isArray(additions)) continue;

      const r = byType.get(type);
      if (!r) continue;

      const current = Array.isArray(r.dependencies) ? r.dependencies : [];
      const set = new Set(current.filter((d) => typeof d === "string"));

      for (const dep of additions) {
        if (typeof dep === "string" && dep.trim()) set.add(dep.trim());
      }

      r.dependencies = [...set];
    }
  }

  return patched;
}

function resolveTfExportNote(overrides) {
  const note = overrides?.tfExportNote;
  return typeof note === "string" ? note.trim() : "";
}

function resolveDependencyNote(resourceType, overrides) {
  const type = (resourceType || "").trim();
  if (!type) return "";

  const notes = overrides?.dependencyNotes;
  if (!notes || typeof notes !== "object") return "";

  const note = notes[type];
  return typeof note === "string" ? note.trim() : "";
}

function resolveGuiMenuPath(resourceType, overrides) {
  const type = (resourceType || "").trim();
  if (!type) return "";

  const paths = overrides?.guiMenuPaths;
  if (!paths || typeof paths !== "object") return "";

  const path = paths[type];
  return typeof path === "string" ? path.trim() : "";
}

function getHiddenResourceTypes(overrides) {
  const hidden = overrides?.hiddenResourceTypes;
  if (!Array.isArray(hidden)) return new Set();

  return new Set(
    hidden
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
  );
}

function buildDepsMaps(raw) {
  const depsMap = new Map();
  const reverseMap = new Map();

  if (!raw || !Array.isArray(raw.resources)) {
    return { depsMap, reverseMap };
  }

  for (const r of raw.resources) {
    if (!r || typeof r.type !== "string") continue;

    const from = r.type;
    const deps = Array.isArray(r.dependencies) ? r.dependencies : [];

    if (!depsMap.has(from)) depsMap.set(from, new Set());

    for (const d of deps) {
      if (typeof d !== "string") continue;
      depsMap.get(from).add(d);
      if (!reverseMap.has(d)) reverseMap.set(d, new Set());
      reverseMap.get(d).add(from);
    }

    if (!reverseMap.has(from)) reverseMap.set(from, new Set());
  }

  return { depsMap, reverseMap };
}

export default function App() {
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState("latest");

  const [raw, setRaw] = useState(null);

  const [query, setQuery] = useState("");
  const [divisionFilter, setDivisionFilter] = useState(DIVISION_FILTER_ALL);
  const [selectedType, setSelectedType] = useState("");

  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const versionDropdownRef = useRef(null);
  const searchRef = useRef(null);
  const listBodyRef = useRef(null);
  const selectedVersionRef = useRef("latest");
  /** Skip one URL sync after applying ?type= from the address bar (avoids clearing the param before state catches up). */
  const skipNextUrlSyncRef = useRef(false);
  /** Only merge ?type= from the URL once per mount so later clears/version changes are not overwritten. */
  const hydratedFromUrlRef = useRef(false);

  useEffect(() => {
    selectedVersionRef.current = selectedVersion;
  }, [selectedVersion]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(INDEX_URL, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to fetch version index: ${res.status} ${res.statusText}`);
        }

        const json = await res.json();
        if (!Array.isArray(json)) {
          throw new Error("Version index is not an array");
        }

        if (!cancelled) setAvailableVersions(json);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;

    const handler = (evt) => {
      const next = evt?.target?.value ?? evt?.detail?.value ?? "";
      const normalizedNext = next || "latest";

      if (normalizedNext === selectedVersionRef.current) return;
      setSelectedVersion(normalizedNext);
    };

    el.addEventListener("guxchange", handler);
    el.addEventListener("change", handler);

    return () => {
      el.removeEventListener("guxchange", handler);
      el.removeEventListener("change", handler);
    };
  }, []);

  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;

    if (el.value !== selectedVersion) {
      el.value = selectedVersion;
    }
    el.setAttribute("value", selectedVersion);
  }, [selectedVersion]);

  useEffect(() => {
    if (loadingIndex) return;

    const el = versionDropdownRef.current;
    if (!el) return;

    if (el.value !== selectedVersion) {
      el.value = selectedVersion;
    }
    el.setAttribute("value", selectedVersion);
  }, [loadingIndex, selectedVersion]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadingData(true);
        setError("");

        const depsUrl =
          selectedVersion === "latest" ? LATEST_URL : VERSION_URL(selectedVersion);

        const depsRes = await fetch(depsUrl, { cache: "no-store" });

        if (!depsRes.ok) {
          throw new Error(
            `Failed to fetch dependency tree: ${depsRes.status} ${depsRes.statusText}`
          );
        }

        const json = await depsRes.json();
        const patched = applyOverrides(json, overrides);

        if (!cancelled) {
          setRaw(patched);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedVersion]);

  const { depsMap, reverseMap } = useMemo(() => buildDepsMaps(raw), [raw]);

  const hiddenTypes = useMemo(() => getHiddenResourceTypes(overrides), []);

  const allTypes = useMemo(() => {
    const s = new Set([...depsMap.keys(), ...reverseMap.keys()]);
    return sortAlpha([...s].filter((t) => !hiddenTypes.has(t)));
  }, [depsMap, reverseMap, hiddenTypes]);

  const divisionFilteredTypes = useMemo(
    () => allTypes.filter((t) => matchesDivisionFilter(t, depsMap, divisionFilter)),
    [allTypes, depsMap, divisionFilter]
  );

  const filteredTypes = useMemo(() => {
    const q = normalizeType(query).toLowerCase();
    return q
      ? divisionFilteredTypes.filter((t) => t.toLowerCase().includes(q))
      : divisionFilteredTypes;
  }, [divisionFilteredTypes, query]);

  const activeType = useMemo(() => {
    if (!selectedType) return "";
    return filteredTypes.includes(selectedType) ? selectedType : "";
  }, [filteredTypes, selectedType]);

  useEffect(() => {
    if (!selectedType) return;
    if (!filteredTypes.includes(selectedType)) {
      setSelectedType("");
    }
  }, [filteredTypes, selectedType]);

  useEffect(() => {
    if (!allTypes.length || hydratedFromUrlRef.current) return;
    hydratedFromUrlRef.current = true;

    const fromUrl = readTypeFromSearch();
    if (fromUrl && allTypes.includes(fromUrl)) {
      skipNextUrlSyncRef.current = true;
      setSelectedType(fromUrl);
    } else if (fromUrl) {
      replaceUrlForActiveType("");
      setSelectedType("");
      setQuery("");
    }
  }, [allTypes]);

  useEffect(() => {
    if (!allTypes.length) return;
    if (skipNextUrlSyncRef.current) {
      skipNextUrlSyncRef.current = false;
      return;
    }
    replaceUrlForActiveType(activeType);
  }, [activeType, allTypes]);

  const dependsOn = useMemo(
    () => (activeType ? sortAlpha([...(depsMap.get(activeType) || [])]) : []),
    [depsMap, activeType]
  );

  const isDivisionAware = useMemo(
    () => isDivisionAwareByDependencies(dependsOn),
    [dependsOn]
  );

  const dependencyNote = useMemo(
    () => resolveDependencyNote(activeType, overrides),
    [activeType]
  );

  const guiMenuPath = useMemo(
    () => resolveGuiMenuPath(activeType, overrides),
    [activeType]
  );

  const tfExportResourceName = useMemo(
    () => resolveTfExportResourceName(activeType, overrides),
    [activeType]
  );

  const tfExportNote = useMemo(() => resolveTfExportNote(overrides), []);

  const tfExportTemplate = useMemo(
    () =>
      activeType ? buildTfExportAttributes(activeType, dependsOn, tfExportResourceName) : "",
    [activeType, dependsOn, tfExportResourceName]
  );

  const terraformRegistryDocsUrl = useMemo(
    () => (activeType ? buildTerraformRegistryDocsUrl(activeType, selectedVersion) : ""),
    [activeType, selectedVersion]
  );

  const resourceTypePermalink = useMemo(
    () => (activeType ? buildResourceTypePermalink(activeType) : ""),
    [activeType]
  );

  const [copyState, setCopyState] = useState("idle");
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);

  const dependencyFor = useMemo(
    () => (activeType ? sortAlpha([...(reverseMap.get(activeType) || [])]) : []),
    [reverseMap, activeType]
  );

  const newestListedRelease = useMemo(
    () => firstReleaseVersionInIndex(availableVersions),
    [availableVersions]
  );

  const effectiveVersion =
    selectedVersion === "latest" ? newestListedRelease : selectedVersion;

  const roleDownloadsSupported = isRoleDownloadSupported(effectiveVersion);

  const readWriteRoleHref =
    selectedVersion === "latest"
      ? READ_WRITE_ROLE_URL
      : VERSIONED_READ_WRITE_ROLE_URL(selectedVersion);

  const readOnlyRoleHref =
    selectedVersion === "latest"
      ? READ_ONLY_ROLE_URL
      : VERSIONED_READ_ONLY_ROLE_URL(selectedVersion);

  const downloadVersionLabel = effectiveVersion || selectedVersion || "unknown";
  const readWriteDownloadName = `read-write-role-${downloadVersionLabel}.tf`;
  const readOnlyDownloadName = `read-only-role-${downloadVersionLabel}.tf`;
  const spreadsheetTemplateHref =
    selectedVersion === "latest"
      ? SPREADSHEET_TEMPLATE_URL
      : VERSIONED_SPREADSHEET_TEMPLATE_URL(selectedVersion);
  const spreadsheetDownloadName = `cx-as-code-template-${downloadVersionLabel}.xlsx`;

  const downloadSpreadsheetTemplate = useCallback(() => {
    const anchor = document.createElement("a");
    anchor.href = spreadsheetTemplateHref;
    anchor.download = spreadsheetDownloadName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [spreadsheetDownloadName, spreadsheetTemplateHref]);

  const clearSearch = () => {
    setQuery("");
    setDivisionFilter(DIVISION_FILTER_ALL);
    setSelectedType("");
    searchRef.current?.focus();
  };

  const handleResourceListKeyDown = useCallback(
    (event) => {
      if (!isResourceListNavKey(event.key) || !filteredTypes.length) return;

      event.preventDefault();

      let direction = "";
      if (event.key === "ArrowDown") direction = "down";
      else if (event.key === "ArrowUp") direction = "up";
      else if (event.key === "Home") direction = "home";
      else if (event.key === "End") direction = "end";

      const nextType = moveResourceListSelection(filteredTypes, activeType, direction);
      if (nextType) setSelectedType(nextType);
    },
    [activeType, filteredTypes]
  );

  useEffect(() => {
    if (!activeType || !listBodyRef.current) return;

    const row = listBodyRef.current.querySelector(
      `[data-resource-type="${CSS.escape(activeType)}"]`
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [activeType, filteredTypes]);

  useEffect(() => {
    setCopyState("idle");
  }, [activeType, tfExportTemplate]);

  const copyTfExportTemplate = async () => {
    if (!tfExportTemplate) return;

    try {
      await navigator.clipboard.writeText(tfExportTemplate);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const showInitialLoading = loadingData && raw === null;

  const resourceListCountLabel = useMemo(() => {
    if (error) return "";
    if (showInitialLoading) return "Loading resource types…";

    const total = allTypes.length;
    const pool = divisionFilteredTypes.length;
    const filtered = filteredTypes.length;
    const hasSearch = Boolean(normalizeType(query));
    const hasDivisionFilter = Boolean(divisionFilter);

    if (!total) return "No resource types";

    const poolLabel =
      divisionFilter === DIVISION_FILTER_AWARE
        ? "division-aware resource types"
        : divisionFilter === DIVISION_FILTER_NOT_AWARE
          ? "non-division-aware resource types"
          : "resource types";

    if (hasSearch) {
      if (!filtered) {
        if (hasDivisionFilter) return `No matches among ${pool} ${poolLabel}`;
        return `No matches among ${total} resource types`;
      }
      if (hasDivisionFilter) {
        return filtered === pool
          ? `${filtered} ${poolLabel}`
          : `${filtered} of ${pool} ${poolLabel}`;
      }
      return filtered === total
        ? filtered === 1
          ? "1 resource type"
          : `${filtered} resource types`
        : `${filtered} of ${total} resource types`;
    }

    if (hasDivisionFilter) {
      return pool === 1 ? `1 ${poolLabel}` : `${pool} ${poolLabel}`;
    }

    return total === 1 ? "1 resource type" : `${total} resource types`;
  }, [
    error,
    showInitialLoading,
    allTypes.length,
    divisionFilteredTypes.length,
    filteredTypes.length,
    query,
    divisionFilter,
  ]);

  return (
    <div className="gcShell">
      <div className="gcPageHeader">
        <div className="gcPageTitleRow">
          <div className="gcPageTitleGroup">
            <h1 className="gcPageTitle">CX as Code Explorer</h1>
            <AboutCxAsCode />
          </div>

          <div className="gcPageMeta">
            <button
              type="button"
              className="gcHeaderLink"
              onClick={() => setOrderDialogOpen(true)}
              disabled={showInitialLoading || !!error || !raw}
              title="Suggested creation order of CX as Code resources"
            >
              Order of operations
            </button>

            <div
              className={`gcRoleDownloads ${roleDownloadsSupported ? "isVisible" : "isHidden"}`}
              aria-hidden={!roleDownloadsSupported}
            >
              <button
                type="button"
                className="gcMetaLabel gcMetaLabelButton"
                title="Starting-point roles — adjust permissions for your org before use."
                onClick={downloadSpreadsheetTemplate}
                tabIndex={roleDownloadsSupported ? 0 : -1}
              >
                Role Template Download:
              </button>

              <div className="gcHeaderLinks">
                <a
                  className="gcHeaderLink"
                  href={readWriteRoleHref}
                  download={readWriteDownloadName}
                  tabIndex={roleDownloadsSupported ? 0 : -1}
                >
                  Read/Write .tf
                </a>
                <a
                  className="gcHeaderLink"
                  href={readOnlyRoleHref}
                  download={readOnlyDownloadName}
                  tabIndex={roleDownloadsSupported ? 0 : -1}
                >
                  Read-only .tf
                </a>
              </div>
            </div>

            <div className="gcVersionPicker">
              <span className="gcMetaLabel" title={VERSION_PICKER_TOOLTIP}>
                Version:
              </span>
              <gux-dropdown ref={versionDropdownRef} disabled={loadingIndex}>
                <gux-listbox>
                  <gux-option value="latest">
                    Latest {newestListedRelease ? `(${newestListedRelease})` : ""}
                  </gux-option>

                  {availableVersions.map((v) => (
                    <gux-option key={v} value={v}>
                      {v}
                    </gux-option>
                  ))}
                </gux-listbox>
              </gux-dropdown>
            </div>
          </div>
        </div>
      </div>

      <main className="gcContentArea">
        {error ? (
          <div className="gcAlert" role="alert">
            <div className="gcAlert__title">Something broke</div>
            <div className="gcAlert__body gcMono">{error}</div>
          </div>
        ) : null}

        <div className="gcSplit">
          <section className="gcCard">
            <div className="gcCard__toolbar">
              <div className="gcToolbarRow">
                <input
                  ref={searchRef}
                  type="search"
                  className="gcSearchInput"
                  placeholder="Search resource types"
                  value={query}
                  onInput={(e) => {
                    setQuery(e.target.value);
                    setSelectedType("");
                  }}
                  onKeyDown={handleResourceListKeyDown}
                  disabled={showInitialLoading || !!error}
                />

                <button
                  type="button"
                  className="gcClearButton"
                  onClick={clearSearch}
                  disabled={
                    showInitialLoading ||
                    !!error ||
                    (!query && !selectedType && !divisionFilter)
                  }
                >
                  Clear
                </button>
              </div>
            </div>

            <div
              ref={listBodyRef}
              className="gcTable__body"
              role="listbox"
              aria-label="Resource types"
              tabIndex={0}
              onKeyDown={handleResourceListKeyDown}
            >
              {showInitialLoading ? (
                <div className="gcEmptyRow">Loading dependency data...</div>
              ) : null}

              {!showInitialLoading &&
                filteredTypes.map((t) => (
                  <button
                    key={t}
                    data-resource-type={t}
                    className={`gcTr ${t === activeType ? "isActive" : ""}`}
                    onClick={() => {
                      setSelectedType(t);
                      listBodyRef.current?.focus();
                    }}
                    onKeyDown={handleResourceListKeyDown}
                    type="button"
                    role="option"
                    aria-selected={t === activeType}
                  >
                    <div className="gcTd gcMono">{t}</div>
                  </button>
                ))}

              {!showInitialLoading && filteredTypes.length === 0 ? (
                <div className="gcEmptyRow">No matches.</div>
              ) : null}
            </div>

            {!error ? (
              <div className="gcListFooter">
                {resourceListCountLabel ? (
                  <p className="gcListCount" aria-live="polite">
                    {resourceListCountLabel}
                  </p>
                ) : (
                  <span className="gcListCount" aria-hidden="true" />
                )}
                <div className="gcDivisionFilterBlock">
                  <span className="gcDivisionFilterLabel" id="division-filter-label">
                    Show Division-aware
                  </span>
                  <div
                    className="gcSegmentedControl"
                    role="radiogroup"
                    aria-labelledby="division-filter-label"
                    title="Filter by division-aware heuristic (genesyscloud_auth_division in Depends on)"
                  >
                    <button
                      type="button"
                      className="gcSegmentedControl__option"
                      role="radio"
                      aria-checked={divisionFilter === DIVISION_FILTER_NOT_AWARE}
                      disabled={showInitialLoading || !!error}
                      title="Non-division-aware only"
                      onClick={() => {
                        setDivisionFilter(DIVISION_FILTER_NOT_AWARE);
                        setSelectedType("");
                      }}
                    >
                      <svg
                        className="gcSegmentedControl__icon"
                        viewBox="0 0 16 16"
                        width="14"
                        height="14"
                        aria-hidden="true"
                      >
                        <path
                          d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="gcVisuallyHidden">Non-division-aware only</span>
                    </button>
                    <button
                      type="button"
                      className="gcSegmentedControl__option"
                      role="radio"
                      aria-checked={divisionFilter === DIVISION_FILTER_ALL}
                      disabled={showInitialLoading || !!error}
                      title="All resource types"
                      onClick={() => {
                        setDivisionFilter(DIVISION_FILTER_ALL);
                        setSelectedType("");
                      }}
                    >
                      <span className="gcVisuallyHidden">All resource types</span>
                    </button>
                    <button
                      type="button"
                      className="gcSegmentedControl__option"
                      role="radio"
                      aria-checked={divisionFilter === DIVISION_FILTER_AWARE}
                      disabled={showInitialLoading || !!error}
                      title="Division-aware only"
                      onClick={() => {
                        setDivisionFilter(DIVISION_FILTER_AWARE);
                        setSelectedType("");
                      }}
                    >
                      <svg
                        className="gcSegmentedControl__icon"
                        viewBox="0 0 16 16"
                        width="14"
                        height="14"
                        aria-hidden="true"
                      >
                        <path
                          d="M3.5 8.2 6.6 11.3 12.5 5.4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="gcVisuallyHidden">Division-aware only</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="gcCard gcRightCard">
            <div className="gcCard__header">
              <div className="gcCard__titleRow">
                <h2 className="gcCard__title">Resource Type Details</h2>
                {activeType && terraformRegistryDocsUrl ? (
                  <a
                    className="gcDocsPill"
                    href={terraformRegistryDocsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${activeType} in the Terraform Registry (APIs and permissions)`}
                  >
                    Registry docs (APIs & permissions)
                  </a>
                ) : null}
              </div>
              <div className={`gcCard__subtitle ${activeType ? "gcCard__subtitle--hasResource" : ""}`}>
                {activeType ? (
                  <div className="gcResourceHeader">
                    <div className="gcResourceTypeLine">
                      <span className="gcResourceTypeGroup">
                        <code className="gcResourceTypeName">{activeType}</code>
                        <a
                          className="gcPermalinkAnchor"
                          href={resourceTypePermalink}
                          aria-label="Link to this resource type"
                          title="Link to this resource type"
                        >
                          <svg
                            className="gcPermalinkAnchor__icon"
                            viewBox="0 0 16 16"
                            width="16"
                            height="16"
                            aria-hidden="true"
                          >
                            <path
                              d="M6.2 8.8a2.2 2.2 0 0 0 3.1 0l1.9-1.9a2.2 2.2 0 1 0-3.1-3.1L7.2 4.6M9.8 7.2a2.2 2.2 0 0 0-3.1 0L4.8 9.1a2.2 2.2 0 0 0 3.1 3.1l1.9-1.9"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </a>
                      </span>
                      {isDivisionAware ? (
                        <span
                          className="gcDivisionBadge"
                          title="Depends on genesyscloud_auth_division — heuristic for division_id in Registry docs; confirm there if unsure."
                        >
                          Division aware
                        </span>
                      ) : null}
                    </div>
                    <div className="gcMenuPathBlock" aria-label="Genesys Cloud admin menu path">
                      <div className="gcMenuPath__label">Menu path</div>
                      <div className="gcMenuPath__value">
                        {guiMenuPath ? (
                          <span className="gcMenuPath__crumbs">
                            {guiMenuPath.split(">").map((segment, index) => (
                              <React.Fragment key={`${segment}-${index}`}>
                                {index > 0 ? (
                                  <span className="gcMenuPath__sep" aria-hidden="true">
                                    ›
                                  </span>
                                ) : null}
                                <span>{segment.trim()}</span>
                              </React.Fragment>
                            ))}
                          </span>
                        ) : (
                          <span className="gcMenuPath__empty">TBD</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  "Pick a resource type"
                )}
              </div>
            </div>

            <div className="gcDetailsGrid">
              <div className="gcPanel">
                <div className="gcPanel__header">
                  <div className="gcPanel__title">Depends on</div>
                  <gux-badge>{dependsOn.length}</gux-badge>
                </div>
                <div className="gcPanel__body">
                  {activeType ? (
                    dependsOn.length ? (
                      dependsOn.map((t) => (
                        <button
                          key={t}
                          className="gcPill"
                          onClick={() => {
                            setSelectedType(t);
                          }}
                          type="button"
                        >
                          {t}
                        </button>
                      ))
                    ) : (
                      <div className="gcMuted">No dependencies found.</div>
                    )
                  ) : (
                    <div className="gcMuted">Select a type to view dependencies.</div>
                  )}
                </div>
              </div>

              <div className="gcPanel">
                <div className="gcPanel__header">
                  <div className="gcPanel__title">Dependency for</div>
                  <gux-badge>{dependencyFor.length}</gux-badge>
                </div>
                <div className="gcPanel__body">
                  {activeType ? (
                    dependencyFor.length ? (
                      dependencyFor.map((t) => (
                        <button
                          key={t}
                          className="gcPill"
                          onClick={() => {
                            setSelectedType(t);
                          }}
                          type="button"
                        >
                          {t}
                        </button>
                      ))
                    ) : (
                      <div className="gcMuted">Nothing depends on this.</div>
                    )
                  ) : (
                    <div className="gcMuted">Select a type to view reverse dependencies.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="gcExportTemplate">
              <div className="gcPanel">
                <div className="gcPanel__header">
                  <div className="gcPanel__title">genesyscloud_tf_export template</div>
                  <button
                    type="button"
                    className="gcCopyButton"
                    onClick={copyTfExportTemplate}
                    disabled={!tfExportTemplate}
                  >
                    {copyState === "copied"
                      ? "Copied"
                      : copyState === "failed"
                        ? "Copy failed"
                        : "Copy"}
                  </button>
                </div>
                <div className="gcPanel__body">
                  {activeType && tfExportTemplate ? (
                    <pre className="gcExportTemplate__code gcMono">{tfExportTemplate}</pre>
                  ) : (
                    <div className="gcMuted">
                      Select a type to generate export filters and datasource replacements.
                    </div>
                  )}
                  {activeType && tfExportNote ? (
                    <div className="gcExportTemplate__note">
                      <DependencyNote content={tfExportNote} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {activeType && dependencyNote ? (
              <div className="gcDependencyNote">
                <div className="gcPanel">
                  <div className="gcPanel__header">
                    <div className="gcPanel__title">Note</div>
                  </div>
                  <div className="gcPanel__body gcDependencyNote__body">
                    <DependencyNote content={dependencyNote} />
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>

      <footer className="gcFooter" role="contentinfo">
        <a
          className="gcFooterLink"
          href="https://www.genesys.com/customer-success/professional-services"
          target="_blank"
          rel="noreferrer"
        >
          Made with <span role="img" aria-label="love">❤️</span> by Genesys Professional Services
        </a>
      </footer>

      <OrderOfOperationsDialog
        open={orderDialogOpen}
        onClose={() => setOrderDialogOpen(false)}
        depsMap={depsMap}
        hiddenTypes={hiddenTypes}
        onSelectType={(type) => {
          setSelectedType(type);
          setQuery("");
          setDivisionFilter(DIVISION_FILTER_ALL);
        }}
      />
    </div>
  );
}