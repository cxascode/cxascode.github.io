import React, { useEffect, useMemo, useRef, useState } from "react";

const INDEX_URL = `${import.meta.env.BASE_URL}versions/index.json`;
const LATEST_URL = `${import.meta.env.BASE_URL}dependency_tree.json`;
const VERSION_URL = (v) => `${import.meta.env.BASE_URL}versions/${v}.json`;

// --- Helpers ---------------------------------------------------------------

function normalizeType(s) {
  return (s || "").trim();
}

// Best-effort: handle a few possible shapes without guessing too hard.
// Your provider file historically maps resource type -> dependencies array,
// but this keeps it resilient.
function buildDepsMaps(raw) {
  const depsMap = new Map(); // type -> Set(deps)
  const reverseMap = new Map(); // type -> Set(dependents)

  const addEdge = (from, to) => {
    if (!from || !to) return;
    if (!depsMap.has(from)) depsMap.set(from, new Set());
    depsMap.get(from).add(to);

    if (!reverseMap.has(to)) reverseMap.set(to, new Set());
    reverseMap.get(to).add(from);
  };

  if (!raw) return { depsMap, reverseMap };

  // Case A: { "genesyscloud_foo": ["genesyscloud_bar", ...], ... }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v)) {
        v.forEach((dep) => addEdge(k, dep));
      } else if (v && typeof v === "object") {
        // Case B-ish: { "type": { depends_on: [...] } }
        const list =
          v.depends_on || v.dependencies || v.dependsOn || v.depends || [];
        if (Array.isArray(list)) list.forEach((dep) => addEdge(k, dep));
      }
    }
  }

  return { depsMap, reverseMap };
}

function sortAlpha(arr) {
  return [...arr].sort((a, b) => a.localeCompare(b));
}

// --- App -------------------------------------------------------------------

export default function App() {
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState("latest");
  const [downloadedVersion, setDownloadedVersion] = useState(""); // what JSON we actually loaded
  const [raw, setRaw] = useState(null);

  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");

  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const searchInputRef = useRef(null);

  // Load versions index for dropdown
  useEffect(() => {
    let cancelled = false;

    async function loadIndex() {
      try {
        setLoadingIndex(true);
        const res = await fetch(INDEX_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load index.json (${res.status})`);
        const json = await res.json();
        if (!Array.isArray(json)) throw new Error("index.json is not an array");
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

        if (!cancelled) {
          setRaw(json);
          setDownloadedVersion(selectedVersion === "latest" ? (availableVersions[0] || "latest") : selectedVersion);
        }
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    // Reset selection when changing versions to avoid “phantom” types
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

  // --- Spark dropdown wiring (web component events) -------------------------
  // gux-dropdown emits a change-ish event; React doesn’t automatically map it
  // like a native <select>. We attach a listener directly.
  const versionDropdownRef = useRef(null);

  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;

    const handler = (evt) => {
      // gux-dropdown commonly reports selected value on evt.detail.value
      const v = evt?.detail?.value;
      if (typeof v === "string" && v.length > 0) {
        setSelectedVersion(v);
      }
    };

    el.addEventListener("change", handler);
    el.addEventListener("input", handler);
    el.addEventListener("guxchange", handler);

    return () => {
      el.removeEventListener("change", handler);
      el.removeEventListener("input", handler);
      el.removeEventListener("guxchange", handler);
    };
  }, []);

  const onPickType = (t) => {
    setSelectedType(t);
    setQuery(t);
    // Keep focus in the search box for quick iterative lookups
    requestAnimationFrame(() => searchInputRef.current?.focus?.());
  };

  const clearSearch = () => {
    setQuery("");
    setSelectedType("");
    requestAnimationFrame(() => searchInputRef.current?.focus?.());
  };

  return (
    <div className="gcApp">
      <header className="gcTopbar">
        <div className="gcTopbar__left">
          <div className="gcTitle">CX as Code Dependency Explorer</div>
          <div className="gcSubtitle">Resource dependencies across provider versions</div>
        </div>

        <div className="gcTopbar__right">
          <div className="gcMeta">
            <span className="gcMetaLabel">Downloaded:</span>
            <gux-badge accent="info">{downloadedVersion || "—"}</gux-badge>
          </div>

          <div className="gcMeta">
            <span className="gcMetaLabel">Version:</span>
            <gux-dropdown ref={versionDropdownRef} value={selectedVersion} placeholder="Select version">
              <gux-listbox aria-label="Select provider version">
                <gux-option value="latest">Latest</gux-option>
                {availableVersions.map((v) => (
                  <gux-option key={v} value={v}>
                    {v}
                  </gux-option>
                ))}
              </gux-listbox>
            </gux-dropdown>
          </div>
        </div>
      </header>

      <main className="gcMain">
        <section className="gcSidebar">
          <gux-card accent="bordered">
            <div className="gcCardHeader">
              <div className="gcCardTitle">Resource type</div>
              <div className="gcCardActions">
                <gux-button
                  accent="secondary"
                  onClick={clearSearch}
                  disabled={!query && !selectedType}
                >
                  Clear
                </gux-button>
              </div>
            </div>

            <div className="gcCardBody">
              <gux-form-field label="Search">
                <input
                  ref={searchInputRef}
                  slot="input"
                  value={query}
                  placeholder='e.g. "genesyscloud_flow"'
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedType("");
                  }}
                />
              </gux-form-field>

              <div className="gcListMeta">
                {loadingIndex ? "Loading versions…" : `${filteredTypes.length} types`}
                {loadingData ? " • Loading data…" : ""}
              </div>

              <div className="gcList" role="list">
                {filteredTypes.slice(0, 250).map((t) => {
                  const active = t === activeType;
                  return (
                    <button
                      key={t}
                      className={`gcListItem ${active ? "isActive" : ""}`}
                      onClick={() => onPickType(t)}
                      title={t}
                    >
                      <span className="gcListItemText">{t}</span>
                    </button>
                  );
                })}

                {filteredTypes.length > 250 && (
                  <div className="gcListFooter">
                    Showing first 250 matches. Refine your search to narrow it down.
                  </div>
                )}
              </div>
            </div>
          </gux-card>
        </section>

        <section className="gcContent">
          <gux-card accent="bordered">
            <div className="gcCardHeader">
              <div className="gcCardTitle">Dependency details</div>
              <div className="gcCardSubtitle">
                {activeType ? (
                  <>
                    <span className="mono">{activeType}</span>
                  </>
                ) : (
                  "Pick a resource type to view dependencies"
                )}
              </div>
            </div>

            <div className="gcCardBody">
              {error && (
                <div className="gcError">
                  <div className="gcErrorTitle">Failed to load</div>
                  <div className="gcErrorText">{error}</div>
                </div>
              )}

              {!error && !activeType && (
                <div className="gcEmpty">
                  Type a resource name on the left (or click one) to see:
                  <ul>
                    <li>What it depends on</li>
                    <li>What depends on it</li>
                  </ul>
                </div>
              )}

              {!error && activeType && (
                <div className="gcGrid">
                  <div className="gcPanel">
                    <div className="gcPanelHeader">
                      <div className="gcPanelTitle">Depends on</div>
                      <gux-badge>{dependsOn.length}</gux-badge>
                    </div>
                    <div className="gcPanelBody">
                      {dependsOn.length === 0 ? (
                        <div className="gcMuted">No dependencies found.</div>
                      ) : (
                        <div className="gcPills">
                          {dependsOn.map((t) => (
                            <button key={t} className="gcPill" onClick={() => onPickType(t)}>
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="gcPanel">
                    <div className="gcPanelHeader">
                      <div className="gcPanelTitle">Dependency for</div>
                      <gux-badge>{dependencyFor.length}</gux-badge>
                    </div>
                    <div className="gcPanelBody">
                      {dependencyFor.length === 0 ? (
                        <div className="gcMuted">Nothing depends on this (in this version).</div>
                      ) : (
                        <div className="gcPills">
                          {dependencyFor.map((t) => (
                            <button key={t} className="gcPill" onClick={() => onPickType(t)}>
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </gux-card>
        </section>
      </main>

      <footer className="gcFooter">
        <span>Built with Genesys Spark components.</span>
      </footer>
    </div>
  );
}