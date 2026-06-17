import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DependencyNote from "./DependencyNote.jsx";
import {
  fetchSiteUpdatesIndex,
  fetchSiteUpdatesMarkdown,
  formatSiteUpdatesEntryLabel,
  siteUpdatesEntriesFromIndex,
} from "./siteUpdates.js";

export default function SiteUpdatesDialog({ open, onClose, selectedEntry, onEntryChange }) {
  const dialogRef = useRef(null);
  const entryDropdownRef = useRef(null);
  const selectedEntryRef = useRef(selectedEntry);

  const [entries, setEntries] = useState([]);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const newestEntry = entries[0]?.version || "";
  const effectiveEntry = selectedEntry === "latest" ? newestEntry : selectedEntry;
  const entryHasUpdates =
    !effectiveEntry || entries.some((entry) => entry.version === effectiveEntry);

  useEffect(() => {
    selectedEntryRef.current = selectedEntry;
  }, [selectedEntry]);

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
        setLoadingIndex(true);
        const index = await fetchSiteUpdatesIndex();
        if (!cancelled) {
          setEntries(siteUpdatesEntriesFromIndex(index));
        }
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const el = entryDropdownRef.current;
    if (!el) return;

    const handler = (evt) => {
      const next = evt?.target?.value ?? evt?.detail?.value ?? "";
      const normalizedNext = next || "latest";

      if (normalizedNext === selectedEntryRef.current) return;
      onEntryChange?.(normalizedNext);
    };

    el.addEventListener("guxchange", handler);
    el.addEventListener("change", handler);

    return () => {
      el.removeEventListener("guxchange", handler);
      el.removeEventListener("change", handler);
    };
  }, [onEntryChange]);

  useEffect(() => {
    const el = entryDropdownRef.current;
    if (!el) return;

    if (el.value !== selectedEntry) {
      el.value = selectedEntry;
    }
    el.setAttribute("value", selectedEntry);
  }, [selectedEntry, open]);

  useEffect(() => {
    if (!open || !effectiveEntry || !entryHasUpdates) {
      setMarkdown("");
      setFetchError("");
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setFetchError("");
        const text = await fetchSiteUpdatesMarkdown(effectiveEntry);
        if (!cancelled) setMarkdown(text);
      } catch (e) {
        if (!cancelled) {
          setMarkdown("");
          setFetchError(String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, effectiveEntry, entryHasUpdates]);

  const handleClose = useCallback(() => {
    setFetchError("");
    onClose?.();
  }, [onClose]);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="gcOrderDialog"
      aria-labelledby="site-updates-title"
      onCancel={handleClose}
      onClose={handleClose}
    >
      <div className="gcOrderDialog__panel">
        <div className="gcOrderDialog__chrome">
          <div className="gcOrderDialog__header">
            <h2 id="site-updates-title" className="gcOrderDialog__title">
              Site updates
            </h2>
            <button
              type="button"
              className="gcOrderDialog__close"
              aria-label="Close site updates"
              onClick={handleClose}
            >
              ×
            </button>
          </div>

          <div className="gcOrderDialog__toolbar gcOrderDialog__toolbar--releaseNotes">
            <p className="gcOrderDialog__intro gcMuted">
              What&apos;s new on CX as Code Explorer — site improvements, not provider releases.
            </p>

            <div className="gcOrderDialog__toolbarActions">
              <div className="gcVersionPicker">
                <span className="gcMetaLabel">Update:</span>
                <gux-dropdown ref={entryDropdownRef} disabled={loadingIndex}>
                  <gux-listbox>
                    <gux-option value="latest">
                      Latest{" "}
                      {newestEntry
                        ? `(${formatSiteUpdatesEntryLabel(entries.find((e) => e.version === newestEntry))})`
                        : ""}
                    </gux-option>

                    {entries.map((entry) => (
                      <gux-option key={entry.version} value={entry.version}>
                        {formatSiteUpdatesEntryLabel(entry)}
                      </gux-option>
                    ))}
                  </gux-listbox>
                </gux-dropdown>
              </div>
            </div>
          </div>
        </div>

        <div className="gcOrderDialog__body gcDependencyNote__body">
          {fetchError ? (
            <div className="gcAlert" role="alert">
              <div className="gcAlert__body gcMono">{fetchError}</div>
            </div>
          ) : null}

          {!fetchError && loading ? (
            <div className="gcMuted">Loading site updates…</div>
          ) : null}

          {!fetchError && !loading && markdown ? (
            <DependencyNote content={markdown} />
          ) : null}

          {!fetchError && !loading && !markdown && effectiveEntry && entryHasUpdates ? (
            <div className="gcMuted">No site updates content for this entry yet.</div>
          ) : null}

          {!fetchError && !loading && !markdown && effectiveEntry && !entryHasUpdates ? (
            <div className="gcMuted">No site updates for {effectiveEntry}.</div>
          ) : null}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
