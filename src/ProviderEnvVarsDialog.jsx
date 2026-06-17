import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ENV_VAR_STATUS_CATALOGED,
  ENV_VAR_STATUS_EXPORT_TEMPLATE,
  ENV_VAR_STATUS_IGNORED,
  filterProviderEnvVarRows,
  normalizeProviderEnvVarsCatalog,
  PROVIDER_ENV_VARS_DESCRIPTION,
  providerEnvVarStatusLabel,
} from "./providerEnvVarsCatalog.js";

const STATUS_FILTER_OPTIONS = [
  { id: "", label: "All statuses" },
  { id: ENV_VAR_STATUS_EXPORT_TEMPLATE, label: "Export template" },
  { id: ENV_VAR_STATUS_CATALOGED, label: "Cataloged" },
  { id: ENV_VAR_STATUS_IGNORED, label: "Ignored" },
];

function StatusBadge({ status }) {
  const className =
    status === ENV_VAR_STATUS_EXPORT_TEMPLATE
      ? "gcProviderEnvVars__status gcProviderEnvVars__status--template"
      : status === ENV_VAR_STATUS_IGNORED
        ? "gcProviderEnvVars__status gcProviderEnvVars__status--ignored"
        : "gcProviderEnvVars__status gcProviderEnvVars__status--cataloged";

  return <span className={className}>{providerEnvVarStatusLabel(status)}</span>;
}

export default function ProviderEnvVarsDialog({ open, onClose, catalog, loadingCatalog }) {
  const dialogRef = useRef(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const rows = useMemo(() => normalizeProviderEnvVarsCatalog(catalog), [catalog]);
  const visibleRows = useMemo(
    () => filterProviderEnvVarRows(rows, { query, status: statusFilter }),
    [rows, query, statusFilter]
  );

  const hasActiveFilters = Boolean(query || statusFilter);
  const loading = loadingCatalog && !catalog;

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
      setQuery("");
      setStatusFilter("");
    }
  }, [open]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("");
  };

  const entryCountLabel = loading
    ? "Loading provider environment variables…"
    : hasActiveFilters
      ? `${visibleRows.length} of ${rows.length} variables`
      : `${rows.length} variables`;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="gcOrderDialog"
      aria-labelledby="provider-env-vars-title"
      onCancel={handleClose}
      onClose={handleClose}
    >
      <div className="gcOrderDialog__panel">
        <div className="gcOrderDialog__chrome">
          <div className="gcOrderDialog__header">
            <div className="gcOrderDialog__headerMain">
              <h2 id="provider-env-vars-title" className="gcOrderDialog__title">
                Provider environment variables
              </h2>
              <p className="gcOrderDialog__subtitle">{PROVIDER_ENV_VARS_DESCRIPTION}</p>
            </div>
            <button
              type="button"
              className="gcOrderDialog__close"
              aria-label="Close provider environment variables"
              onClick={handleClose}
            >
              ×
            </button>
          </div>

          <div className="gcOrderDialog__toolbar gcOrderDialog__toolbar--providerEnvVars">
            <input
              type="search"
              className="gcSearchInput gcOrderDialog__search"
              placeholder="Search names, descriptions, resource types"
              value={query}
              onInput={(event) => setQuery(event.target.value)}
              disabled={loading}
            />
            <select
              className="gcSelectInput"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              disabled={loading}
              aria-label="Filter by catalog status"
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.id || "all"} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="gcClearButton gcClearButton--toolbarEnd"
              onClick={clearFilters}
              disabled={loading || !hasActiveFilters}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="gcOrderDialog__body">
          {loading ? (
            <div className="gcMuted">Loading provider environment variables…</div>
          ) : visibleRows.length === 0 ? (
            <div className="gcMuted">
              {rows.length === 0
                ? "No environment variables in the catalog."
                : "No variables match the current filters."}
            </div>
          ) : (
            <table className="gcProviderEnvVars__table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Description</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.name}>
                    <td className="gcProviderEnvVars__name">
                      <code>{row.name}</code>
                    </td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>{row.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
