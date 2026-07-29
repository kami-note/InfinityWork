"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, LogOut, Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useSidebarDrawer } from "./DriveShell";

export function Topbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const drawer = useSidebarDrawer();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setMobileSearchOpen(false);
    router.push(q ? `/drive?q=${encodeURIComponent(q)}` : "/drive");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative flex items-center gap-4 border-b border-neutral-200 p-3 dark:border-neutral-800">
      {drawer && (
        <button
          onClick={drawer.toggle}
          title="Menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 md:hidden"
        >
          <Menu size={18} />
        </button>
      )}

      <form onSubmit={handleSearch} className="hidden max-w-xl flex-1 sm:block">
        <div className="flex items-center gap-3 rounded-full bg-neutral-100 px-4 py-2 focus-within:bg-white focus-within:shadow dark:bg-neutral-900 dark:focus-within:bg-neutral-800">
          <Search size={18} className="shrink-0 text-neutral-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar no Drive"
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-500"
          />
        </div>
      </form>

      <button
        onClick={() => setMobileSearchOpen(true)}
        title="Pesquisar"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 sm:hidden"
      >
        <Search size={18} />
      </button>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <button
          onClick={handleLogout}
          title="Sair"
          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <LogOut size={18} />
        </button>
      </div>

      {mobileSearchOpen && (
        <form
          onSubmit={handleSearch}
          className="absolute inset-0 z-10 flex items-center gap-2 bg-white px-3 dark:bg-neutral-950 sm:hidden"
        >
          <button type="button" onClick={() => setMobileSearchOpen(false)} className="shrink-0 rounded p-1 text-neutral-500">
            <X size={18} />
          </button>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar no Drive"
            className="w-full flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
          />
        </form>
      )}
    </div>
  );
}
