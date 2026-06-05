import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeCreationOrder, formatCreationOrderText } from "./dependencyOrder.js";

export default function OrderOfOperationsDialog({
  open,
  onClose,
  depsMap,
  hiddenTypes,
  onSelectType,
}) {
  const dialogRef = useRef(null);
  const [query, setQuery] = useState("");
  const [copyState, setCopyState] = useState("idle");

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

  const exportText = useMemo(() => {
    const filtered = normalizedQuery
      ? {
          tiers: visibleTierGroups.map(({ tier }) => tier),
          cyclicTypes: order.cyclicTypes,
        }
      : order;
    return formatCreationOrderText(filtered);
  }, [normalizedQuery, order, visibleTierGroups]);

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

  const handleClose = useCallback(() => {
    setQuery("");
    setCopyState("idle");
    onClose?.();
  }, [onClose]);

  const handleCopy = async () => {
    if (!exportText) return;

    try {
      await navigator.clipboard.writeText(exportText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const handleSelectType = (type) => {
    onSelectType?.(type);
    handleClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="gcOrderDialog"
      aria-labelledby="order-of-operations-title"
      onCancel={handleClose}
      onClose={handleClose}
    >
      <div className="gcOrderDialog__panel">
        <div className="gcOrderDialog__header">
          <div>
            <h2 id="order-of-operations-title" className="gcOrderDialog__title">
              Order of operations
            </h2>
            <p className="gcOrderDialog__subtitle">
              Suggested creation order of CX as Code resources. Earlier tiers should be created
              before later tiers. Types in the same tier can be created in any order and are
              listed alphabetically.
            </p>
          </div>
          <button
            type="button"
            className="gcOrderDialog__close"
            aria-label="Close order of operations"
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        {order.cyclicTypes.size ? (
          <div className="gcOrderDialog__notice" role="note">
            {order.cyclicTypes.size} resource type
            {order.cyclicTypes.size === 1 ? "" : "s"} share mutual dependencies and appear in
            the same tier. Terraform may still resolve these at apply time.
          </div>
        ) : null}

        <div className="gcOrderDialog__toolbar">
          <input
            type="search"
            className="gcSearchInput gcOrderDialog__search"
            placeholder="Filter resource types"
            value={query}
            onInput={(event) => {
              setQuery(event.target.value);
              setCopyState("idle");
            }}
          />
          <button type="button" className="gcCopyButton" onClick={handleCopy} disabled={!exportText}>
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy list"}
          </button>
        </div>

        <div className="gcOrderDialog__meta">
          {normalizedQuery
            ? `${visibleCount} of ${order.resourceCount} resource types in ${visibleTierGroups.length} tier${visibleTierGroups.length === 1 ? "" : "s"}`
            : `${order.resourceCount} resource types in ${order.tierCount} tier${order.tierCount === 1 ? "" : "s"}`}
        </div>

        <div className="gcOrderDialog__body">
          {!visibleTierGroups.length ? (
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
      </div>
    </dialog>
  );
}
