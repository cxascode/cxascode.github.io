import React, { useEffect, useState } from "react";
import {
  fetchReleaseNotesChanges,
  filterChangesForResource,
  formatReleaseChangeKind,
  formatReleaseChangeLabel,
  toReleaseNotesVersion,
} from "./releaseNotes.js";

export default function ResourceReleaseChanges({
  version,
  resourceType,
  onViewAll,
}) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!version || !resourceType) {
      setChanges([]);
      setError("");
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const payload = await fetchReleaseNotesChanges(version);
        const filtered = filterChangesForResource(payload, resourceType);
        if (!cancelled) setChanges(filtered);
      } catch (e) {
        if (!cancelled) {
          setChanges([]);
          setError(String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [version, resourceType]);

  if (!resourceType || !version) return null;

  const versionLabel = toReleaseNotesVersion(version);

  return (
    <div className="gcRightCard__section">
      <div className="gcPanel">
        <div className="gcPanel__header">
          <div className="gcPanel__title">Changes in {versionLabel}</div>
          {changes.length ? <gux-badge>{changes.length}</gux-badge> : null}
        </div>
        <div className="gcPanel__body">
          {loading ? <div className="gcMuted">Loading changes…</div> : null}

          {error ? (
            <div className="gcMuted" role="alert">
              Could not load release changes.
            </div>
          ) : null}

          {!loading && !error && !changes.length ? (
            <div className="gcMuted">No provider changes for this resource in {versionLabel}.</div>
          ) : null}

          {!loading && !error && changes.length ? (
            <ul className="gcReleaseChanges__list">
              {changes.map((entry, index) => {
                const kindLabel = formatReleaseChangeKind(entry.kind);

                return (
                  <li
                    key={`${entry.attribute || "resource"}-${entry.change}-${index}`}
                    className="gcReleaseChanges__item"
                  >
                    <div className="gcReleaseChanges__itemHeader">
                      <span className="gcAttributeHistory__status gcAttributeHistory__status--active">
                        {formatReleaseChangeLabel(entry.change)}
                      </span>
                      {entry.attribute ? (
                        <code className="gcAttributeHistory__attribute">{entry.attribute}</code>
                      ) : null}
                      {kindLabel ? (
                        <span className="gcAttributeHistory__type">{kindLabel}</span>
                      ) : null}
                    </div>
                    {entry.summary ? (
                      <p className="gcAttributeHistory__summary">{entry.summary}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
      <button type="button" className="gcHeaderLink gcSectionLink" onClick={onViewAll}>
        View full release notes
      </button>
    </div>
  );
}
