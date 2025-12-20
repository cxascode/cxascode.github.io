import React, { useEffect, useMemo, useRef, useState } from "react";

const INDEX_URL = `${import.meta.env.BASE_URL}versions/index.json`;
const LATEST_URL = `${import.meta.env.BASE_URL}dependency_tree.json`;
const VERSION_URL = (v) => `${import.meta.env.BASE_URL}versions/${v}.json`;
const OVERRIDES_URL = `${import.meta.env.BASE_URL}overrides.json`;

function normalizeType(s) {
  return (s || "").trim();
}

function sortAlpha(arr) {
  return arr
    .filter((x) => typeof x === "string")
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Apply optional overrides to a dependency tree JSON.
 *
 * overrides.json shape:
 * {
 *   "addDependencies": {
 *     "<resource_type>": ["other_type", ...]
 *   }
 * }
 *
 * Behavior:
 * - For each resource_type in addDependencies, union the dependencies list.
 * - No duplicates.
 * - If a resource_type is not present in the JSON, it is ignored (no auto-create).
 */
function applyOverrides(raw, overrides) {
  if (!raw || !Array.isArray(raw.resources)) return raw;
  if (!overrides || typeof overrides !== "object") return raw;

  const add = overrides.addDependencies;
  if (!add || typeof add !== "object") return raw;

  // Clone shallowly so we don't mutate the fetched object
  const patched = {
    ...raw,
    resources: raw.resources.map((r) => ({ ...r })),
  };

  // Index resources by type
  const byType = new Map();
  for (const r of patched.resources) {
    if (r && typeof r.type === "string") byType.set(r.type, r);
  }

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

  return patched;
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

  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");

  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const versionDropdownRef = useRef(null);
  const searchRef = useRef(null);

  // Load overrides once (optional file)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(OVERRIDES_URL, { cache: "no-store" });

        // If file doesn't exist, that's fine; treat as "no overrides"
        if (!res.ok) {
          if (!cancelled) setOverrides(null);
          return;
        }

        const json = await res.json();
        if (!cancelled) setOverrides(json);
      } catch {
        // If overrides.json is malformed or fetch fails, don't break the app
        if (!cancelled) setOverrides(null);
      }
    })();

    return () => (cancelled = true);
  }, []);

  // Load versions index
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(INDEX_URL, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setAvailableVersions(json);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    })();

    return () => (cancelled = true);
  }, []);

  // Wire Spark dropdown (robust event value handling)
  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;

    const handler = (evt) => {
      // Prefer event target value first; fall back to detail (Spark version dependent)
      const next = evt?.target?.value ?? evt?.detail?.value ?? "";
      setSelectedVersion(next || "latest");
    };

    // Some versions emit `guxchange`, some also emit `change`
    el.addEventListener("guxchange", handler);
    el.addEventListener("change", handler);

    return () => {
      el.removeEventListener("guxchange", handler);
      el.removeEventListener("change", handler);
    };
  }, []);

  // Keep Spark dropdown in sync with React state (prevents drift after rerenders/options load)
  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;

    el.value = selectedVersion; // property
    el.setAttribute("value", selectedVersion); // attribute (some builds care)
  }, [selectedVersion]);

  // Final anti-flake sync: runs after versions finish loading
  useEffect(() => {
    if (loadingIndex) return;
    const el = versionDropdownRef.current;
    if (!el) return;

    el.value = selectedVersion;
    el.setAttribute("value", selectedVersion);
  }, [loadingIndex, selectedVersion]);

  // Load dependency tree (and patch it before use)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadingData(true);
        const url =
          selectedVersion === "latest" ? LATEST_URL : VERSION_URL(selectedVersion);
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();

        const patched = applyOverrides(json, overrides);

        if (!cancelled) setRaw(patched);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    // Reset state on version change
    setQuery("");
    setSelectedType("");

    return () => (cancelled = true);
  }, [selectedVersion, overrides]);

  const { depsMap, reverseMap } = useMemo(() => buildDepsMaps(raw), [raw]);

  const allTypes = useMemo(() => {
    const s = new Set([...depsMap.keys(), ...reverseMap.keys()]);
    return sortAlpha([...s]);
  }, [depsMap, reverseMap]);

  const filteredTypes = useMemo(() => {
    const q = normalizeType(query).toLowerCase();
    return q ? allTypes.filter((t) => t.toLowerCase().includes(q)) : allTypes;
  }, [allTypes, query]);

  // Only a click sets a real selection
  const activeType = selectedType;

  const dependsOn = useMemo(
    () => (activeType ? sortAlpha([...(depsMap.get(activeType) || [])]) : []),
    [depsMap, activeType]
  );

  const dependencyFor = useMemo(
    () => (activeType ? sortAlpha([...(reverseMap.get(activeType) || [])]) : []),
    [reverseMap, activeType]
  );

  return (
    <div className="gcShell">
      {/* Page header */}
      <div className="gcPageHeader">
        <div className="gcPageTitleRow">
          <h1 className="gcPageTitle">CX as Code Dependency Explorer</h1>

          <div className="gcPageMeta">
            <span className="gcMetaLabel">Version:</span>
            <gux-dropdown ref={versionDropdownRef} disabled={loadingIndex}>
              <gux-listbox>
                <gux-option value="latest">
                  Latest{" "}
                  {availableVersions.length ? `(${availableVersions[0]})` : ""}
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

      {/* Content */}
      <main className="gcContentArea">
        <div className="gcSplit">
          {/* Left panel */}
          <section className="gcCard">
            <div className="gcCard__toolbar">
              <input
                ref={searchRef}
                type="search"
                className="gcSearchInput"
                placeholder="Search resource types"
                value={query}
                onInput={(e) => {
                  setQuery(e.target.value);
                  setSelectedType(""); // typing ≠ selecting
                }}
                disabled={loadingData || !!error}
              />
            </div>

            <div className="gcTable__body">
              {filteredTypes.map((t) => (
                <button
                  key={t}
                  className={`gcTr ${t === activeType ? "isActive" : ""}`}
                  onClick={() => {
                    setSelectedType(t);
                    setQuery(t);
                  }}
                  type="button"
                >
                  <div className="gcTd gcMono">{t}</div>
                </button>
              ))}

              {!loadingData && filteredTypes.length === 0 ? (
                <div className="gcEmptyRow">No matches.</div>
              ) : null}
            </div>
          </section>

          {/* Right panel */}
          <section className="gcCard">
            <div className="gcCard__header">
              <div className="gcCard__title">Dependency details</div>
              <div className="gcCard__subtitle">
                {activeType ? (
                  <span className="gcMono">{activeType}</span>
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
                            setQuery(t);
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
                    <div className="gcMuted">
                      Select a type to view dependencies.
                    </div>
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
                            setQuery(t);
                          }}
                          type="button"
                        >
                          {t}
                        </button>
                      ))
                    ) : (
                      <div className="gcMuted">
                        Nothing depends on this (in this version).
                      </div>
                    )
                  ) : (
                    <div className="gcMuted">
                      Select a type to view reverse dependencies.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}