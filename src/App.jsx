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

  // ---- Build dependency maps
  const { version, types, depsMap, reverseDepsMap } = useMemo(() => {
    const empty = {
      version: "",
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
      version: raw.version || "",
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

        <div style={styles.subhead}>
          {loading ? (
            "Loading provider metadata…"
          ) : version ? (
            <>
              Provider version:&nbsp;
              <code style={styles.code}>{version}</code>
            </>
          ) : (
            "Provider version unavailable"
          )}
        </div>

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
                {outgoing.length
                  ? outgoing.map((d) => <li key={d}>{d}</li>)
                  : <li>None</li>}
              </ul>

              <h4>Dependency for</h4>
              <ul>
                {incoming.length
                  ? incoming.map((d) => <li key={d}>{d}</li>)
                  : <li>None</li>}
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
  subhead: {
    marginTop: 6,
    marginBottom: 14,
    opacity: 0.85,
    fontSize: 14,
  },
  controls: { marginBottom: 12 },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  error: { color: "#ff9b9b", marginBottom: 12 },
  muted: { opacity: 0.8 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  list: {
    listStyle: "none",
    padding: 0,
    maxHeight: 400,
    overflow: "auto",
  },
  item: {
    width: "100%",
    textAlign: "left",
    padding: 6,
  },
  active: {
    width: "100%",
    textAlign: "left",
    padding: 6,
    background: "#556",
  },
  box: {
    padding: 10,
    background: "#223",
    borderRadius: 8,
    marginBottom: 10,
  },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    background: "rgba(255,255,255,0.12)",
    padding: "2px 6px",
    borderRadius: 6,
  },
};