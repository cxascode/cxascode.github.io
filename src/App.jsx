// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * This app loads dependency data in two ways:
 *  1) Automatically: fetch latest GitHub release -> find dependency_tree-*.json asset -> download JSON
 *  2) Manually: user uploads a JSON file
 *
 * GitHub docs:
 * - "Get the latest release" endpoint exists in the Releases REST API.  [oai_citation:3‡GitHub Docs](https://docs.github.com/en/rest/releases?utm_source=chatgpt.com)
 * - Release assets include browser_download_url which can be fetched in a browser.  [oai_citation:4‡GitHub Docs](https://docs.github.com/rest/releases/assets?utm_source=chatgpt.com)
 * - GitHub also documents /releases/latest/download/<asset-name> if the asset name is stable.  [oai_citation:5‡GitHub Docs](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases?utm_source=chatgpt.com)
 */

// ---- Config (change if needed)
const GH_OWNER = "MyPureCloud";
const GH_REPO = "terraform-provider-genesyscloud";
const ASSET_PREFIX = "dependency_tree-";
const ASSET_SUFFIX = ".json";

function uniqSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function normalizeType(s) {
  return (s || "").trim();
}

function prettyErr(e) {
  const msg = typeof e === "string" ? e : e?.message || String(e);
  // A small nudge for the most common GitHub API pain:
  if (msg.toLowerCase().includes("rate limit")) {
    return `${msg}\n\nGitHub unauthenticated API calls are rate-limited. If this page gets a lot of traffic, consider adding a server-side proxy/cache.`;
  }
  return msg;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      // vnd.github+json is recommended for GitHub REST API requests  [oai_citation:6‡GitHub Docs](https://docs.github.com/rest/releases/assets?utm_source=chatgpt.com)
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch failed (${res.status}) for ${url}${text ? `: ${text}` : ""}`);
  }
  return await res.json();
}

async function fetchLatestDependencyTreeFromGitHub() {
  const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`;
  const release = await fetchJson(apiUrl); // "Get the latest release"  [oai_citation:7‡GitHub Docs](https://docs.github.com/en/rest/releases?utm_source=chatgpt.com)

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = assets.find(
    (a) =>
      typeof a?.name === "string" &&
      a.name.startsWith(ASSET_PREFIX) &&
      a.name.endsWith(ASSET_SUFFIX)
  );

  if (!asset?.browser_download_url) {
    const names = assets.map((a) => a?.name).filter(Boolean);
    throw new Error(
      `No matching asset found in latest release.\nExpected something like "${ASSET_PREFIX}<version>${ASSET_SUFFIX}".\nAssets present: ${names.length ? names.join(", ") : "(none)"}`
    );
  }

  // browser_download_url is the URL to fetch in a browser to download the asset  [oai_citation:8‡GitHub Docs](https://docs.github.com/rest/releases/assets?utm_source=chatgpt.com)
  const data = await fetchJson(asset.browser_download_url);

  // Some extra metadata for UI
  return {
    data,
    meta: {
      releaseName: release.name || "",
      tagName: release.tag_name || "",
      publishedAt: release.published_at || "",
      assetName: asset.name || "",
      assetUrl: asset.browser_download_url || "",
    },
  };
}

export default function App() {
  const [raw, setRaw] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);

  // metadata about what was loaded (release tag, asset name, etc.)
  const [sourceMeta, setSourceMeta] = useState(null);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");

  // Auto-load latest on first render
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const { data, meta } = await fetchLatestDependencyTreeFromGitHub();
        if (cancelled) return;

        if (!data || !Array.isArray(data.resources)) {
          throw new Error("Downloaded JSON is missing a top-level 'resources' array.");
        }

        setRaw(data);
        setSourceMeta({ kind: "github-latest-release", ...meta });
      } catch (e) {
        if (cancelled) return;
        setRaw(null);
        setSourceMeta(null);
        setLoadError(prettyErr(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const { version, types, depsMap, reverseDepsMap } = useMemo(() => {
    const empty = {
      version: "",
      types: [],
      depsMap: new Map(),
      reverseDepsMap: new Map(),
    };
    if (!raw || !raw.resources || !Array.isArray(raw.resources)) return empty;

    // depsMap: type -> Set(dependencies)
    const deps = new Map();
    // reverseDepsMap: type -> Set(dependents)
    const rev = new Map();

    for (const r of raw.resources) {
      const t = r?.type;
      if (!t) continue;

      const list = Array.isArray(r.dependencies) ? r.dependencies : [];
      if (!deps.has(t)) deps.set(t, new Set());
      for (const d of list) {
        if (!d) continue;
        deps.get(t).add(d);

        if (!rev.has(d)) rev.set(d, new Set());
        rev.get(d).add(t);
      }

      // ensure keys exist so a type with no deps still shows up
      if (!rev.has(t)) rev.set(t, rev.get(t) || new Set());
    }

    const allTypes = uniqSorted(Array.from(new Set([...deps.keys(), ...rev.keys()])));
    return {
      version: raw.version || "",
      types: allTypes,
      depsMap: deps,
      reverseDepsMap: rev,
    };
  }, [raw]);

  const normalizedQuery = normalizeType(query);
  const normalizedSelected = normalizeType(selected);

  const suggestions = useMemo(() => {
    if (!normalizedQuery) return types.slice(0, 80);
    const q = normalizedQuery.toLowerCase();
    return types.filter((t) => t.toLowerCase().includes(q)).slice(0, 80);
  }, [types, normalizedQuery]);

  const activeType = normalizedSelected || normalizedQuery;

  const outgoing = useMemo(() => {
    if (!activeType) return [];
    return uniqSorted(Array.from(depsMap.get(activeType) || []));
  }, [activeType, depsMap]);

  const incoming = useMemo(() => {
    if (!activeType) return [];
    return uniqSorted(Array.from(reverseDepsMap.get(activeType) || []));
  }, [activeType, reverseDepsMap]);

  const exists = useMemo(() => {
    if (!activeType) return false;
    return types.includes(activeType);
  }, [activeType, types]);

  function onPick(t) {
    setSelected(t);
    setQuery(t);
  }

  async function onUpload(file) {
    setLoadError("");
    setSelected("");
    setQuery("");
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json || !Array.isArray(json.resources)) {
        throw new Error("JSON must contain a top-level 'resources' array.");
      }
      setRaw(json);
      setSourceMeta({
        kind: "upload",
        fileName: file.name,
        loadedAt: new Date().toISOString(),
      });
    } catch (e) {
      setRaw(null);
      setSourceMeta(null);
      setLoadError(prettyErr(e));
    }
  }

  async function reloadLatest() {
    setLoading(true);
    setLoadError("");
    setSelected("");
    setQuery("");
    try {
      const { data, meta } = await fetchLatestDependencyTreeFromGitHub();
      if (!data || !Array.isArray(data.resources)) {
        throw new Error("Downloaded JSON is missing a top-level 'resources' array.");
      }
      setRaw(data);
      setSourceMeta({ kind: "github-latest-release", ...meta });
    } catch (e) {
      setRaw(null);
      setSourceMeta(null);
      setLoadError(prettyErr(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.h1}>Terraform Resource Dependency Explorer</h1>
            <div style={styles.sub}>
              Type a Terraform resource type to see <b>depends on</b> and <b>dependency for</b>.
              {version ? (
                <span style={{ marginLeft: 10, opacity: 0.9 }}>
                  JSON version: <code style={styles.code}>{version}</code>
                </span>
              ) : null}
            </div>
            <div style={styles.metaLine}>
              <span style={styles.metaLabel}>Data source:</span>{" "}
              {sourceMeta?.kind === "github-latest-release" ? (
                <span>
                  GitHub latest release{" "}
                  {sourceMeta.tagName ? (
                    <>
                      (<code style={styles.code}>{sourceMeta.tagName}</code>)
                    </>
                  ) : null}
                  {sourceMeta.assetName ? (
                    <>
                      {" "}
                      · asset <code style={styles.code}>{sourceMeta.assetName}</code>
                    </>
                  ) : null}
                </span>
              ) : sourceMeta?.kind === "upload" ? (
                <span>
                  Upload (<code style={styles.code}>{sourceMeta.fileName}</code>)
                </span>
              ) : (
                <span style={{ opacity: 0.8 }}>Not loaded</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
              onClick={reloadLatest}
              disabled={loading}
              title="Fetch the latest dependency_tree JSON from the latest GitHub release"
            >
              {loading ? "Loading…" : "Reload latest"}
            </button>

            <label style={styles.uploadBtn} title="Upload a dependency_tree JSON file">
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
              Upload JSON
            </label>
          </div>
        </div>

        {loadError ? (
          <div style={styles.error}>
            <b>Couldn’t load dependency data:</b>
            <pre style={styles.pre}>{loadError}</pre>
          </div>
        ) : null}

        <div style={styles.searchRow}>
          <input
            style={styles.input}
            placeholder="Type a resource type (e.g., genesyscloud_routing_queue)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected("");
            }}
            disabled={!raw || loading}
          />
          <button
            style={{ ...styles.btn, opacity: raw && !loading ? 1 : 0.5 }}
            onClick={() => setSelected(normalizeType(query))}
            disabled={!raw || loading}
            title="Lock in the current input"
          >
            Search
          </button>
          <button
            style={{ ...styles.btn, opacity: raw && !loading ? 1 : 0.5 }}
            onClick={() => {
              setQuery("");
              setSelected("");
            }}
            disabled={!raw || loading}
            title="Clear"
          >
            Clear
          </button>
        </div>

        {!raw ? (
          <div style={styles.muted}>
            {loading ? (
              <div>Fetching the latest release asset from GitHub…</div>
            ) : (
              <div>
                No JSON loaded yet. Click <b>Reload latest</b> or <b>Upload JSON</b>.
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
              Expected shape:{" "}
              <code style={styles.code}>
                {"{ version, resources: [{type, dependencies?}, ...] }"}
              </code>
            </div>
          </div>
        ) : (
          <div style={styles.bodyGrid}>
            <div style={styles.panel}>
              <div style={styles.panelTitle}>
                Suggestions <span style={styles.badge}>{types.length}</span>
              </div>
              <div style={styles.list}>
                {suggestions.length === 0 ? (
                  <div style={styles.muted}>No matches.</div>
                ) : (
                  suggestions.map((t) => (
                    <button
                      key={t}
                      style={{
                        ...styles.listItem,
                        ...(t === activeType ? styles.listItemActive : null),
                      }}
                      onClick={() => onPick(t)}
                    >
                      <code style={styles.code}>{t}</code>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelTitle}>Selected type</div>
              <div style={{ marginBottom: 10 }}>
                <code style={{ ...styles.code, fontSize: 14 }}>
                  {activeType || "(none)"}
                </code>
                {activeType && !exists ? (
                  <div style={styles.warn}>Not found in JSON (check spelling / provider version).</div>
                ) : null}
              </div>

              <div style={styles.twoCol}>
                <div style={styles.subPanel}>
                  <div style={styles.subTitle}>
                    Depends on <span style={styles.badge}>{outgoing.length}</span>
                  </div>
                  {outgoing.length ? (
                    <ul style={styles.ul}>
                      {outgoing.map((d) => (
                        <li key={d}>
                          <code style={styles.code}>{d}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={styles.muted}>None (or type not found).</div>
                  )}
                </div>

                <div style={styles.subPanel}>
                  <div style={styles.subTitle}>
                    Dependency for <span style={styles.badge}>{incoming.length}</span>
                  </div>
                  {incoming.length ? (
                    <ul style={styles.ul}>
                      {incoming.map((d) => (
                        <li key={d}>
                          <code style={styles.code}>{d}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={styles.muted}>None (or type not found).</div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 14, fontSize: 13, opacity: 0.85 }}>
                Nerd note: reverse-deps are computed by scanning every resource’s{" "}
                <code style={styles.code}>dependencies</code> list once, then indexing{" "}
                <code style={styles.code}>dependency → dependents</code>.
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={styles.footer}>
        Using GitHub’s “latest release” API to resolve the newest asset at runtime.  [oai_citation:9‡GitHub Docs](https://docs.github.com/en/rest/releases?utm_source=chatgpt.com)
        <div style={{ marginTop: 6, opacity: 0.75 }}>
          If you ever rename the release asset to a stable name, you could use the simpler URL form
          <code style={{ ...styles.code, marginLeft: 8 }}>/releases/latest/download/&lt;asset-name&gt;</code>.  [oai_citation:10‡GitHub Docs](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases?utm_source=chatgpt.com)
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    background: "#0b1020",
    color: "#eaf0ff",
    minHeight: "100vh",
    padding: 24,
  },
  card: {
    maxWidth: 1100,
    margin: "0 auto",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "start",
  },
  h1: { margin: 0, fontSize: 22, letterSpacing: 0.2 },
  sub: { marginTop: 6, fontSize: 14, opacity: 0.9, lineHeight: 1.4 },
  metaLine: { marginTop: 8, fontSize: 13, opacity: 0.9, lineHeight: 1.3 },
  metaLabel: { opacity: 0.8 },
  uploadBtn: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#eaf0ff",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  searchRow: { display: "flex", gap: 10, marginTop: 14 },
  input: {
    flex: 1,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.25)",
    color: "#eaf0ff",
    outline: "none",
  },
  btn: {
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.10)",
    color: "#eaf0ff",
    cursor: "pointer",
  },
  bodyGrid: {
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    gap: 14,
    marginTop: 14,
  },
  panel: {
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    minHeight: 320,
  },
  panelTitle: {
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 10,
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  badge: {
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.12)",
    opacity: 0.95,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 420,
    overflow: "auto",
    paddingRight: 6,
  },
  listItem: {
    textAlign: "left",
    borderRadius: 12,
    padding: "10px 10px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#eaf0ff",
    cursor: "pointer",
  },
  listItemActive: {
    background: "rgba(110,170,255,0.16)",
    border: "1px solid rgba(110,170,255,0.35)",
  },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  subPanel: {
    borderRadius: 12,
    padding: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
  },
  subTitle: {
    fontSize: 13,
    opacity: 0.95,
    marginBottom: 8,
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  ul: { margin: 0, paddingLeft: 18, lineHeight: 1.7 },
  code: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
    background: "rgba(255,255,255,0.08)",
    padding: "2px 6px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.10)",
  },
  muted: { opacity: 0.78, fontSize: 14, marginTop: 10 },
  warn: {
    marginTop: 8,
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 12,
    background: "rgba(255,180,70,0.14)",
    border: "1px solid rgba(255,180,70,0.25)",
  },
  error: {
    marginTop: 12,
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,90,90,0.16)",
    border: "1px solid rgba(255,90,90,0.28)",
  },
  pre: {
    margin: "8px 0 0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
    lineHeight: 1.4,
    opacity: 0.95,
  },
  footer: {
    maxWidth: 1100,
    margin: "14px auto 0",
    opacity: 0.85,
    fontSize: 13,
    lineHeight: 1.35,
  },
};