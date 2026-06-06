import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DependencyNote from "./DependencyNote.jsx";
import { fetchReleaseNotesMarkdown, toReleaseNotesVersion } from "./releaseNotes.js";

export default function ReleaseNotesDialog({
  open,
  onClose,
  selectedVersion,
  onVersionChange,
  availableVersions,
  newestListedRelease,
  loadingIndex,
}) {
  const dialogRef = useRef(null);
  const versionDropdownRef = useRef(null);
  const selectedVersionRef = useRef(selectedVersion);

  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const effectiveVersion =
    selectedVersion === "latest" ? newestListedRelease : selectedVersion;

  useEffect(() => {
    selectedVersionRef.current = selectedVersion;
  }, [selectedVersion]);

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

  useEffect(() => {
    if (!open || !effectiveVersion) {
      setMarkdown("");
      setFetchError("");
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setFetchError("");
        const text = await fetchReleaseNotesMarkdown(effectiveVersion);
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
  }, [open, effectiveVersion]);

  const handleClose = useCallback(() => {
    setFetchError("");
    onClose?.();
  }, [onClose]);

  const downloadReleaseNotes = useCallback(() => {
    if (!markdown || !effectiveVersion) return;

    const filename = `cx-as-code-release-notes-${toReleaseNotesVersion(effectiveVersion)}.md`;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [markdown, effectiveVersion]);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="gcOrderDialog"
      aria-labelledby="release-notes-title"
      onCancel={handleClose}
      onClose={handleClose}
    >
      <div className="gcOrderDialog__panel">
        <div className="gcOrderDialog__header">
          <h2 id="release-notes-title" className="gcOrderDialog__title">
            Release notes
          </h2>
          <button
            type="button"
            className="gcOrderDialog__close"
            aria-label="Close release notes"
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        <div className="gcOrderDialog__toolbar">
          <button
            type="button"
            className="gcHeaderLink"
            onClick={downloadReleaseNotes}
            disabled={!markdown || loading}
          >
            Download release notes
          </button>
          <div className="gcVersionPicker gcOrderDialog__toolbarVersion">
            <span className="gcMetaLabel">Version:</span>
            <gux-dropdown ref={versionDropdownRef} disabled={loadingIndex}>
              <gux-listbox>
                <gux-option value="latest">
                  Latest {newestListedRelease ? `(${newestListedRelease})` : ""}
                </gux-option>

                {availableVersions.map((v) => (
                  <gux-option key={v} value={v}>
                    {v}
                  </gux-option>
                ))}
              </gux-listbox>
            </gux-dropdown>
          </div>
        </div>

        <div className="gcOrderDialog__body gcDependencyNote__body">
          {fetchError ? (
            <div className="gcAlert" role="alert">
              <div className="gcAlert__body gcMono">{fetchError}</div>
            </div>
          ) : null}

          {!fetchError && loading ? (
            <div className="gcMuted">Loading release notes…</div>
          ) : null}

          {!fetchError && !loading && markdown ? (
            <DependencyNote content={markdown} />
          ) : null}

          {!fetchError && !loading && !markdown && effectiveVersion ? (
            <div className="gcMuted">
              Release notes are available from v1.60.0 onward. This version may not have notes
              yet.
            </div>
          ) : null}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
