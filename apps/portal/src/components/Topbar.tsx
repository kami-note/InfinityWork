"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, LogOut } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(q ? `/drive?q=${encodeURIComponent(q)}` : "/drive");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4 border-b border-neutral-200 p-3 dark:border-neutral-800">
      <form onSubmit={handleSearch} className="max-w-xl flex-1">
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
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <button
          onClick={handleLogout}
          title="Sair"
          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
}
