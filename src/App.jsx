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
 * Expected JSON schema (per provider release asset):
 * {
 *   "version": "1.73.0",
 *   "resources": [
 *     { "type": "genesyscloud_foo", "dependencies": ["genesyscloud_bar", ...] },
 *     ...
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

    // Ensure the node exists even if it has no edges
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

  const searchInputRef = useRef(null);
  const versionDropdownRef = useRef(null);

  // Load versions index for dropdown
  useEffect(() => {
    let cancelled = false;

    async function loadIndex() {
      try {
        setLoadingIndex(true);
        setError("");

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

  // Wire up Spark dropdown events (custom element)
  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;

    const handler = (evt) => {
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

        // Basic schema check to avoid silent weirdness later
        if (!json || !Array.isArray(json.resources)) {
          throw new Error("Dependency JSON is missing a top-level 'resources' array.");
        }

        if (!cancelled) {
          setRaw(json);

          // Prefer the version embedded in the file; fall back to dropdown intent
          const embeddedVersion = typeof json.version === "string" ? json.version : "";
          const computed =
            embeddedVersion ||
            (selectedVersion === "latest" ? availableVersions[0] || "latest" : selectedVersion);

          setDownloadedVersion(computed);
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
    // availableVersions is intentionally not a dependency; we don't want to refetch data
    // just because the index arrives slightly later.
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
    requestAnimationFrame(() => searchInputRef.current?.focus?.());
  };

  const clearSearch = () => {
    setQuery("");
    setSelectedType("");
    requestAnimationFrame(() => searchInputRef.current?.focus?.());
  };

  const loading = loadingIndex || loadingData;

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
            <gux-dropdown
              ref={versionDropdownRef}
              value={selectedVersion}
              placeholder="Select version"
              disabled={loadingIndex}
            >
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
                  disabled={loading || !!error}
                />
              </gux-form-field>

              <div className="gcListMeta">
                {loadingIndex ? "Loading versions…" : `${filteredTypes.length} types`}
                {loadingData ? " • Loading data…" : ""}
              </div>

              <div className="gcList" role="list" aria-busy={loading ? "true" : "false"}>
                {filteredTypes.slice(0, 250).map((t) => {
                  const active = t === activeType;
                  return (
                    <button
                      key={t}
                      className={`gcListItem ${active ? "isActive" : ""}`}
                      onClick={() => onPickType(t)}
                      title={t}
                      type="button"
                      disabled={!!error}
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
                {activeType ? <span className="mono">{activeType}</span> : "Pick a resource type"}
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
                            <button key={t} className="gcPill" onClick={() => onPickType(t)} type="button">
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
                            <button key={t} className="gcPill" onClick={() => onPickType(t)} type="button">
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
        <span>{loading ? "Loading…" : "Built with Genesys Spark components."}</span>
      </footer>
    </div>
  );
}