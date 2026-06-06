import React, { useEffect, useState } from "react";
import DependencyNote from "./DependencyNote.jsx";
import {
  extractResourceReleaseNotesMarkdown,
  fetchReleaseNotesMarkdown,
  toReleaseNotesVersion,
} from "./releaseNotes.js";

export default function ResourceReleaseChanges({
  version,
  resourceType,
  onViewAll,
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!version || !resourceType) {
      setContent("");
      setError("");
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const markdown = await fetchReleaseNotesMarkdown(version);
        const extracted = extractResourceReleaseNotesMarkdown(markdown, resourceType);
        if (!cancelled) setContent(extracted);
      } catch (e) {
        if (!cancelled) {
          setContent("");
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
    <div className="gcResourceReleaseChanges">
      <div className="gcPanel">
        <div className="gcPanel__header">
          <div className="gcPanel__title">Changes in {versionLabel}</div>
        </div>
        <div className="gcPanel__body">
          {loading ? <div className="gcMuted">Loading changes…</div> : null}

          {error ? (
            <div className="gcMuted" role="alert">
              Could not load release notes.
            </div>
          ) : null}

          {!loading && !error && !content ? (
            <div className="gcMuted">No provider changes for this resource in {versionLabel}.</div>
          ) : null}

          {!loading && !error && content ? (
            <div className="gcDependencyNote__body">
              <DependencyNote content={content} />
            </div>
          ) : null}

          <button type="button" className="gcHeaderLink gcResourceReleaseChanges__link" onClick={onViewAll}>
            View full release notes
          </button>
        </div>
      </div>
    </div>
  );
}
