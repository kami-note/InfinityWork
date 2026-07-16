"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuState {
  x: number;
  y: number;
}

export interface ContextMenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  href?: string;
}

export function DriveContextMenu({
  position,
  actions,
  onClose,
}: {
  position: ContextMenuState;
  actions: ContextMenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Keep the menu on-screen even when the click happens near the viewport edge.
  const style = {
    top: Math.min(position.y, window.innerHeight - actions.length * 36 - 16),
    left: Math.min(position.x, window.innerWidth - 180),
  };

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="fixed z-50 w-44 rounded border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
    >
      {actions.map((action) =>
        action.href ? (
          <a
            key={action.label}
            href={action.href}
            onClick={onClose}
            className="block px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {action.label}
          </a>
        ) : (
          <button
            key={action.label}
            onClick={() => {
              action.onSelect();
              onClose();
            }}
            className={`block w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
              action.danger ? "text-red-600" : ""
            }`}
          >
            {action.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
