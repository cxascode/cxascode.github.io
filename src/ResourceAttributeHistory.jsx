import React, { useEffect, useMemo, useState } from "react";
import { toReleaseNotesVersion } from "./releaseNotes.js";
import {
  attributeIndexEntryKey,
  ATTRIBUTE_INDEX_DESCRIPTION,
  fetchResourceAttributeIndex,
  filterIndexForResource,
  formatAttributeIndexIntroduced,
  formatAttributeIndexLastChanged,
  formatAttributeIndexType,
} from "./resourceAttributeIndex.js";

function StatusBadge({ status }) {
  const normalized = (status || "").trim();
  const className =
    normalized === "Removed"
      ? "gcAttributeHistory__status gcAttributeHistory__status--removed"
      : "gcAttributeHistory__status gcAttributeHistory__status--active";

  return <span className={className}>{normalized || "Unknown"}</span>;
}

function AttributeHistoryEntry({ entry }) {
  const showType = entry.type && entry.type !== "resource";

  return (
    <article className="gcAttributeHistory__item">
      <div className="gcAttributeHistory__itemHeader">
        <code className="gcAttributeHistory__attribute">{entry.attribute}</code>
        <div className="gcAttributeHistory__meta">
          {showType ? (
            <span className="gcAttributeHistory__type">{formatAttributeIndexType(entry.type)}</span>
          ) : null}
          <StatusBadge status={entry.status} />
          <span className="gcAttributeHistory__introduced">
            Introduced {formatAttributeIndexIntroduced(entry.introduced)}
          </span>
          {entry.last_updated ? (
            <span className="gcAttributeHistory__version">
              {formatAttributeIndexLastChanged(entry.last_updated)}
            </span>
          ) : null}
        </div>
      </div>

      {entry.latest_summary ? (
        <p className="gcAttributeHistory__summary">{entry.latest_summary}</p>
      ) : null}

      {Array.isArray(entry.history) && entry.history.length > 1 ? (
        <details className="gcAttributeHistory__details">
          <summary>{entry.history.length} changes</summary>
          <ul className="gcAttributeHistory__historyList">
            {entry.history.map((item) => (
              <li key={`${item.version}-${item.change}-${item.summary}`}>
                <span className="gcAttributeHistory__historyVersion">
                  {toReleaseNotesVersion(item.version)}
                </span>
                <span className="gcAttributeHistory__historyChange">{item.change}</span>
                <span>{item.summary}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

export default function ResourceAttributeHistory({ resourceType, onViewAll }) {
  const [index, setIndex] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchResourceAttributeIndex();
        if (!cancelled) setIndex(data);
      } catch (e) {
        if (!cancelled) {
          setIndex([]);
          setError(String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const entries = useMemo(
    () => filterIndexForResource(index, resourceType),
    [index, resourceType]
  );

  if (!resourceType) return null;

  return (
    <div className="gcRightCard__section">
      <div className="gcPanel">
        <div className="gcPanel__header">
          <div className="gcPanel__title">Attribute history</div>
          {entries.length ? <gux-badge>{entries.length}</gux-badge> : null}
        </div>
        <div className="gcPanel__body">
          <p className="gcMuted gcAttributeHistory__intro">{ATTRIBUTE_INDEX_DESCRIPTION}</p>

          {loading ? <div className="gcMuted">Loading attribute history…</div> : null}

          {error ? (
            <div className="gcMuted" role="alert">
              Could not load attribute history.
            </div>
          ) : null}

          {!loading && !error && !entries.length ? (
            <div className="gcMuted">No attribute history recorded for this resource.</div>
          ) : null}

          {!loading && !error && entries.length ? (
            <div className="gcAttributeHistory__list">
              {entries.map((entry) => (
                <AttributeHistoryEntry key={attributeIndexEntryKey(entry)} entry={entry} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <button type="button" className="gcHeaderLink gcSectionLink" onClick={onViewAll}>
        View full attribute index
      </button>
    </div>
  );
}
