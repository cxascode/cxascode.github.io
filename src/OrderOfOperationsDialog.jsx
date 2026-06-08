import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeCreationOrder } from "./dependencyOrder.js";
import { toReleaseNotesVersion } from "./releaseNotes.js";

export default function OrderOfOperationsDialog({
  open,
  onClose,
  depsMap,
  hiddenTypes,
  onSelectType,
  selectedVersion,
  onVersionChange,
  availableVersions,
  newestListedRelease,
  loadingIndex,
  loadingData,
}) {
  const dialogRef = useRef(null);
  const versionDropdownRef = useRef(null);
  const selectedVersionRef = useRef(selectedVersion);
  const [query, setQuery] = useState("");

  useEffect(() => {
    selectedVersionRef.current = selectedVersion;
  }, [selectedVersion]);

  const order = useMemo(
    () => computeCreationOrder(depsMap, { hiddenTypes }),
    [depsMap, hiddenTypes]
  );

  const normalizedQuery = query.trim().toLowerCase();

  const visibleTierGroups = useMemo(() => {
    const groups = order.tiers.map((tier, tierIndex) => ({
      tier,
      tierIndex,
    }));

    if (!normalizedQuery) return groups;

    return groups
      .map(({ tier, tierIndex }) => ({
        tier: tier.filter((type) => type.toLowerCase().includes(normalizedQuery)),
        tierIndex,
      }))
      .filter(({ tier }) => tier.length > 0);
  }, [order.tiers, normalizedQuery]);

  const visibleCount = useMemo(
    () => visibleTierGroups.reduce((sum, group) => sum + group.tier.length, 0),
    [visibleTierGroups]
  );

  const resourceCountLabel = loadingData
    ? "Loading dependency data…"
    : normalizedQuery
      ? `${visibleCount} of ${order.resourceCount} resource types in ${visibleTierGroups.length} tier${visibleTierGroups.length === 1 ? "" : "s"}`
      : `${order.resourceCount} resource types in ${order.tierCount} tier${order.tierCount === 1 ? "" : "s"}`;

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
    const el = versionDropdownRef.current;
    if (!el) return;

    const handler = (evt) => {
      const next = evt?.target?.value ?? evt?.detail?.value ?? "";
      const normalizedNext = next || "latest";

      if (normalizedNext === selectedVersionRef.current) return;
      onVersionChange?.(normalizedNext);
    };

    el.addEventListener("guxchange", handler);
    el.addEventListener("change", handler);

    return () => {
      el.removeEventListener("guxchange", handler);
      el.removeEventListener("change", handler);
    };
  }, [onVersionChange]);

  useEffect(() => {
    const el = versionDropdownRef.current;
    if (!el) return;

    if (el.value !== selectedVersion) {
      el.value = selectedVersion;
    }
    el.setAttribute("value", selectedVersion);
  }, [selectedVersion, open]);

  const versionPickerDisabled = loadingIndex || loadingData;

  const handleClose = useCallback(
    (nextResourceType) => {
      setQuery("");
      onClose?.(nextResourceType);
    },
    [onClose]
  );

  const clearFilter = () => {
    setQuery("");
  };

  const handleSelectType = (type) => {
    onSelectType?.(type);
    handleClose(type);
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="gcOrderDialog"
      aria-labelledby="creation-order-title"
      onCancel={handleClose}
      onClose={handleClose}
    >
      <div className="gcOrderDialog__panel">
        <div className="gcOrderDialog__chrome">
          <div className="gcOrderDialog__header">
            <div className="gcOrderDialog__headerMain">
              <h2 id="creation-order-title" className="gcOrderDialog__title">
                Creation order
              </h2>
              <p className="gcOrderDialog__subtitle">
                Suggested creation order of CX as Code resources per{" "}
                <a
                  href="https://developer.genesys.cloud/devapps/cx-as-code/bestpractices"
                  target="_blank"
                  rel="noreferrer"
                >
                  best practices
                </a>
                . Earlier tiers should be created before later tiers. Types in the same tier can be
                created in any order and are listed alphabetically.
              </p>
              {order.cyclicTypes.size ? (
                <div className="gcOrderDialog__notice" role="note">
                  {order.cyclicTypes.size} resource type
                  {order.cyclicTypes.size === 1 ? "" : "s"} share mutual dependencies and appear in
                  the same tier. Terraform may still resolve these at apply time.
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="gcOrderDialog__close"
              aria-label="Close creation order"
              onClick={handleClose}
            >
              ×
            </button>
          </div>

          <div className="gcOrderDialog__toolbar gcOrderDialog__toolbar--creationOrder">
            <input
              type="search"
              className="gcSearchInput gcOrderDialog__search"
              placeholder="Filter resource types"
              value={query}
              onInput={(event) => {
                setQuery(event.target.value);
              }}
            />
            <div className="gcOrderDialog__toolbarActions">
              <div className="gcVersionPicker">
                <span className="gcMetaLabel">Version:</span>
                <gux-dropdown ref={versionDropdownRef} disabled={versionPickerDisabled}>
                  <gux-listbox>
                    <gux-option value="latest">
                      Latest{" "}
                      {newestListedRelease
                        ? `(${toReleaseNotesVersion(newestListedRelease)})`
                        : ""}
                    </gux-option>

                    {availableVersions.map((v) => (
                      <gux-option key={v} value={v}>
                        {toReleaseNotesVersion(v)}
                      </gux-option>
                    ))}
                  </gux-listbox>
                </gux-dropdown>
              </div>
              <button
                type="button"
                className="gcClearButton gcClearButton--toolbarEnd"
                onClick={clearFilter}
                disabled={!query}
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="gcOrderDialog__body">
          {loadingData ? (
            <div className="gcMuted">Loading dependency data for this version…</div>
          ) : !visibleTierGroups.length ? (
            <div className="gcMuted">No matching resource types.</div>
          ) : (
            visibleTierGroups.map(({ tier, tierIndex }) => {
              const tierNumber = tierIndex + 1;
              const tierLabel =
                tierNumber === 1
                  ? "Create first"
                  : tierNumber === order.tierCount
                    ? "Create last"
                    : "";

              return (
                <section key={`tier-${tierNumber}-${tier[0]}`} className="gcOrderDialog__tier">
                  <div className="gcOrderDialog__tierHeader">
                    <h3 className="gcOrderDialog__tierTitle">
                      Tier {tierNumber}
                      {tierLabel ? ` — ${tierLabel}` : ""}
                    </h3>
                    <gux-badge>{tier.length}</gux-badge>
                  </div>
                  <ol className="gcOrderDialog__tierList">
                    {tier.map((type) => (
                      <li key={type} className="gcOrderDialog__tierItem">
                        <button
                          type="button"
                          className="gcOrderDialog__typeButton gcMono"
                          onClick={() => handleSelectType(type)}
                        >
                          {type}
                        </button>
                        {order.cyclicTypes.has(type) ? (
                          <span className="gcOrderDialog__cycleTag">Mutual dependency</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })
          )}
        </div>

        <div className="gcListFooter">
          <p className="gcListCount" aria-live="polite">
            {resourceCountLabel}
          </p>
        </div>
      </div>
    </dialog>,
    document.body
  );
}
