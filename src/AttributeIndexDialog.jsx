import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  attributeIndexHistoryRowKey,
  ATTRIBUTE_INDEX_DESCRIPTION,
  ATTRIBUTE_INDEX_SCOPE_EXPORT,
  ATTRIBUTE_INDEX_SCOPE_PROVIDER,
  ATTRIBUTE_INDEX_VIEW_ALL,
  ATTRIBUTE_INDEX_VIEW_TYPE_LIFECYCLE,
  fetchResourceAttributeIndex,
  filterIndexEntries,
  ATTRIBUTE_INDEX_TYPE_LIFECYCLE_ADDED,
  ATTRIBUTE_INDEX_TYPE_LIFECYCLE_REMOVED,
  flattenAttributeIndexEntries,
  flattenAttributeIndexTypeLifecycleRows,
  formatAttributeIndexHistoryRowVersionLabel,
  formatAttributeIndexTypeLifecycleKind,
  formatAttributeIndexTypeLifecycleStatus,
  formatAttributeIndexType,
  getIndexFilterOptions,
  getAttributeIndexTypeLifecycleVersionOptions,
  getIndexVersionOptions,
  isAttributeIndexTypeLifecycleEntry,
} from "./resourceAttributeIndex.js";
import { TF_EXPORT_RESOURCE, toReleaseNotesVersion } from "./releaseNotes.js";

const SCOPE_OPTIONS = [
  { id: ATTRIBUTE_INDEX_SCOPE_PROVIDER, label: "All resources" },
  { id: ATTRIBUTE_INDEX_SCOPE_EXPORT, label: "Export" },
];

const VIEW_OPTIONS = [
  { id: ATTRIBUTE_INDEX_VIEW_ALL, label: "All" },
  {
    id: ATTRIBUTE_INDEX_VIEW_TYPE_LIFECYCLE,
    label: "Added/Removed",
    title: "Resource and data source types added or removed",
  },
];

function StatusBadge({ status }) {
  const normalized = (status || "").trim();
  const className =
    normalized === "Removed"
      ? "gcAttributeHistory__status gcAttributeHistory__status--removed"
      : "gcAttributeHistory__status gcAttributeHistory__status--active";

  return <span className={className}>{normalized || "Unknown"}</span>;
}

function TypeLifecycleStatusBadge({ status }) {
  const className =
    status === ATTRIBUTE_INDEX_TYPE_LIFECYCLE_ADDED
      ? "gcAttributeIndexLifecycle__status gcAttributeIndexLifecycle__status--added"
      : "gcAttributeIndexLifecycle__status gcAttributeIndexLifecycle__status--removed";

  return <span className={className}>{formatAttributeIndexTypeLifecycleStatus(status)}</span>;
}

function LifecycleTableColgroup({ showVersionColumn }) {
  return (
    <colgroup>
      {showVersionColumn ? <col className="gcAttributeIndexLifecycle__colVersion" /> : null}
      <col />
      <col className="gcAttributeIndexLifecycle__colStatus" />
      <col className="gcAttributeIndexLifecycle__colKind" />
    </colgroup>
  );
}

function LifecycleTableHead({ showVersionColumn }) {
  return (
    <thead>
      <tr>
        {showVersionColumn ? <th scope="col">Version</th> : null}
        <th scope="col">Type</th>
        <th scope="col">Status</th>
        <th scope="col">Kind</th>
      </tr>
    </thead>
  );
}

function LifecycleTableBodyRows({
  rows,
  showVersionColumn,
  isExportScope,
  knownTypes,
  onSelectResource,
}) {
  return rows.map((row) => {
    const selectable =
      !isExportScope &&
      row.resource &&
      (!(knownTypes instanceof Set) || knownTypes.has(row.resource));

    return (
      <tr key={`${row.version}:${row.status}:${row.kind}:${row.resource}`}>
        {showVersionColumn ? (
          <td className="gcAttributeIndexLifecycle__version">
            {toReleaseNotesVersion(row.version)}
          </td>
        ) : null}
        <td className="gcAttributeIndexLifecycle__name">
          {selectable ? (
            <button
              type="button"
              className="gcAttributeIndexLifecycle__link"
              onClick={() => onSelectResource(row.resource)}
            >
              <code>{row.resource}</code>
            </button>
          ) : (
            <code>{row.resource}</code>
          )}
        </td>
        <td>
          <TypeLifecycleStatusBadge status={row.status} />
        </td>
        <td>{formatAttributeIndexTypeLifecycleKind(row.kind)}</td>
      </tr>
    );
  });
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
  const [viewMode, setViewMode] = useState(ATTRIBUTE_INDEX_VIEW_ALL);

  const isExportScope = scope === ATTRIBUTE_INDEX_SCOPE_EXPORT;
  const typeLifecycleOnly = viewMode === ATTRIBUTE_INDEX_VIEW_TYPE_LIFECYCLE;

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
    setViewMode(ATTRIBUTE_INDEX_VIEW_ALL);
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

  const scopedIndex = useMemo(() => {
    if (typeLifecycleOnly) {
      return index.filter(isAttributeIndexTypeLifecycleEntry);
    }
    return flattenAttributeIndexEntries(index);
  }, [index, typeLifecycleOnly]);

  const lifecycleRows = useMemo(() => {
    if (!typeLifecycleOnly) return [];

    const entries = filterIndexEntries(index, {
      query: "",
      typeFilter,
      versionFilter,
      typeLifecycleOnly: true,
    });

    return flattenAttributeIndexTypeLifecycleRows(entries);
  }, [index, typeFilter, versionFilter, typeLifecycleOnly]);

  const visibleLifecycleRows = useMemo(() => {
    if (!typeLifecycleOnly) return [];
    return lifecycleRows;
  }, [lifecycleRows, typeLifecycleOnly]);

  const showVersionColumn = typeLifecycleOnly && !versionFilter;

  const filterOptions = useMemo(() => getIndexFilterOptions(scopedIndex), [scopedIndex]);
  const versionOptions = useMemo(
    () =>
      typeLifecycleOnly
        ? getAttributeIndexTypeLifecycleVersionOptions(index)
        : getIndexVersionOptions(scopedIndex),
    [index, scopedIndex, typeLifecycleOnly]
  );

  const visibleEntries = useMemo(
    () =>
      typeLifecycleOnly
        ? []
        : filterIndexEntries(index, {
            query,
            typeFilter,
            versionFilter,
            typeLifecycleOnly: false,
          }),
    [index, query, typeFilter, versionFilter, typeLifecycleOnly]
  );

  const hasActiveFilters = typeLifecycleOnly
    ? Boolean(typeFilter || versionFilter)
    : Boolean(query || typeFilter || versionFilter);

  const entryCountLabel = loading
    ? "Loading attribute index…"
    : error
      ? "Could not load attribute index."
      : typeLifecycleOnly
        ? hasActiveFilters
          ? `${visibleLifecycleRows.length} of ${lifecycleRows.length} types`
          : `${lifecycleRows.length} types`
        : hasActiveFilters
          ? `${visibleEntries.length} of ${scopedIndex.length} entries`
          : `${scopedIndex.length} entries`;

  const showLifecycleTable =
    !error && !loading && typeLifecycleOnly && visibleLifecycleRows.length > 0;

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
    setViewMode(ATTRIBUTE_INDEX_VIEW_ALL);
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
                  onClick={() => {
                    setScope(option.id);
                    if (option.id === ATTRIBUTE_INDEX_SCOPE_EXPORT) {
                      setViewMode(ATTRIBUTE_INDEX_VIEW_ALL);
                    }
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {!typeLifecycleOnly ? (
              <input
                type="search"
                className="gcSearchInput gcOrderDialog__search"
                placeholder={
                  isExportScope ? "Search export attributes" : "Search resources, attributes"
                }
                value={query}
                onInput={(event) => onQueryChange?.(event.target.value)}
                disabled={loading || !!error}
              />
            ) : null}
            <div className="gcOrderDialog__toolbarActions">
              <select
                className="gcSelectInput"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                disabled={loading || !!error}
                aria-label={typeLifecycleOnly ? "Filter by kind" : "Filter by change type"}
              >
                <option value="">{typeLifecycleOnly ? "All kinds" : "All types"}</option>
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
        </div>

        {showLifecycleTable ? (
          <div className="gcAttributeIndexLifecycle__tableShell">
            <div className="gcAttributeIndexLifecycle__tableHead">
              <table className="gcAttributeIndexLifecycle__table gcAttributeIndexLifecycle__table--fixed">
                <LifecycleTableColgroup showVersionColumn={showVersionColumn} />
                <LifecycleTableHead showVersionColumn={showVersionColumn} />
              </table>
            </div>
            <div className="gcAttributeIndexLifecycle__tableBodyScroll">
              <table className="gcAttributeIndexLifecycle__table gcAttributeIndexLifecycle__table--fixed">
                <LifecycleTableColgroup showVersionColumn={showVersionColumn} />
                <tbody>
                  <LifecycleTableBodyRows
                    rows={visibleLifecycleRows}
                    showVersionColumn={showVersionColumn}
                    isExportScope={isExportScope}
                    knownTypes={knownTypes}
                    onSelectResource={handleSelectResource}
                  />
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="gcOrderDialog__body">
            {error ? (
              <div className="gcAlert" role="alert">
                <div className="gcAlert__body gcMono">{error}</div>
              </div>
            ) : null}

            {!error && loading ? <div className="gcMuted">Loading attribute index…</div> : null}

            {!error && !loading && typeLifecycleOnly && !visibleLifecycleRows.length ? (
              <div className="gcMuted">No matching resource or data source types added or removed.</div>
            ) : null}

            {!error && !loading && !typeLifecycleOnly && !visibleEntries.length ? (
              <div className="gcMuted">No matching attribute history entries.</div>
            ) : null}

            {!error && !loading && !typeLifecycleOnly && visibleEntries.length ? (
              <div className="gcAttributeIndex__list">
                {visibleEntries.map((row) => {
                  const canSelect =
                    !isExportScope &&
                    row.resource &&
                    (!(knownTypes instanceof Set) || knownTypes.has(row.resource));
                  const versionEventLabel = formatAttributeIndexHistoryRowVersionLabel(row);
                  const summary = (row.summary || "").trim();

                  return (
                    <button
                      key={attributeIndexHistoryRowKey(row)}
                      type="button"
                      className={`gcAttributeIndex__row ${canSelect ? "" : "isStatic"}`}
                      onClick={() => handleSelectResource(row.resource)}
                      disabled={!canSelect}
                      title={
                        canSelect
                          ? `Open ${row.resource} in the explorer`
                          : isExportScope
                            ? `${TF_EXPORT_RESOURCE} attribute history`
                            : `${row.resource} is not in the dependency explorer`
                      }
                    >
                      <div className="gcAttributeIndex__rowMain">
                        <code className="gcAttributeIndex__resource gcMono">{row.resource}</code>
                        <code className="gcAttributeIndex__attribute">{row.attribute}</code>
                      </div>
                      <div className="gcAttributeIndex__rowMeta">
                        <span className="gcAttributeHistory__type">
                          {formatAttributeIndexType(row.type)}
                        </span>
                        <StatusBadge status={row.status} />
                        {versionEventLabel ? (
                          <span className="gcAttributeHistory__version">{versionEventLabel}</span>
                        ) : null}
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
        )}

        <div className="gcListFooter">
          <p className="gcListCount" aria-live="polite">
            {entryCountLabel}
          </p>
          {!isExportScope ? (
            <div className="gcDivisionFilterBlock">
              <span className="gcDivisionFilterLabel" id="attribute-index-view-label">
                Show
              </span>
              <div
                className="gcSegmentedControl gcSegmentedControl--text gcAttributeIndex__viewToggle"
                role="radiogroup"
                aria-labelledby="attribute-index-view-label"
                title="Filter to resource and data source types added or removed"
              >
                {VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="gcSegmentedControl__option"
                    role="radio"
                    aria-checked={viewMode === option.id}
                    title={option.title}
                    disabled={loading || !!error}
                    onClick={() => {
                      if (option.id === ATTRIBUTE_INDEX_VIEW_TYPE_LIFECYCLE) {
                        onQueryChange?.("");
                      }
                      setViewMode(option.id);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
