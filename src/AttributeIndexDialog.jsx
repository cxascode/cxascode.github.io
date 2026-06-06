import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  attributeIndexEntryKey,
  ATTRIBUTE_INDEX_DESCRIPTION,
  fetchResourceAttributeIndex,
  fetchResourceAttributeIndexMarkdown,
  filterIndexEntries,
  formatAttributeIndexIntroducedLabel,
  formatAttributeIndexLastChanged,
  formatAttributeIndexType,
  getIndexFilterOptions,
} from "./resourceAttributeIndex.js";

function StatusBadge({ status }) {
  const normalized = (status || "").trim();
  const className =
    normalized === "Removed"
      ? "gcAttributeHistory__status gcAttributeHistory__status--removed"
      : "gcAttributeHistory__status gcAttributeHistory__status--active";

  return <span className={className}>{normalized || "Unknown"}</span>;
}

export default function AttributeIndexDialog({ open, onClose, onSelectResource, knownTypes }) {
  const dialogRef = useRef(null);
  const [index, setIndex] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

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
  }, [open]);

  const filterOptions = useMemo(() => getIndexFilterOptions(index), [index]);

  const visibleEntries = useMemo(
    () =>
      filterIndexEntries(index, {
        query,
        typeFilter,
        statusFilter,
      }),
    [index, query, typeFilter, statusFilter]
  );

  const handleClose = useCallback(
    (nextResourceType) => {
      setQuery("");
      setTypeFilter("");
      setStatusFilter("");
      onClose?.(nextResourceType);
    },
    [onClose]
  );

  const downloadAttributeIndex = useCallback(async () => {
    try {
      const markdown = await fetchResourceAttributeIndexMarkdown();
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "cx-as-code-resource-attribute-index.md";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* download failures are non-fatal */
    }
  }, []);

  const handleSelectResource = (resourceType) => {
    if (!resourceType) return;
    if (knownTypes instanceof Set && !knownTypes.has(resourceType)) return;

    onSelectResource?.(resourceType);
    handleClose(resourceType);
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="gcOrderDialog"
      aria-labelledby="attribute-index-title"
      onCancel={handleClose}
      onClose={handleClose}
    >
      <div className="gcOrderDialog__panel">
        <div className="gcOrderDialog__header">
          <div>
            <h2 id="attribute-index-title" className="gcOrderDialog__title">
              Attribute history
            </h2>
            <p className="gcOrderDialog__subtitle">{ATTRIBUTE_INDEX_DESCRIPTION}</p>
          </div>
          <button
            type="button"
            className="gcOrderDialog__close"
            aria-label="Close attribute history"
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        <div className="gcOrderDialog__toolbar">
          <input
            type="search"
            className="gcSearchInput gcOrderDialog__search"
            placeholder="Search resources, attributes, or notes"
            value={query}
            onInput={(event) => setQuery(event.target.value)}
            disabled={loading || !!error}
          />
          <select
            className="gcSelectInput"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            disabled={loading || !!error}
            aria-label="Filter by change type"
          >
            <option value="">All types</option>
            {filterOptions.types.map((type) => (
              <option key={type} value={type}>
                {formatAttributeIndexType(type)}
              </option>
            ))}
          </select>
          <select
            className="gcSelectInput"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            disabled={loading || !!error}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {filterOptions.statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="gcHeaderLink"
            onClick={downloadAttributeIndex}
            disabled={loading || !!error}
          >
            Download attribute index
          </button>
        </div>

        <div className="gcOrderDialog__meta">
          {loading
            ? "Loading attribute index…"
            : error
              ? "Could not load attribute index."
              : query || typeFilter || statusFilter
                ? `${visibleEntries.length} of ${index.length} entries`
                : `${index.length} entries`}
        </div>

        <div className="gcOrderDialog__body">
          {error ? (
            <div className="gcAlert" role="alert">
              <div className="gcAlert__body gcMono">{error}</div>
            </div>
          ) : null}

          {!error && loading ? <div className="gcMuted">Loading attribute index…</div> : null}

          {!error && !loading && !visibleEntries.length ? (
            <div className="gcMuted">No matching attribute history entries.</div>
          ) : null}

          {!error && !loading && visibleEntries.length ? (
            <div className="gcAttributeIndex__list">
              {visibleEntries.map((entry) => {
                const canSelect =
                  entry.resource &&
                  (!(knownTypes instanceof Set) || knownTypes.has(entry.resource));
                const introducedLabel = formatAttributeIndexIntroducedLabel(entry.introduced);
                const lastChangedLabel = formatAttributeIndexLastChanged(
                  entry.last_updated,
                  entry.introduced
                );

                return (
                  <button
                    key={attributeIndexEntryKey(entry)}
                    type="button"
                    className={`gcAttributeIndex__row ${canSelect ? "" : "isStatic"}`}
                    onClick={() => handleSelectResource(entry.resource)}
                    disabled={!canSelect}
                    title={
                      canSelect
                        ? `Open ${entry.resource} in the explorer`
                        : `${entry.resource} is not in the dependency explorer`
                    }
                  >
                    <div className="gcAttributeIndex__rowMain">
                      <code className="gcAttributeIndex__resource gcMono">{entry.resource}</code>
                      <code className="gcAttributeIndex__attribute">{entry.attribute}</code>
                    </div>
                    <div className="gcAttributeIndex__rowMeta">
                      <span className="gcAttributeHistory__type">
                        {formatAttributeIndexType(entry.type)}
                      </span>
                      <StatusBadge status={entry.status} />
                      {introducedLabel ? (
                        <span className="gcAttributeHistory__introduced">{introducedLabel}</span>
                      ) : null}
                      {lastChangedLabel ? (
                        <span className="gcAttributeHistory__version">{lastChangedLabel}</span>
                      ) : null}
                    </div>
                    {entry.latest_summary ? (
                      <p className="gcAttributeIndex__summary">{entry.latest_summary}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
