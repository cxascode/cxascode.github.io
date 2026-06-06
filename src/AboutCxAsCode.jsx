import React, { useEffect, useRef, useState } from "react";

export const ABOUT_CX_AS_CODE_TEXT = (
  <>
    <strong>CX as Code</strong> is Genesys Cloud&apos;s approach to managing contact center
    configuration — queues, flows, users, and more — as version-controlled Terraform.{" "}
    <strong>CX as Code Explorer</strong> maps <code>genesyscloud</code> provider resource types,
    dependencies, division-aware resources, Registry documentation, and{" "}
    <code>genesyscloud_tf_export</code> templates. It also includes provider release notes,
    attribute change history, and a suggested resource creation order by dependency tier.
  </>
);

export default function AboutCxAsCode() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onDocumentMouseDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const onDocumentKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [open]);

  return (
    <div className="gcPageAbout" ref={wrapRef}>
      <button
        type="button"
        className="gcPageAbout__trigger"
        aria-expanded={open}
        aria-controls="gc-about-popover"
        onClick={() => setOpen((value) => !value)}
      >
        About CX as Code
      </button>
      <div
        id="gc-about-popover"
        className={`gcPageAboutPopover ${open ? "isOpen" : ""}`}
        role="dialog"
        aria-label="About CX as Code"
        aria-hidden={!open}
      >
        <p className="gcPageAbout__text">{ABOUT_CX_AS_CODE_TEXT}</p>
      </div>
    </div>
  );
}
