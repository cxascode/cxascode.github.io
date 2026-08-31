import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DependencyNote from "./DependencyNote.jsx";
import {
  fetchDebuggingInstructionsMarkdown,
  parseDebuggingMarkdown,
} from "./debugInstructions.js";

export default function DebuggingDialog({ open, onClose }) {
  const dialogRef = useRef(null);
  const [description, setDescription] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

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
        setFetchError("");
        const raw = await fetchDebuggingInstructionsMarkdown();
        if (cancelled) return;

        const parsed = parseDebuggingMarkdown(raw);
        setDescription(parsed.description);
        setMarkdown(parsed.body);
      } catch (error) {
        if (!cancelled) {
          setDescription("");
          setMarkdown("");
          setFetchError(String(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleClose = useCallback(() => {
    setFetchError("");
    onClose?.();
  }, [onClose]);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="gcOrderDialog"
      aria-labelledby="debugging-title"
      onCancel={handleClose}
      onClose={handleClose}
    >
      <div className="gcOrderDialog__panel">
        <div className="gcOrderDialog__chrome">
          <div className="gcOrderDialog__header">
            <div className="gcOrderDialog__headerMain">
              <h2 id="debugging-title" className="gcOrderDialog__title">
                Debugging
              </h2>
              {description ? (
                <p className="gcOrderDialog__subtitle">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="gcOrderDialog__close"
              aria-label="Close debugging instructions"
              onClick={handleClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className="gcOrderDialog__body gcDependencyNote__body">
          {fetchError ? (
            <div className="gcAlert" role="alert">
              <div className="gcAlert__body gcMono">{fetchError}</div>
            </div>
          ) : null}

          {!fetchError && loading ? <div className="gcMuted">Loading debugging instructions…</div> : null}

          {!fetchError && !loading && markdown ? <DependencyNote content={markdown} /> : null}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
