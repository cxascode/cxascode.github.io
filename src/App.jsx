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

/**
 * Expected JSON schema:
 * {
 *   "version": "1.73.0",
 *   "resources": [
 *     { "type": "genesyscloud_foo", "dependencies": ["genesyscloud_bar", ...] }
 *   ]
 * }
 */
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
  const [downloadedVersion, setDownloadedVersion] = useState("");
  const [raw, setRaw] = useState(null);

  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");

  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const versionDropdownRef = useRef(null);
  const globalSearchRef = useRef(null);

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

  // Keep Spark dropdown value synced
  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;
    try {
      el.value = selectedVersion;
    } catch {
      // no-op
    }
  }, [selectedVersion]);

  // Wire up Spark dropdown events robustly
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

  // Load dependency tree for selected version
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
          const embedded = typeof json.version === "string" ? json.version : "";
          setDownloadedVersion(
            embedded ||
              (selectedVersion === "latest"
                ? availableVersions[0] || "latest"
                : selectedVersion)
          );
        }
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    // Reset selection when changing versions
    setQuery("");
    setSelectedType("");

    loadData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion]);

  const { depsMap, reverseMap } = useMemo(() => buildDepsMaps(raw), [raw]);

  const allTypes = useMemo(() => {
    const s = new Set();
    for (const k of depsMap.keys()) s.add(k);
    for (const k of reverseMap.keys()) s.add(k);
    return sortAlpha([...s]);
  }, [depsMap, reverseMap]);

  const filteredTypes = useMemo(() => {
    const q = normalizeType(query).toLowerCase();
    if (!q) return allTypes;
    return allTypes.filter((t) => t.toLowerCase().includes(q));
  }, [allTypes, query]);

  const activeType = useMemo(() => normalizeType(selectedType || query), [selectedType, query]);

  const dependsOn = useMemo(() => {
    if (!activeType) return [];
    return sortAlpha([...(depsMap.get(activeType) || [])]);
  }, [depsMap, activeType]);

  const dependencyFor = useMemo(() => {
    if (!activeType) return [];
    return sortAlpha([...(reverseMap.get(activeType) || [])]);
  }, [reverseMap, activeType]);

  const onPickType = (t) => {
    setSelectedType(t);
    setQuery(t);
  };

  const clearSearch = () => {
    setQuery("");
    setSelectedType("");
    requestAnimationFrame(() => globalSearchRef.current?.focus?.());
  };

  const loading = loadingIndex || loadingData;

  return (
    <div className="gcShell">
      {/* App header (Genesys Cloud-ish) */}
      <header className="gcAppHeader">
        <div className="gcAppHeader__left">
          <button className="gcIconButton" type="button" aria-label="Menu">
            ☰
          </button>
          <div className="gcGlobalSearch">
            <span className="gcGlobalSearch__icon">🔍</span>
            <input
              ref={globalSearchRef}
              className="gcGlobalSearch__input"
              value={query}
              placeholder="Search resource types"
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedType("");
              }}
              disabled={loading || !!error}
            />
            {query ? (
              <button className="gcIconButton gcIconButton--small" type="button" onClick={clearSearch} aria-label="Clear search">
                ✕
              </button>
            ) : null}
          </div>
        </div>

        <div className="gcAppHeader__right">
          <div className="gcHeaderChip">
            <span className="gcHeaderChip__label">Off Queue</span>
            <span className="gcToggle" aria-hidden="true" />
          </div>

          <button className="gcIconButton" type="button" aria-label="Help">?</button>
          <button className="gcIconButton" type="button" aria-label="Phone">📞</button>
          <button className="gcIconButton" type="button" aria-label="Chat">💬</button>
          <button className="gcIconButton" type="button" aria-label="Notifications">🔔</button>
          <button className="gcIconButton" type="button" aria-label="Profile">👤</button>
        </div>
      </header>

      {/* Page header (breadcrumb + title) */}
      <div className="gcPageHeader">
        <div className="gcBreadcrumb">
          <a className="gcBreadcrumb__link" href="#" onClick={(e) => e.preventDefault()}>
            Dependencies
          </a>
          <span className="gcBreadcrumb__sep">/</span>
          <span className="gcBreadcrumb__current">Explorer</span>
        </div>
        <div className="gcPageTitleRow">
          <h1 className="gcPageTitle">CX as Code Dependency Explorer</h1>
          <div className="gcPageMeta">
            <span className="gcMetaLabel">Downloaded:</span>
            <gux-badge accent="info">{downloadedVersion || "—"}</gux-badge>
            <span className="gcMetaLabel">Version:</span>
            <gux-dropdown ref={versionDropdownRef} placeholder="Select version" disabled={loadingIndex}>
              <gux-listbox aria-label="Select provider version">
                <gux-option value="latest">Latest</gux-option>
                {availableVersions.map((v) => (
                  <gux-option key={v} value={v}>
                    {v}
                  </gux-option>
                ))}
              </gux-listbox>
            </gux-dropdown>

            <div className="gcUpdated">
              <span className="gcUpdated__icon">⟳</span>
              <span>{loading ? "Updating…" : "Updated just now"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <main className="gcContentArea">
        {error ? (
          <div className="gcAlert">
            <div className="gcAlert__title">Failed to load</div>
            <div className="gcAlert__body">{error}</div>
          </div>
        ) : null}

        <div className="gcSplit">
          {/* Left: “table list” like GC */}
          <section className="gcCard">
            <div className="gcCard__toolbar">
              <button className="gcPrimaryButton" type="button" onClick={() => globalSearchRef.current?.focus?.()} disabled={loading || !!error}>
                + Search Type
              </button>

              <div className="gcToolbarRight">
                <div className="gcToolbarStat">
                  <span className="gcToolbarStat__label">Types</span>
                  <span className="gcToolbarStat__value">{filteredTypes.length}</span>
                </div>

                <button className="gcSecondaryButton" type="button" onClick={clearSearch} disabled={!query && !selectedType}>
                  Clear
                </button>
              </div>
            </div>

            <div className="gcTable">
              <div className="gcTable__head">
                <div className="gcTh">Resource Type</div>
              </div>
              <div className="gcTable__body" role="list" aria-busy={loading ? "true" : "false"}>
                {filteredTypes.slice(0, 500).map((t) => {
                  const active = t === activeType;
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`gcTr ${active ? "isActive" : ""}`}
                      onClick={() => onPickType(t)}
                      title={t}
                    >
                      <div className="gcTd gcMono">{t}</div>
                    </button>
                  );
                })}

                {filteredTypes.length === 0 ? (
                  <div className="gcEmptyRow">No matches.</div>
                ) : null}

                {filteredTypes.length > 500 ? (
                  <div className="gcEmptyRow">Showing first 500. Refine search to narrow results.</div>
                ) : null}
              </div>
            </div>
          </section>

          {/* Right: details panel like GC */}
          <section className="gcCard">
            <div className="gcCard__header">
              <div>
                <div className="gcCard__title">Dependency details</div>
                <div className="gcCard__subtitle">
                  {activeType ? <span className="gcMono">{activeType}</span> : "Pick a resource type"}
                </div>
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
                        <button key={t} type="button" className="gcPill" onClick={() => onPickType(t)}>
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
                        <button key={t} type="button" className="gcPill" onClick={() => onPickType(t)}>
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

      <footer className="gcFooterBar">
        <span>Built with Genesys Spark components.</span>
      </footer>
    </div>
  );
}