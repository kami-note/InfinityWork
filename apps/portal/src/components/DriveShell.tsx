"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface SidebarDrawerContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarDrawerContext = createContext<SidebarDrawerContextValue | null>(null);

/** Returns null outside a DriveShell (e.g. the view/docs pages, which have no sidebar to toggle). */
export function useSidebarDrawer(): SidebarDrawerContextValue | null {
  return useContext(SidebarDrawerContext);
}

export function DriveShell({
  sidebar,
  topbar,
  children,
}: {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <SidebarDrawerContext.Provider value={{ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) }}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <div className="hidden md:flex md:w-60 md:shrink-0">{sidebar}</div>

        {open && (
          <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)} />
        )}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 bg-white transition-transform duration-200 dark:bg-neutral-950 md:hidden ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebar}
        </div>

        <main className="min-w-0 flex-1">
          {topbar}
          {children}
        </main>
      </div>
    </SidebarDrawerContext.Provider>
  );
}
