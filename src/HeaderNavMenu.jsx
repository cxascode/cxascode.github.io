import React, { useCallback, useEffect, useRef } from "react";

/**
 * Compact header menu mock — groups secondary nav items under a pill trigger.
 */
export default function HeaderNavMenu({ label, items, disabled = false }) {
  const detailsRef = useRef(null);

  const closeMenu = useCallback(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!detailsRef.current?.open) return;
      if (detailsRef.current.contains(event.target)) return;
      closeMenu();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMenu]);

  return (
    <details ref={detailsRef} className="gcHeaderNavMenu">
      <summary
        className="gcHeaderLink gcHeaderNavMenu__trigger"
        aria-haspopup="menu"
        aria-disabled={disabled || undefined}
      >
        {label}
      </summary>

      <div className="gcHeaderNavMenu__panel" role="menu" aria-label={label}>
        {items.map((item) => {
          if (item.href) {
            return (
              <a
                key={item.id}
                href={item.href}
                className="gcHeaderNavMenu__item"
                role="menuitem"
                title={item.title}
                onClick={closeMenu}
              >
                {item.label}
              </a>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className="gcHeaderNavMenu__item"
              role="menuitem"
              title={item.title}
              disabled={disabled || item.disabled}
              onClick={(event) => {
                item.onClick?.(event);
                closeMenu();
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}
