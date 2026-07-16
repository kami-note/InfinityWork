"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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
    <div className="flex items-center gap-4 border-b border-neutral-200 p-4 dark:border-neutral-800">
      <form onSubmit={handleSearch} className="flex-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar arquivos..."
          className="w-full max-w-md rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </form>
      <button onClick={handleLogout} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">
        Sair
      </button>
    </div>
  );
}
