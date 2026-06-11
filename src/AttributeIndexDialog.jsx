import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  attributeIndexEntryKey,
  ATTRIBUTE_INDEX_DESCRIPTION,
  ATTRIBUTE_INDEX_SCOPE_EXPORT,
  ATTRIBUTE_INDEX_SCOPE_PROVIDER,
  fetchResourceAttributeIndex,
  filterIndexEntries,
  formatAttributeIndexIntroducedLabel,
  formatAttributeIndexLastChanged,
  formatAttributeIndexRowSummary,
  formatAttributeIndexType,
  formatAttributeIndexVersionEventLabel,
  getIndexFilterOptions,
  getIndexVersionOptions,
} from "./resourceAttributeIndex.js";
import { TF_EXPORT_RESOURCE, toReleaseNotesVersion } from "./releaseNotes.js";

const SCOPE_OPTIONS = [
  { id: ATTRIBUTE_INDEX_SCOPE_PROVIDER, label: "All resources" },
  { id: ATTRIBUTE_INDEX_SCOPE_EXPORT, label: "Export" },
];

function StatusBadge({ status }) {
  const normalized = (status || "").trim();
  const className =
    normalized === "Removed"
      ? "gcAttributeHistory__status gcAttributeHistory__status--removed"
      : "gcAttributeHistory__status gcAttributeHistory__status--active";

  return <span className={className}>{normalized || "Unknown"}</span>;
}

export default function AttributeIndexDialog({
  open,
  onClose,
  onSelectResource,
  knownTypes,
  query = "",
  onQueryChange,
  versionFilter = "",
  onVersionFilterChange,
}) {
  const dialogRef = useRef(null);
  const [scope, setScope] = useState(ATTRIBUTE_INDEX_SCOPE_PROVIDER);
  const [index, setIndex] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const isExportScope = scope === ATTRIBUTE_INDEX_SCOPE_EXPORT;

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
    if (!open) {
      setScope(ATTRIBUTE_INDEX_SCOPE_PROVIDER);
      return;
    }

    setTypeFilter("");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchResourceAttributeIndex(scope);
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
  }, [open, scope]);

  const filterOptions = useMemo(() => getIndexFilterOptions(index), [index]);
  const versionOptions = useMemo(() => getIndexVersionOptions(index), [index]);

  const visibleEntries = useMemo(
    () =>
      filterIndexEntries(index, {
        query,
        typeFilter,
        versionFilter,
      }),
    [index, query, typeFilter, versionFilter]
  );

  const hasActiveFilters = Boolean(query || typeFilter || versionFilter);

  const entryCountLabel = loading
    ? "Loading attribute index…"
    : error
      ? "Could not load attribute index."
      : hasActiveFilters
        ? `${visibleEntries.length} of ${index.length} entries`
        : `${index.length} entries`;

  const handleClose = useCallback(
    (nextResourceType) => {
      setTypeFilter("");
      onClose?.(nextResourceType);
    },
    [onClose]
  );

  const clearFilters = () => {
    onQueryChange?.("");
    onVersionFilterChange?.("");
    setTypeFilter("");
  };

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
        <div className="gcOrderDialog__chrome">
          <div className="gcOrderDialog__header">
            <div className="gcOrderDialog__headerMain">
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

          <div className="gcOrderDialog__toolbar gcOrderDialog__toolbar--attributeIndex">
            <div
              className="gcSegmentedControl gcSegmentedControl--text"
              role="radiogroup"
              aria-label="Attribute index scope"
            >
              {SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="gcSegmentedControl__option"
                  role="radio"
                  aria-checked={scope === option.id}
                  onClick={() => setScope(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="gcSearchInput gcOrderDialog__search"
              placeholder={
                isExportScope
                  ? "Search export attributes"
                  : "Search resources, attributes"
              }
              value={query}
              onInput={(event) => onQueryChange?.(event.target.value)}
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
              value={versionFilter}
              onChange={(event) => onVersionFilterChange?.(event.target.value)}
              disabled={loading || !!error}
              aria-label="Filter by version"
            >
              <option value="">All versions</option>
              {versionOptions.map((version) => (
                <option key={version} value={version}>
                  {toReleaseNotesVersion(version)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="gcClearButton gcClearButton--toolbarEnd"
              onClick={clearFilters}
              disabled={loading || !!error || !hasActiveFilters}
            >
              Clear
            </button>
          </div>
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
                  !isExportScope &&
                  entry.resource &&
                  (!(knownTypes instanceof Set) || knownTypes.has(entry.resource));
                const introducedLabel = formatAttributeIndexIntroducedLabel(entry.introduced);
                const lastChangedLabel = formatAttributeIndexLastChanged(
                  entry.last_updated,
                  entry.introduced
                );
                const versionEventLabel = formatAttributeIndexVersionEventLabel(
                  entry,
                  versionFilter
                );
                const summary = formatAttributeIndexRowSummary(entry, versionFilter);

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
                        : isExportScope
                          ? `${TF_EXPORT_RESOURCE} attribute history`
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
                      {versionFilter ? (
                        versionEventLabel ? (
                          <span className="gcAttributeHistory__version">{versionEventLabel}</span>
                        ) : null
                      ) : (
                        <>
                          {introducedLabel ? (
                            <span className="gcAttributeHistory__introduced">{introducedLabel}</span>
                          ) : null}
                          {lastChangedLabel ? (
                            <span className="gcAttributeHistory__version">{lastChangedLabel}</span>
                          ) : null}
                        </>
                      )}
                    </div>
                    {summary ? (
                      <p className="gcAttributeIndex__summary">{summary}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="gcListFooter">
          <p className="gcListCount" aria-live="polite">
            {entryCountLabel}
          </p>
        </div>
      </div>
    </dialog>,
    document.body
  );
}
