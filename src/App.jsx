import React, { useEffect, useMemo, useState } from "react";

function uniqSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function normalizeType(s) {
  return (s || "").trim();
}

export default function App() {
  const [raw, setRaw] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");

  // ---- Load dependency tree from same-origin JSON
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/dependency_tree.json");
        if (!res.ok) {
          throw new Error(`Failed to load dependency_tree.json (${res.status})`);
        }
        const data = await res.json();
        if (!Array.isArray(data.resources)) {
          throw new Error("Invalid dependency_tree.json format");
        }
        if (!cancelled) {
          setRaw(data);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(String(e?.message || e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Manual upload fallback
  async function onUpload(file) {
    setLoadError("");
    setSelected("");
    setQuery("");
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!Array.isArray(json.resources)) {
        throw new Error("JSON must contain a top-level 'resources' array");
      }
      setRaw(json);
    } catch (e) {
      setLoadError(String(e?.message || e));
    }
  }

  // ---- Build dependency maps
  const { types, depsMap, reverseDepsMap } = useMemo(() => {
    const empty = {
      types: [],
      depsMap: new Map(),
      reverseDepsMap: new Map(),
    };
    if (!raw?.resources) return empty;

    const deps = new Map();
    const rev = new Map();

    for (const r of raw.resources) {
      const t = r?.type;
      if (!t) continue;

      const list = Array.isArray(r.dependencies) ? r.dependencies : [];
      if (!deps.has(t)) deps.set(t, new Set());

      for (const d of list) {
        deps.get(t).add(d);
        if (!rev.has(d)) rev.set(d, new Set());
        rev.get(d).add(t);
      }

      if (!rev.has(t)) rev.set(t, new Set());
    }

    return {
      types: uniqSorted([...new Set([...deps.keys(), ...rev.keys()])]),
      depsMap: deps,
      reverseDepsMap: rev,
    };
  }, [raw]);

  const activeType = normalizeType(selected || query);

  const outgoing = uniqSorted([...depsMap.get(activeType) || []]);
  const incoming = uniqSorted([...reverseDepsMap.get(activeType) || []]);

  const suggestions = query
    ? types.filter((t) => t.toLowerCase().includes(query.toLowerCase())).slice(0, 50)
    : types.slice(0, 50);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Terraform Resource Dependency Explorer</h1>

        <div style={styles.controls}>
          <input
            style={styles.input}
            placeholder="genesyscloud_routing_queue"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected("");
            }}
            disabled={loading}
          />

          <label style={styles.upload}>
            Upload JSON
            <input
              type="file"
              accept=".json"
              hidden
              onChange={(e) => onUpload(e.target.files?.[0])}
            />
          </label>
        </div>

        {loadError && <div style={styles.error}>{loadError}</div>}

        {loading ? (
          <div style={styles.muted}>Loading dependency tree…</div>
        ) : (
          <div style={styles.grid}>
            <div>
              <h3>Resources</h3>
              <ul style={styles.list}>
                {suggestions.map((t) => (
                  <li key={t}>
                    <button
                      style={t === activeType ? styles.active : styles.item}
                      onClick={() => {
                        setSelected(t);
                        setQuery(t);
                      }}
                    >
                      {t}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3>Selected</h3>
              <div style={styles.box}>{activeType || "(none)"}</div>

              <h4>Depends on</h4>
              <ul>
                {outgoing.length ? outgoing.map((d) => <li key={d}>{d}</li>) : <li>None</li>}
              </ul>

              <h4>Dependency for</h4>
              <ul>
                {incoming.length ? incoming.map((d) => <li key={d}>{d}</li>) : <li>None</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    background: "#0b1020",
    color: "#eaf0ff",
    minHeight: "100vh",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    maxWidth: 1100,
    margin: "0 auto",
    background: "rgba(255,255,255,0.06)",
    padding: 20,
    borderRadius: 12,
  },
  controls: { display: "flex", gap: 12, marginBottom: 12 },
  input: { flex: 1, padding: 10, borderRadius: 8 },
  upload: {
    cursor: "pointer",
    padding: "10px 12px",
    background: "#334",
    borderRadius: 8,
  },
  error: { color: "#ff9b9b", marginBottom: 12 },
  muted: { opacity: 0.8 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  list: { listStyle: "none", padding: 0, maxHeight: 400, overflow: "auto" },
  item: { width: "100%", textAlign: "left" },
  active: { width: "100%", textAlign: "left", background: "#556" },
  box: { padding: 10, background: "#223", borderRadius: 8, marginBottom: 10 },
};