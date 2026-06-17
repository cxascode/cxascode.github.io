import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DependencyNote from "./DependencyNote.jsx";
import { downloadReleaseNotesArtifact } from "./artifactDownloads.js";
import {
  fetchReleaseNotesIndex,
  fetchReleaseNotesMarkdown,
  RELEASE_NOTES_SCOPE_EXPORT,
  RELEASE_NOTES_SCOPE_PROVIDER,
  releaseNotesDownloadLabel,
  releaseNotesVersionsFromIndex,
  toReleaseNotesVersion,
} from "./releaseNotes.js";

const SCOPE_OPTIONS = [
  { id: RELEASE_NOTES_SCOPE_PROVIDER, label: "Provider" },
  { id: RELEASE_NOTES_SCOPE_EXPORT, label: "Export" },
];

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

  const [scope, setScope] = useState(RELEASE_NOTES_SCOPE_PROVIDER);
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [exportVersions, setExportVersions] = useState([]);
  const [loadingExportIndex, setLoadingExportIndex] = useState(false);

  const isExportScope = scope === RELEASE_NOTES_SCOPE_EXPORT;
  const scopedVersions = isExportScope ? exportVersions : availableVersions;
  const scopedNewestRelease = isExportScope
    ? exportVersions[0] || ""
    : newestListedRelease;

  const effectiveVersion =
    selectedVersion === "latest" ? scopedNewestRelease : selectedVersion;
  const normalizedEffectiveVersion = toReleaseNotesVersion(effectiveVersion);
  const versionHasNotes =
    !normalizedEffectiveVersion ||
    scopedVersions.some(
      (version) => toReleaseNotesVersion(version) === normalizedEffectiveVersion
    );

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
    if (!open) {
      setScope(RELEASE_NOTES_SCOPE_PROVIDER);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingExportIndex(true);
        const index = await fetchReleaseNotesIndex(RELEASE_NOTES_SCOPE_EXPORT);
        if (!cancelled) {
          setExportVersions(releaseNotesVersionsFromIndex(index));
        }
      } catch {
        if (!cancelled) setExportVersions([]);
      } finally {
        if (!cancelled) setLoadingExportIndex(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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
    if (!open || !effectiveVersion || !versionHasNotes) {
      setMarkdown("");
      setFetchError("");
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setFetchError("");
        const text = await fetchReleaseNotesMarkdown(effectiveVersion, scope);
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
  }, [open, effectiveVersion, scope, versionHasNotes]);

  const handleClose = useCallback(() => {
    setFetchError("");
    onClose?.();
  }, [onClose]);

  const downloadReleaseNotes = useCallback(() => {
    if (!markdown || !effectiveVersion) return;

    void downloadReleaseNotesArtifact(
      selectedVersion,
      newestListedRelease,
      markdown,
      scope
    );
  }, [markdown, effectiveVersion, selectedVersion, newestListedRelease, scope]);

  const downloadButtonLabel = releaseNotesDownloadLabel(scope);

  const versionPickerDisabled = loadingIndex || (isExportScope && loadingExportIndex);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="gcOrderDialog"
      aria-labelledby="release-notes-title"
      onCancel={handleClose}
      onClose={handleClose}
    >
      <div className="gcOrderDialog__panel">
        <div className="gcOrderDialog__chrome">
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

          <div className="gcOrderDialog__toolbar gcOrderDialog__toolbar--releaseNotes">
            <div
              className="gcSegmentedControl gcSegmentedControl--text"
              role="radiogroup"
              aria-label="Release notes scope"
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

            <div className="gcOrderDialog__toolbarActions">
              <button
                type="button"
                className="gcHeaderLink"
                onClick={downloadReleaseNotes}
                disabled={!markdown || loading}
              >
                {downloadButtonLabel}
              </button>
              <div className="gcVersionPicker">
                <span className="gcMetaLabel">Version:</span>
                <gux-dropdown ref={versionDropdownRef} disabled={versionPickerDisabled}>
                  <gux-listbox>
                    <gux-option value="latest">
                      Latest{" "}
                      {scopedNewestRelease
                        ? `(${toReleaseNotesVersion(scopedNewestRelease)})`
                        : ""}
                    </gux-option>

                    {scopedVersions.map((v) => (
                      <gux-option key={v} value={v}>
                        {toReleaseNotesVersion(v)}
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
            <div className="gcMuted">Loading release notes…</div>
          ) : null}

          {!fetchError && !loading && markdown ? (
            <DependencyNote content={markdown} />
          ) : null}

          {!fetchError && !loading && !markdown && effectiveVersion && versionHasNotes ? (
            <div className="gcMuted">
              Release notes are available from v1.60.0 onward. This version may not have notes
              yet.
            </div>
          ) : null}

          {!fetchError && !loading && !markdown && effectiveVersion && !versionHasNotes ? (
            <div className="gcMuted">
              {isExportScope
                ? `No export-specific release notes for ${toReleaseNotesVersion(effectiveVersion)}.`
                : `No provider release notes for ${toReleaseNotesVersion(effectiveVersion)}.`}
            </div>
          ) : null}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
