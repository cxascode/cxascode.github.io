import React, { useEffect, useMemo, useRef, useState } from "react";

const INDEX_URL = `${import.meta.env.BASE_URL}versions/index.json`;
const LATEST_URL = `${import.meta.env.BASE_URL}dependency_tree.json`;
const VERSION_URL = (v) => `${import.meta.env.BASE_URL}versions/${v}.json`;

function normalizeType(s) {
  return (s || "").trim();
}

function sortAlpha(arr) {
  return arr
    .filter((x) => typeof x === "string")
    .sort((a, b) => a.localeCompare(b));
}

function buildDepsMaps(raw) {
  const depsMap = new Map(); // string -> Set<string>
  const reverseMap = new Map(); // string -> Set<string>

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

  // This is the version reported INSIDE the JSON we loaded (truth source)
  const [loadedVersion, setLoadedVersion] = useState("");

  const [raw, setRaw] = useState(null);

  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");

  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const versionDropdownRef = useRef(null);
  const searchRef = useRef(null);

  // Load versions index for dropdown
  useEffect(() => {
    let cancelled = false;

    async function loadIndex() {
      try {
        setLoadingIndex(true);
        setError("");

        const res = await fetch(INDEX_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load versions/index.json (${res.status})`);
        const json = await res.json();
        if (!Array.isArray(json)) throw new Error("versions/index.json is not an array");

        if (!cancelled) setAvailableVersions(json);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    }

    loadIndex();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep Spark dropdown's internal value synced with React state
  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;
    try {
      el.value = selectedVersion;
    } catch {
      // ignore
    }
  }, [selectedVersion]);

  // Robust dropdown event wiring (Spark custom element)
  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;

    const readValue = (evt) => {
      const fromEl = el.value;
      const fromDetail = evt?.detail?.value;
      const fromTarget = evt?.target?.value;

      const v =
        (typeof fromEl === "string" && fromEl) ||
        (typeof fromDetail === "string" && fromDetail) ||
        (typeof fromTarget === "string" && fromTarget) ||
        "";

      if (v) setSelectedVersion(v);
    };

    el.addEventListener("guxchange", readValue);
    el.addEventListener("change", readValue);
    el.addEventListener("input", readValue);

    return () => {
      el.removeEventListener("guxchange", readValue);
      el.removeEventListener("change", readValue);
      el.removeEventListener("input", readValue);
    };
  }, []);

  // Load dependency JSON for selected version
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setError("");
        setLoadingData(true);
        setRaw(null);

        const url = selectedVersion === "latest" ? LATEST_URL : VERSION_URL(selectedVersion);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load dependency JSON (${res.status})`);
        const json = await res.json();

        if (!json || !Array.isArray(json.resources)) {
          throw new Error("Dependency JSON is missing a top-level 'resources' array.");
        }

        if (!cancelled) {
          setRaw(json);
          setLoadedVersion(typeof json.version === "string" ? json.version : "");
        }
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    // Reset selection when switching versions
    setQuery("");
    setSelectedType("");

    loadData();
    return () => {
      cancelled = true;
    };
  }, [selectedVersion]);

  const { depsMap, reverseMap } = useMemo(() => buildDepsMaps(raw), [raw]);

  const allTypes = useMemo(() => {
    const s = new Set([...depsMap.keys(), ...reverseMap.keys()]);
    return sortAlpha([...s]);
  }, [depsMap, reverseMap]);

  const filteredTypes = useMemo(() => {
    const q = normalizeType(query).toLowerCase();
    return q ? allTypes.filter((t) => t.toLowerCase().includes(q)) : allTypes;
  }, [allTypes, query]);

  const activeType = selectedType || query;

  const dependsOn = useMemo(
    () => sortAlpha([...(depsMap.get(activeType) || [])]),
    [depsMap, activeType]
  );

  const dependencyFor = useMemo(
    () => sortAlpha([...(reverseMap.get(activeType) || [])]),
    [reverseMap, activeType]
  );

  const latestLabel = loadedVersion ? `Latest (${loadedVersion})` : "Latest";

  return (
    <div className="gcShell">
      {/* Page header (no breadcrumbs) */}
      <div className="gcPageHeader">
        <div className="gcPageTitleRow">
          <h1 className="gcPageTitle">CX as Code Dependency Explorer</h1>

          <div className="gcPageMeta">
            <span className="gcMetaLabel">Version:</span>

            <gux-dropdown ref={versionDropdownRef} disabled={loadingIndex}>
              <gux-listbox aria-label="Select provider version">
                <gux-option value="latest">{latestLabel}</gux-option>
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
        {error ? (
          <div className="gcAlert">
            <div className="gcAlert__title">Failed to load</div>
            <div className="gcAlert__body">{error}</div>
          </div>
        ) : null}

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
                  const v = e.target.value;
                  setQuery(v);
                  setSelectedType(""); // reset selection when typing or clearing via the built-in X
                }}
                disabled={loadingData || !!error}
              />
            </div>

            <div className="gcTable__body" aria-busy={loadingData ? "true" : "false"}>
              {filteredTypes.map((t) => (
                <button
                  key={t}
                  className={`gcTr ${t === activeType ? "isActive" : ""}`}
                  type="button"
                  onClick={() => {
                    setSelectedType(t);
                    setQuery(t);
                  }}
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
                {activeType ? <span className="gcMono">{activeType}</span> : "Pick a resource type"}
              </div>
            </div>

            <div className="gcDetailsGrid">
              <div className="gcPanel">
                <div className="gcPanel__header">
                  <div className="gcPanel__title">Depends on</div>
                  <gux-badge>{dependsOn.length}</gux-badge>
                </div>
                <div className="gcPanel__body">
                  {activeType && dependsOn.length === 0 ? (
                    <div className="gcMuted">No dependencies found.</div>
                  ) : !activeType ? (
                    <div className="gcMuted">Select a type to view dependencies.</div>
                  ) : (
                    <div className="gcPills">
                      {dependsOn.map((t) => (
                        <button
                          key={t}
                          className="gcPill"
                          type="button"
                          onClick={() => {
                            setSelectedType(t);
                            setQuery(t);
                          }}
                        >
                          {t}
                        </button>
                      ))}
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
                  {activeType && dependencyFor.length === 0 ? (
                    <div className="gcMuted">Nothing depends on this (in this version).</div>
                  ) : !activeType ? (
                    <div className="gcMuted">Select a type to view reverse dependencies.</div>
                  ) : (
                    <div className="gcPills">
                      {dependencyFor.map((t) => (
                        <button
                          key={t}
                          className="gcPill"
                          type="button"
                          onClick={() => {
                            setSelectedType(t);
                            setQuery(t);
                          }}
                        >
                          {t}
                        </button>
                      ))}
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