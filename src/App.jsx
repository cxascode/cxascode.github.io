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
  const [downloadedVersion, setDownloadedVersion] = useState("");
  const [raw, setRaw] = useState(null);

  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");

  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const versionDropdownRef = useRef(null);
  const searchRef = useRef(null);

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

  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;

    const handler = (evt) => {
      const v = el.value || evt?.detail?.value;
      if (v) setSelectedVersion(v);
    };

    el.addEventListener("guxchange", handler);
    return () => el.removeEventListener("guxchange", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadingData(true);
        const url = selectedVersion === "latest" ? LATEST_URL : VERSION_URL(selectedVersion);
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();

        if (!cancelled) {
          setRaw(json);
          setDownloadedVersion(json.version || selectedVersion);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    setQuery("");
    setSelectedType("");

    return () => (cancelled = true);
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

  const dependsOn = sortAlpha([...(depsMap.get(activeType) || [])]);
  const dependencyFor = sortAlpha([...(reverseMap.get(activeType) || [])]);

  return (
    <div className="gcShell">
      {/* Page header */}
      <div className="gcPageHeader">
        <div className="gcBreadcrumb">
          <span className="gcBreadcrumb__current">CX as Code</span>
          <span className="gcBreadcrumb__sep">/</span>
          <span className="gcBreadcrumb__current">Dependencies</span>
        </div>

        <div className="gcPageTitleRow">
          <h1 className="gcPageTitle">Dependency Explorer</h1>

          <div className="gcPageMeta">
            <span className="gcMetaLabel">Downloaded:</span>
            <gux-badge accent="info">{downloadedVersion || "—"}</gux-badge>

            <span className="gcMetaLabel">Version:</span>
            <gux-dropdown ref={versionDropdownRef} disabled={loadingIndex}>
              <gux-listbox>
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
      </div>

      {/* Content */}
      <main className="gcContentArea">
        <div className="gcSplit">
          <section className="gcCard">
            <div className="gcCard__toolbar">
              <input
                ref={searchRef}
                className="gcSearchInput"
                placeholder="Search resource types"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedType("");
                }}
              />

              <div className="gcToolbarStat">
                <span className="gcToolbarStat__label">Types</span>
                <span className="gcToolbarStat__value">{filteredTypes.length}</span>
              </div>
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
                >
                  <div className="gcTd gcMono">{t}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="gcCard">
            <div className="gcCard__header">
              <div className="gcCard__title">Dependency details</div>
              <div className="gcCard__subtitle">
                {activeType || "Pick a resource type"}
              </div>
            </div>

            <div className="gcDetailsGrid">
              <div className="gcPanel">
                <div className="gcPanel__header">
                  <div className="gcPanel__title">Depends on</div>
                  <gux-badge>{dependsOn.length}</gux-badge>
                </div>
                <div className="gcPanel__body">
                  {dependsOn.map((t) => (
                    <button key={t} className="gcPill" onClick={() => setSelectedType(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="gcPanel">
                <div className="gcPanel__header">
                  <div className="gcPanel__title">Dependency for</div>
                  <gux-badge>{dependencyFor.length}</gux-badge>
                </div>
                <div className="gcPanel__body">
                  {dependencyFor.map((t) => (
                    <button key={t} className="gcPill" onClick={() => setSelectedType(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}