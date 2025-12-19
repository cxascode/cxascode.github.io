// App.jsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * Expected JSON shape (like your attached file :contentReference[oaicite:1]{index=1}):
 * {
 *   "version": "1.73.0",
 *   "resources": [
 *     { "name": "...", "type": "genesyscloud_x", "dependencies": ["genesyscloud_y"] }
 *   ]
 * }
 */

function uniqSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function normalizeType(s) {
  return (s || "").trim();
}

export default function App() {
  const [raw, setRaw] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");

  // Optional: try to auto-load a bundled JSON if you place it in /public as dependency_tree.json
  // (This is purely convenience; upload works regardless.)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/dependency_tree.json");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setRaw(json);
      } catch {
        // ignore
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
    if (!normalizedQuery) return types.slice(0, 50);
    const q = normalizedQuery.toLowerCase();
    return types.filter((t) => t.toLowerCase().includes(q)).slice(0, 50);
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
    } catch (e) {
      setRaw(null);
      setLoadError(e?.message || String(e));
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.h1}>Terraform Resource Dependency Explorer</h1>
            <div style={styles.sub}>
              Upload your dependency JSON, then type a resource type to see <b>depends on</b> and <b>dependency for</b>.
              {version ? (
                <span style={{ marginLeft: 10, opacity: 0.8 }}>
                  JSON version: <code style={styles.code}>{version}</code>
                </span>
              ) : null}
            </div>
          </div>
          <label style={styles.uploadBtn}>
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => onUpload(e.target.files?.[0])}
            />
            Upload JSON
          </label>
        </div>

        {loadError ? (
          <div style={styles.error}>
            <b>Couldn’t load JSON:</b> {loadError}
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
            disabled={!raw}
          />
          <button
            style={{ ...styles.btn, opacity: raw ? 1 : 0.5 }}
            onClick={() => setSelected(normalizeType(query))}
            disabled={!raw}
            title="Lock in the current input"
          >
            Search
          </button>
          <button
            style={{ ...styles.btn, opacity: raw ? 1 : 0.5 }}
            onClick={() => {
              setQuery("");
              setSelected("");
            }}
            disabled={!raw}
            title="Clear"
          >
            Clear
          </button>
        </div>

        {!raw ? (
          <div style={styles.muted}>
            No JSON loaded yet. Click <b>Upload JSON</b> and select your file.
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
              The file should look like: <code style={styles.code}>{"{ version, resources: [{type, dependencies?}, ...] }"}</code>
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
              <div style={styles.panelTitle}>
                Selected type
              </div>
              <div style={{ marginBottom: 10 }}>
                <code style={{ ...styles.code, fontSize: 14 }}>
                  {activeType || "(none)"}
                </code>
                {activeType && !exists ? (
                  <div style={styles.warn}>
                    Not found in JSON (check spelling / version).
                  </div>
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
                Nerd note: reverse-deps are computed by scanning every resource’s <code style={styles.code}>dependencies</code> list once,
                then indexing <code style={styles.code}>dependency → dependents</code>.
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={styles.footer}>
        Tip: if you drop your JSON into <code style={styles.code}>public/dependency_tree.json</code>, it’ll auto-load on refresh.
      </div>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
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
  headerRow: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" },
  h1: { margin: 0, fontSize: 22, letterSpacing: 0.2 },
  sub: { marginTop: 6, fontSize: 14, opacity: 0.9, lineHeight: 1.4 },
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
  bodyGrid: { display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, marginTop: 14 },
  panel: {
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    minHeight: 320,
  },
  panelTitle: { fontSize: 14, opacity: 0.9, marginBottom: 10, display: "flex", gap: 8, alignItems: "center" },
  badge: {
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.12)",
    opacity: 0.95,
  },
  list: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflow: "auto", paddingRight: 6 },
  listItem: {
    textAlign: "left",
    borderRadius: 12,
    padding: "10px 10px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#eaf0ff",
    cursor: "pointer",
  },
  listItemActive: { background: "rgba(110,170,255,0.16)", border: "1px solid rgba(110,170,255,0.35)" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  subPanel: {
    borderRadius: 12,
    padding: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
  },
  subTitle: { fontSize: 13, opacity: 0.95, marginBottom: 8, display: "flex", gap: 8, alignItems: "center" },
  ul: { margin: 0, paddingLeft: 18, lineHeight: 1.7 },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
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
  footer: { maxWidth: 1100, margin: "14px auto 0", opacity: 0.75, fontSize: 13 },
};
