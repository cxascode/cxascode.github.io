import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageTitle from "./PageTitle.jsx";
import DependencyNote from "./DependencyNote.jsx";
import OrderOfOperationsDialog from "./OrderOfOperationsDialog.jsx";
import ProviderEnvVarsDialog from "./ProviderEnvVarsDialog.jsx";
import AttributeIndexDialog from "./AttributeIndexDialog.jsx";
import ReleaseNotesDialog from "./ReleaseNotesDialog.jsx";
import ResourceReleaseChanges from "./ResourceReleaseChanges.jsx";
import {
  buildTfExportTemplate,
  resolveProviderEnvVars,
  resolveTfExportResourceName,
  RESOURCE_NAME_PLACEHOLDER,
} from "./tfExportTemplate.js";
import {
  buildTerraformRegistryDocsUrl,
  buildTerraformRegistryProviderDocsUrl,
} from "./terraformRegistry.js";
import {
  DIVISION_FILTER_ALL,
  DIVISION_FILTER_AWARE,
  DIVISION_FILTER_NOT_AWARE,
  isDivisionAwareByDependencies,
  matchesDivisionFilter,
} from "./divisionAware.js";
import {
  ARTIFACT_READ_ONLY_ROLE,
  ARTIFACT_READ_WRITE_ROLE,
  ARTIFACT_SPREADSHEET,
  downloadUrlArtifact,
} from "./artifactDownloads.js";
import { newestListedReleaseFromIndex, toReleaseNotesVersion } from "./releaseNotes.js";
import {
  DIALOG_ATTRIBUTE_INDEX,
  DIALOG_CREATION_ORDER,
  DIALOG_ENV_VARS,
  DIALOG_RELEASE_NOTES,
  migrateLegacyAttributeIndexUrl,
  readAttributeIndexFilterFromLocation,
  readCreationOrderFilterFromLocation,
  readDialogFromLocation,
  readResourceTypeFromLocation,
  readSpreadsheetDownloadFromLocation,
  readVersionFromLocation,
  replaceAttributeIndexInUrl,
  replaceCreationOrderInUrl,
  replaceDialogInUrl,
  replaceResourceInUrl,
} from "./appPermalinks.js";
import { applyPageSeo, resolvePageSeo } from "./pageSeo.js";

const INDEX_URL = `${import.meta.env.BASE_URL}dependency-tree-json/index.json`;
const LATEST_URL = `${import.meta.env.BASE_URL}dependency-tree-json/latest.json`;
const OVERRIDES_URL = `${import.meta.env.BASE_URL}overrides.json`;
const PROVIDER_ENV_VARS_URL = `${import.meta.env.BASE_URL}provider-env-vars.json`;
const VERSION_URL = (v) => `${import.meta.env.BASE_URL}dependency-tree-json/${v}.json`;

function attributeIndexVersionFromUrl(versionFromUrl) {
  const trimmed = (versionFromUrl || "").trim().replace(/^v/i, "");
  return trimmed ? `v${trimmed}` : "";
}

function acceptVersionFromUrl(versionFromUrl, availableVersions, dialog = "") {
  if (!versionFromUrl) return false;
  if (availableVersions.includes(versionFromUrl)) return true;
  return dialog === DIALOG_ATTRIBUTE_INDEX;
}

const TF_EXPORT_NAMES_LATEST_URL = `${import.meta.env.BASE_URL}tf-export-resource-names/latest.json`;
const TF_EXPORT_NAMES_VERSION_URL = (v) =>
  `${import.meta.env.BASE_URL}tf-export-resource-names/${v}.json`;

const MIN_DEPENDENCY_VERSION = "1.60.0";
const MIN_ROLE_DOWNLOAD_VERSION = "1.76.0";

const VERSION_PICKER_TOOLTIP = `Dependencies - v${MIN_DEPENDENCY_VERSION}+, Permissions - v${MIN_ROLE_DOWNLOAD_VERSION}+`;

function normalizeType(s) {
  return (s || "").trim();
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

/**
 * Apply optional overrides to a dependency tree JSON.
 *
 * overrides.json (public/overrides.json, fetched at runtime) shape:
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
 *     "<resource_type>": "optional override for include_filter_resources placeholder (wins over generated map)"
 *   },
 *   "tfExportNote": "Markdown note shown in the genesyscloud_tf_export template panel when a type is selected",
 *   "dependencyNotes": {
 *     "<resource_type>": "Markdown note shown in Resource Type Details"
 *   },
 *   "guiMenuPaths": {
 *     "<resource_type>": "Admin > Menu > Path"
 *   },
 *   "hiddenResourceTypes": ["genesyscloud_bcp_tf_exporter", ...]
 *   "deprecatedResourceTypes": ["genesyscloud_journey_outcome", ...]
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

function getDeprecatedResourceTypes(overrides) {
  const deprecated = overrides?.deprecatedResourceTypes;
  if (!Array.isArray(deprecated)) return new Set();

  return new Set(
    deprecated
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
  const [overrides, setOverrides] = useState(null);
  const [providerEnvVarCatalog, setProviderEnvVarCatalog] = useState(null);
  const [tfExportResourceNames, setTfExportResourceNames] = useState({});

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
  /** Skip one URL sync after applying a resource path from the address bar. */
  const skipNextUrlSyncRef = useRef(false);
  /** Only merge resource and version paths from the URL once per mount. */
  const hydratedFromUrlRef = useRef(false);

  useEffect(() => {
    selectedVersionRef.current = selectedVersion;
  }, [selectedVersion]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [overridesRes, envVarsRes] = await Promise.all([
          fetch(OVERRIDES_URL, { cache: "no-store" }),
          fetch(PROVIDER_ENV_VARS_URL, { cache: "no-store" }),
        ]);

        if (!overridesRes.ok) {
          throw new Error(
            `Failed to fetch overrides: ${overridesRes.status} ${overridesRes.statusText}`
          );
        }

        if (!envVarsRes.ok) {
          throw new Error(
            `Failed to fetch provider env vars: ${envVarsRes.status} ${envVarsRes.statusText}`
          );
        }

        const [overridesJson, envVarsJson] = await Promise.all([
          overridesRes.json(),
          envVarsRes.json(),
        ]);

        if (!cancelled) {
          setOverrides(overridesJson);
          setProviderEnvVarCatalog(envVarsJson);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!overrides) return;

    let cancelled = false;

    (async () => {
      try {
        setLoadingData(true);
        setRaw(null);
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
  }, [selectedVersion, overrides]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const url =
        selectedVersion === "latest"
          ? TF_EXPORT_NAMES_LATEST_URL
          : TF_EXPORT_NAMES_VERSION_URL(selectedVersion);

      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(
            `Failed to fetch tf-export resource names: ${res.status} ${res.statusText}`
          );
        }

        const json = await res.json();
        if (!cancelled) {
          setTfExportResourceNames(
            json?.tfExportResourceNames && typeof json.tfExportResourceNames === "object"
              ? json.tfExportResourceNames
              : {}
          );
        }
      } catch {
        if (!cancelled) {
          setTfExportResourceNames({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedVersion]);

  const { depsMap, reverseMap } = useMemo(() => buildDepsMaps(raw), [raw]);

  const hiddenTypes = useMemo(
    () => (overrides ? getHiddenResourceTypes(overrides) : new Set()),
    [overrides]
  );
  const deprecatedTypes = useMemo(
    () => (overrides ? getDeprecatedResourceTypes(overrides) : new Set()),
    [overrides]
  );

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
    return allTypes.includes(selectedType) ? selectedType : "";
  }, [allTypes, selectedType]);

  const showDependencyLoading =
    (loadingData && raw === null) || !overrides || !providerEnvVarCatalog;
  const detailType = activeType || (showDependencyLoading ? selectedType : "");

  useEffect(() => {
    if (!selectedType || !allTypes.length) return;
    if (!allTypes.includes(selectedType)) {
      setSelectedType("");
    }
  }, [allTypes, selectedType]);

  useEffect(() => {
    if (!allTypes.length || !availableVersions.length || hydratedFromUrlRef.current) return;
    hydratedFromUrlRef.current = true;

    const versionFromUrl = readVersionFromLocation();
    const dialogFromUrl = readDialogFromLocation();
    if (versionFromUrl) {
      skipNextUrlSyncRef.current = true;
      setSelectedVersion(
        acceptVersionFromUrl(versionFromUrl, availableVersions, dialogFromUrl)
          ? versionFromUrl
          : "latest"
      );
    }

    const fromUrl = readResourceTypeFromLocation();
    if (fromUrl && allTypes.includes(fromUrl)) {
      skipNextUrlSyncRef.current = true;
      setSelectedType(fromUrl);
    } else if (fromUrl) {
      replaceResourceInUrl("", versionFromUrl || "latest");
      setSelectedType("");
      setQuery("");
    }
  }, [allTypes, availableVersions]);

  useEffect(() => {
    if (!allTypes.length) return;
    if (skipNextUrlSyncRef.current) {
      skipNextUrlSyncRef.current = false;
      return;
    }

    const dialog = readDialogFromLocation();
    if (dialog) {
      if (dialog === DIALOG_ATTRIBUTE_INDEX) {
        replaceAttributeIndexInUrl(
          readAttributeIndexFilterFromLocation(),
          readVersionFromLocation() || "latest"
        );
      } else if (dialog === DIALOG_CREATION_ORDER) {
        replaceCreationOrderInUrl(
          readCreationOrderFilterFromLocation(),
          readVersionFromLocation() || "latest"
        );
      } else {
        replaceDialogInUrl(dialog, activeType, selectedVersion);
      }
      return;
    }

    replaceResourceInUrl(activeType, selectedVersion);
  }, [activeType, selectedVersion, allTypes]);

  const dependsOn = useMemo(
    () => (activeType ? sortAlpha([...(depsMap.get(activeType) || [])]) : []),
    [depsMap, activeType]
  );

  const isDivisionAware = useMemo(
    () => isDivisionAwareByDependencies(dependsOn),
    [dependsOn]
  );

  const isDeprecated = useMemo(
    () => (activeType ? deprecatedTypes.has(activeType) : false),
    [activeType, deprecatedTypes]
  );

  const dependencyNote = useMemo(
    () => (overrides ? resolveDependencyNote(activeType, overrides) : ""),
    [activeType, overrides]
  );

  const tfExportResourceName = useMemo(
    () =>
      overrides
        ? resolveTfExportResourceName(activeType, overrides, tfExportResourceNames)
        : RESOURCE_NAME_PLACEHOLDER,
    [activeType, overrides, tfExportResourceNames]
  );

  const tfExportNote = useMemo(
    () => (overrides ? resolveTfExportNote(overrides) : ""),
    [overrides]
  );

  const providerEnvVars = useMemo(
    () =>
      providerEnvVarCatalog
        ? resolveProviderEnvVars(activeType, providerEnvVarCatalog.providerEnvVars)
        : [],
    [activeType, providerEnvVarCatalog]
  );

  const tfExportTemplate = useMemo(
    () =>
      activeType
        ? buildTfExportTemplate(activeType, dependsOn, tfExportResourceName, providerEnvVars)
        : "",
    [activeType, dependsOn, tfExportResourceName, providerEnvVars]
  );

  const terraformRegistryDocsUrl = useMemo(
    () =>
      detailType
        ? buildTerraformRegistryDocsUrl(detailType, selectedVersion)
        : buildTerraformRegistryProviderDocsUrl(selectedVersion),
    [detailType, selectedVersion]
  );

  const detailGuiMenuPath = useMemo(
    () => (overrides ? resolveGuiMenuPath(detailType, overrides) : ""),
    [detailType, overrides]
  );

  const [copyState, setCopyState] = useState("idle");
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [releaseNotesDialogOpen, setReleaseNotesDialogOpen] = useState(false);
  const [attributeIndexDialogOpen, setAttributeIndexDialogOpen] = useState(false);
  const [envVarsDialogOpen, setEnvVarsDialogOpen] = useState(false);
  const spreadsheetPermalinkRef = useRef("");
  const newestListedReleaseRef = useRef("");
  const [attributeIndexQuery, setAttributeIndexQuery] = useState(() =>
    readAttributeIndexFilterFromLocation()
  );
  const [creationOrderQuery, setCreationOrderQuery] = useState(() =>
    readCreationOrderFilterFromLocation()
  );

  const attributeIndexVersionFilter = useMemo(() => {
    if (!attributeIndexDialogOpen) return "";
    return attributeIndexVersionFromUrl(readVersionFromLocation());
  }, [attributeIndexDialogOpen, selectedVersion, attributeIndexQuery]);

  const syncAttributeIndexFromUrl = useCallback(() => {
    setAttributeIndexQuery(readAttributeIndexFilterFromLocation());
  }, []);

  const syncCreationOrderFromUrl = useCallback(() => {
    setCreationOrderQuery(readCreationOrderFilterFromLocation());
  }, []);

  const newestListedRelease = useMemo(
    () => newestListedReleaseFromIndex(availableVersions),
    [availableVersions]
  );

  useEffect(() => {
    newestListedReleaseRef.current = newestListedRelease;
  }, [newestListedRelease]);

  const openDialog = useCallback((dialogId) => {
    setOrderDialogOpen(dialogId === DIALOG_CREATION_ORDER);
    setReleaseNotesDialogOpen(dialogId === DIALOG_RELEASE_NOTES);
    setAttributeIndexDialogOpen(dialogId === DIALOG_ATTRIBUTE_INDEX);
    setEnvVarsDialogOpen(dialogId === DIALOG_ENV_VARS);
    if (dialogId === DIALOG_ATTRIBUTE_INDEX) {
      setAttributeIndexQuery("");
    }
    if (dialogId === DIALOG_CREATION_ORDER) {
      setCreationOrderQuery("");
    }
    replaceDialogInUrl(dialogId, "", selectedVersionRef.current);
  }, []);

  const handleCreationOrderQueryChange = useCallback((nextQuery) => {
    setCreationOrderQuery(nextQuery);
    replaceCreationOrderInUrl(nextQuery, selectedVersionRef.current);
  }, []);

  const handleAttributeIndexQueryChange = useCallback((nextQuery) => {
    setAttributeIndexQuery(nextQuery);
    const versionInUrl = readVersionFromLocation();
    replaceAttributeIndexInUrl(nextQuery, versionInUrl || "latest");
  }, []);

  const handleAttributeIndexVersionFilterChange = useCallback(
    (nextVersion) => {
      const bare = (nextVersion || "").trim().replace(/^v/i, "");
      const normalizedVersion = bare || "latest";
      setSelectedVersion(normalizedVersion);
      replaceAttributeIndexInUrl(attributeIndexQuery, normalizedVersion);
    },
    [attributeIndexQuery]
  );

  const openAttributeIndexForResource = useCallback((resourceType) => {
    const normalized = (resourceType || "").trim();
    if (!normalized) return;

    setOrderDialogOpen(false);
    setReleaseNotesDialogOpen(false);
    setAttributeIndexDialogOpen(true);
    setEnvVarsDialogOpen(false);
    setAttributeIndexQuery(normalized);
    replaceAttributeIndexInUrl(normalized, "latest");
  }, []);

  const closeDialogs = useCallback(
    (nextResourceType) => {
      setOrderDialogOpen(false);
      setReleaseNotesDialogOpen(false);
      setAttributeIndexDialogOpen(false);
      setEnvVarsDialogOpen(false);
      setAttributeIndexQuery("");
      setCreationOrderQuery("");

      const resource =
        typeof nextResourceType === "string" && nextResourceType.trim()
          ? nextResourceType.trim()
          : activeType;

      replaceDialogInUrl("", resource, selectedVersionRef.current);
    },
    [activeType]
  );

  useEffect(() => {
    const dialog = readDialogFromLocation();
    if (!dialog) return;

    if (dialog === DIALOG_CREATION_ORDER && (showDependencyLoading || !raw || error)) {
      return;
    }

    setOrderDialogOpen(dialog === DIALOG_CREATION_ORDER);
    setReleaseNotesDialogOpen(dialog === DIALOG_RELEASE_NOTES);
    setAttributeIndexDialogOpen(dialog === DIALOG_ATTRIBUTE_INDEX);
    setEnvVarsDialogOpen(dialog === DIALOG_ENV_VARS);
    if (dialog === DIALOG_ATTRIBUTE_INDEX) {
      syncAttributeIndexFromUrl();
    }
    if (dialog === DIALOG_CREATION_ORDER) {
      syncCreationOrderFromUrl();
    }
  }, [raw, showDependencyLoading, error, syncAttributeIndexFromUrl, syncCreationOrderFromUrl]);

  useEffect(() => {
    if (migrateLegacyAttributeIndexUrl()) {
      setAttributeIndexDialogOpen(true);
      syncAttributeIndexFromUrl();
    }
  }, [syncAttributeIndexFromUrl]);

  const handleSpreadsheetPermalink = useCallback(() => {
    const version = readSpreadsheetDownloadFromLocation();
    if (version === null) {
      spreadsheetPermalinkRef.current = "";
      return false;
    }

    const permalinkKey = window.location.pathname;
    if (spreadsheetPermalinkRef.current === permalinkKey) return true;

    spreadsheetPermalinkRef.current = permalinkKey;

    void downloadUrlArtifact(
      ARTIFACT_SPREADSHEET,
      version,
      newestListedReleaseRef.current
    ).finally(() => {
      if (readSpreadsheetDownloadFromLocation() === null) {
        spreadsheetPermalinkRef.current = "";
        return;
      }

      skipNextUrlSyncRef.current = true;
      replaceDialogInUrl("", readResourceTypeFromLocation(), readVersionFromLocation() || "latest");
      spreadsheetPermalinkRef.current = "";
    });

    return true;
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      if (handleSpreadsheetPermalink()) return;

      const dialog = readDialogFromLocation();
      setOrderDialogOpen(dialog === DIALOG_CREATION_ORDER);
      setReleaseNotesDialogOpen(dialog === DIALOG_RELEASE_NOTES);
      setAttributeIndexDialogOpen(dialog === DIALOG_ATTRIBUTE_INDEX);
      setEnvVarsDialogOpen(dialog === DIALOG_ENV_VARS);
      syncAttributeIndexFromUrl();
      syncCreationOrderFromUrl();

      const versionFromUrl = readVersionFromLocation();
      skipNextUrlSyncRef.current = true;
      if (acceptVersionFromUrl(versionFromUrl, availableVersions, dialog)) {
        setSelectedVersion(versionFromUrl);
      } else {
        setSelectedVersion("latest");
      }

      if (dialog) return;

      const typeFromUrl = readResourceTypeFromLocation();
      if (typeFromUrl && allTypes.includes(typeFromUrl)) {
        skipNextUrlSyncRef.current = true;
        setSelectedType(typeFromUrl);
        return;
      }

      skipNextUrlSyncRef.current = true;
      setSelectedType("");
    };

    handleSpreadsheetPermalink();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [
    allTypes,
    availableVersions,
    handleSpreadsheetPermalink,
    syncAttributeIndexFromUrl,
    syncCreationOrderFromUrl,
  ]);

  useEffect(() => {
    applyPageSeo(
      resolvePageSeo({
        activeType,
        selectedVersion,
        releaseNotesOpen: releaseNotesDialogOpen,
        creationOrderOpen: orderDialogOpen,
        attributeIndexOpen: attributeIndexDialogOpen,
        envVarsOpen: envVarsDialogOpen,
        attributeIndexFilter: attributeIndexQuery,
        creationOrderFilter: creationOrderQuery,
      })
    );
  }, [
    activeType,
    selectedVersion,
    releaseNotesDialogOpen,
    orderDialogOpen,
    attributeIndexDialogOpen,
    envVarsDialogOpen,
    attributeIndexQuery,
    creationOrderQuery,
  ]);

  const dependencyFor = useMemo(
    () => (activeType ? sortAlpha([...(reverseMap.get(activeType) || [])]) : []),
    [reverseMap, activeType]
  );

  const effectiveVersion =
    selectedVersion === "latest" ? newestListedRelease : selectedVersion;

  const roleDownloadsSupported = isRoleDownloadSupported(effectiveVersion);

  const downloadRoleTemplate = useCallback(
    (artifactId) => {
      void downloadUrlArtifact(artifactId, selectedVersion, newestListedRelease);
    },
    [selectedVersion, newestListedRelease]
  );

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

      const nextType = moveResourceListSelection(filteredTypes, selectedType, direction);
      if (nextType) setSelectedType(nextType);
    },
    [filteredTypes, selectedType]
  );

  useEffect(() => {
    if (!selectedType || !listBodyRef.current) return;

    const row = listBodyRef.current.querySelector(
      `[data-resource-type="${CSS.escape(selectedType)}"]`
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedType, filteredTypes]);

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

  const resourceListCountLabel = useMemo(() => {
    if (error) return "";
    if (showDependencyLoading) return "Loading resource types…";

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
    showDependencyLoading,
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
          <PageTitle />

          <div className="gcPageMeta">
            <button
              type="button"
              className="gcHeaderLink"
              onClick={() => openDialog(DIALOG_RELEASE_NOTES)}
            >
              Release notes
            </button>

            <button
              type="button"
              className="gcHeaderLink"
              onClick={() => openDialog(DIALOG_ATTRIBUTE_INDEX)}
            >
              Attribute history
            </button>

            <button
              type="button"
              className="gcHeaderLink"
              onClick={() => openDialog(DIALOG_CREATION_ORDER)}
              disabled={showDependencyLoading || !!error || !raw}
              title="Suggested creation order of CX as Code resources"
            >
              Creation order
            </button>

            <div
              className={`gcRoleDownloads ${roleDownloadsSupported ? "isVisible" : "isHidden"}`}
              aria-hidden={!roleDownloadsSupported}
            >
              <span
                className="gcMetaLabel"
                title="Starting-point roles — adjust permissions for your org before use."
              >
                Download Role Template:
              </span>

              <div className="gcHeaderLinks">
                <button
                  type="button"
                  className="gcHeaderLink"
                  onClick={() => downloadRoleTemplate(ARTIFACT_READ_WRITE_ROLE)}
                  tabIndex={roleDownloadsSupported ? 0 : -1}
                >
                  Read/Write .tf
                </button>
                <button
                  type="button"
                  className="gcHeaderLink"
                  onClick={() => downloadRoleTemplate(ARTIFACT_READ_ONLY_ROLE)}
                  tabIndex={roleDownloadsSupported ? 0 : -1}
                >
                  Read-only .tf
                </button>
              </div>
            </div>

            <div className="gcVersionPicker">
              <span className="gcMetaLabel" title={VERSION_PICKER_TOOLTIP}>
                Version:
              </span>
              <gux-dropdown ref={versionDropdownRef} disabled={loadingIndex || loadingData}>
                <gux-listbox>
                  <gux-option value="latest">
                    Latest {newestListedRelease ? `(${toReleaseNotesVersion(newestListedRelease)})` : ""}
                  </gux-option>

                  {availableVersions.map((v) => (
                    <gux-option key={v} value={v}>
                      {toReleaseNotesVersion(v)}
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
                  }}
                  onKeyDown={handleResourceListKeyDown}
                  disabled={showDependencyLoading || !!error}
                />

                <button
                  type="button"
                  className="gcClearButton"
                  onClick={clearSearch}
                  disabled={
                    showDependencyLoading ||
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
              {showDependencyLoading ? (
                <div className="gcEmptyRow">Loading dependency data...</div>
              ) : null}

              {!showDependencyLoading &&
                filteredTypes.map((t) => (
                  <button
                    key={t}
                    data-resource-type={t}
                    className={`gcTr ${t === selectedType ? "isActive" : ""}`}
                    onClick={() => {
                      setSelectedType(t);
                      listBodyRef.current?.focus();
                    }}
                    onKeyDown={handleResourceListKeyDown}
                    type="button"
                    role="option"
                    aria-selected={t === selectedType}
                  >
                    <div className="gcTd gcMono">{t}</div>
                  </button>
                ))}

              {!showDependencyLoading && filteredTypes.length === 0 ? (
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
                      disabled={showDependencyLoading || !!error}
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
                      disabled={showDependencyLoading || !!error}
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
                      disabled={showDependencyLoading || !!error}
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
                <div className="gcCard__titleActions">
                  {terraformRegistryDocsUrl ? (
                    <a
                      className="gcDocsPill"
                      href={terraformRegistryDocsUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={
                        detailType
                          ? `Open ${detailType} in the Terraform Registry (APIs and permissions)`
                          : "Open Genesys Cloud provider documentation in the Terraform Registry"
                      }
                    >
                      Registry docs (APIs & permissions)
                    </a>
                  ) : null}
                </div>
              </div>
              <div className={`gcCard__subtitle ${detailType ? "gcCard__subtitle--hasResource" : ""}`}>
                {detailType ? (
                  <div className="gcResourceHeader">
                    <div className="gcResourceTypeLine">
                      <code className="gcResourceTypeName">{detailType}</code>
                      {activeType && isDivisionAware ? (
                        <span
                          className="gcDivisionBadge"
                          title="Depends on genesyscloud_auth_division — heuristic for division_id in Registry docs; confirm there if unsure."
                        >
                          Division aware
                        </span>
                      ) : null}
                      {activeType && isDeprecated ? (
                        <span className="gcDeprecatedBadge">Deprecated</span>
                      ) : null}
                    </div>
                    <div className="gcMenuPathBlock" aria-label="Genesys Cloud GUI menu path">
                      <div className="gcMenuPath__label">GUI menu path</div>
                      <div className="gcMenuPath__value">
                        {activeType && detailGuiMenuPath ? (
                          <span className="gcMenuPath__crumbs">
                            {detailGuiMenuPath.split(">").map((segment, index) => (
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
                          <span className="gcMenuPath__empty">
                            {showDependencyLoading ? "Loading…" : "TBD"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  "Pick a resource type"
                )}
              </div>
            </div>

            <div className="gcRightCard__sections">
            {showDependencyLoading && detailType && !activeType ? (
              <div className="gcMuted">Loading dependency data for this version…</div>
            ) : (
              <>
            {effectiveVersion ? (
              <ResourceReleaseChanges
                version={effectiveVersion}
                resourceType={activeType}
                onViewAttributeHistory={openAttributeIndexForResource}
              />
            ) : null}

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
                      Select a type to view an export template.
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
              </>
            )}
            </div>
          </section>
        </div>
      </main>

      <footer className="gcFooter" role="contentinfo">
        <p className="gcFooterDisclaimer">
          This is an unofficial reference guide and is not reviewed, approved or endorsed by
          Genesys.
        </p>
        <p className="gcFooterDisclaimer">
          For authoritative information, refer to the{" "}
          <a
            className="gcFooterLink"
            href="https://developer.genesys.cloud/devapps/cx-as-code/"
            target="_blank"
            rel="noreferrer"
          >
            Genesys Cloud Developer Center
          </a>
          ,{" "}
          <a
            className="gcFooterLink"
            href="https://github.com/MyPureCloud/terraform-provider-genesyscloud"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Repository
          </a>
          , and{" "}
          <a
            className="gcFooterLink"
            href="https://registry.terraform.io/providers/MyPureCloud/genesyscloud"
            target="_blank"
            rel="noreferrer"
          >
            Terraform Registry
          </a>
          .
        </p>
        <p className="gcFooterCredit">
          Made with <span role="img" aria-label="love">❤️</span> by members of{" "}
          <a
            className="gcFooterLink"
            href="https://www.genesys.com/customer-success/professional-services"
            target="_blank"
            rel="noreferrer"
          >
            Genesys Professional Services
          </a>
        </p>
      </footer>

      <OrderOfOperationsDialog
        open={orderDialogOpen}
        onClose={closeDialogs}
        depsMap={depsMap}
        hiddenTypes={hiddenTypes}
        selectedVersion={selectedVersion}
        onVersionChange={setSelectedVersion}
        availableVersions={availableVersions}
        newestListedRelease={newestListedRelease}
        loadingIndex={loadingIndex}
        loadingData={loadingData}
        query={creationOrderQuery}
        onQueryChange={handleCreationOrderQueryChange}
        onSelectType={(type) => {
          setSelectedType(type);
          setCreationOrderQuery("");
          setQuery("");
          setDivisionFilter(DIVISION_FILTER_ALL);
        }}
      />

      <ReleaseNotesDialog
        open={releaseNotesDialogOpen}
        onClose={closeDialogs}
        selectedVersion={selectedVersion}
        onVersionChange={setSelectedVersion}
        availableVersions={availableVersions}
        newestListedRelease={newestListedRelease}
        loadingIndex={loadingIndex}
      />

      <AttributeIndexDialog
        open={attributeIndexDialogOpen}
        onClose={closeDialogs}
        knownTypes={new Set(allTypes)}
        query={attributeIndexQuery}
        onQueryChange={handleAttributeIndexQueryChange}
        versionFilter={attributeIndexVersionFilter}
        onVersionFilterChange={handleAttributeIndexVersionFilterChange}
        onSelectResource={(type) => {
          setSelectedType(type);
          setQuery("");
          setDivisionFilter(DIVISION_FILTER_ALL);
        }}
      />

      <ProviderEnvVarsDialog
        open={envVarsDialogOpen}
        onClose={closeDialogs}
        catalog={providerEnvVarCatalog}
        loadingCatalog={!providerEnvVarCatalog}
      />

    </div>
  );
}