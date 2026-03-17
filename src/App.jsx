import React, { useEffect, useMemo, useRef, useState } from "react";

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

const OVERRIDES_URL = `${import.meta.env.BASE_URL}overrides.json`;
const MIN_ROLE_DOWNLOAD_VERSION = "1.76.0";

function normalizeType(s) {
  return (s || "").trim();
}

function sortAlpha(arr) {
  return arr
    .filter((x) => typeof x === "string")
    .sort((a, b) => a.localeCompare(b));
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
  const selectedVersionRef = useRef("latest");

  useEffect(() => {
    selectedVersionRef.current = selectedVersion;
  }, [selectedVersion]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(OVERRIDES_URL, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setOverrides(null);
          return;
        }
        const json = await res.json();
        if (!cancelled) setOverrides(json);
      } catch {
        if (!cancelled) setOverrides(null);
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

  const activeType = useMemo(() => {
    if (!selectedType) return "";
    return allTypes.includes(selectedType) ? selectedType : "";
  }, [allTypes, selectedType]);

  const dependsOn = useMemo(
    () => (activeType ? sortAlpha([...(depsMap.get(activeType) || [])]) : []),
    [depsMap, activeType]
  );

  const dependencyFor = useMemo(
    () => (activeType ? sortAlpha([...(reverseMap.get(activeType) || [])]) : []),
    [reverseMap, activeType]
  );

  const effectiveVersion =
    selectedVersion === "latest" ? availableVersions[0] || "" : selectedVersion;

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

  const clearSearch = () => {
    setQuery("");
    setSelectedType("");
    searchRef.current?.focus();
  };

  const showInitialLoading = loadingData && raw === null;

  return (
    <div className="gcShell">
      <div className="gcPageHeader">
        <div className="gcPageTitleRow">
          <h1 className="gcPageTitle">CX as Code Dependency Explorer</h1>

          <div className="gcPageMeta">
            <div
              className={`gcRoleDownloads ${roleDownloadsSupported ? "isVisible" : "isHidden"}`}
              aria-hidden={!roleDownloadsSupported}
            >
              <span className="gcMetaLabel">Role Download:</span>

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

            <span className="gcMetaLabel">Version:</span>
            <gux-dropdown ref={versionDropdownRef} disabled={loadingIndex}>
              <gux-listbox>
                <gux-option value="latest">
                  Latest {availableVersions.length ? `(${availableVersions[0]})` : ""}
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
                disabled={showInitialLoading || !!error}
              />

              <button
                type="button"
                className="gcClearButton"
                onClick={clearSearch}
                disabled={showInitialLoading || !!error || (!query && !selectedType)}
              >
                Clear
              </button>
            </div>

            <div className="gcTable__body">
              {showInitialLoading ? (
                <div className="gcEmptyRow">Loading dependency data...</div>
              ) : null}

              {!showInitialLoading &&
                filteredTypes.map((t) => (
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

              {!showInitialLoading && filteredTypes.length === 0 ? (
                <div className="gcEmptyRow">No matches.</div>
              ) : null}
            </div>
          </section>

          <section className="gcCard gcRightCard">
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
                            setQuery(t);
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
    </div>
  );
}