"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  createShareLinkAction,
  listPermissionsAction,
  listShareLinksAction,
  revokeShareLinkAction,
  shareByEmailAction,
  unshareAction,
  type ShareTargetKind,
} from "@/lib/actions";
import type { PermissionGrant, ShareLinkMeta, ShareRole } from "@/lib/file-manager-client";

export function ShareDialog({
  kind,
  id,
  name,
  onClose,
}: {
  kind: ShareTargetKind;
  id: string;
  name: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [links, setLinks] = useState<ShareLinkMeta[]>([]);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      try {
        const [perms, activeLinks] = await Promise.all([
          listPermissionsAction(kind, id),
          listShareLinksAction(kind, id),
        ]);
        setGrants(perms);
        setLinks(activeLinks);
      } catch {
        setError("Não foi possível carregar o compartilhamento.");
      }
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await shareByEmailAction(kind, id, email.trim(), role);
        setEmail("");
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao compartilhar.");
      }
    });
  }

  function handleUnshare(userId: string) {
    startTransition(async () => {
      try {
        await unshareAction(kind, id, userId);
        refresh();
      } catch {
        setError("Falha ao remover acesso.");
      }
    });
  }

  function handleCreateLink() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const created = await createShareLinkAction(kind, id);
        const url = `${window.location.origin}/s/${created.token}`;
        setPublicUrl(url);
        refresh();
      } catch {
        setError("Falha ao criar link público.");
      }
    });
  }

  function handleRevokeLink(linkId: string) {
    startTransition(async () => {
      try {
        await revokeShareLinkAction(kind, id, linkId);
        setPublicUrl(null);
        refresh();
      } catch {
        setError("Falha ao desativar link.");
      }
    });
  }

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Compartilhar</h2>
            <p className="mt-0.5 truncate text-sm text-neutral-500">{name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
            Fechar
          </button>
        </div>

        <form onSubmit={handleShare} className="mt-5 space-y-3">
          <label className="block text-sm">
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
              placeholder="usuario@exemplo.com"
            />
          </label>
          <label className="block text-sm">
            Papel
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ShareRole)}
              className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
            >
              <option value="viewer">Visualizador</option>
              <option value="editor">Editor</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            Adicionar
          </button>
        </form>

        <div className="mt-5">
          <h3 className="text-sm font-medium">Pessoas com acesso</h3>
          <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm">
            {grants.length === 0 && <li className="text-neutral-500">Ninguém além de você.</li>}
            {grants.map((g) => (
              <li key={g.userId} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs">{g.userId}</span>
                <span className="shrink-0 text-neutral-500">{g.role}</span>
                <button
                  type="button"
                  onClick={() => handleUnshare(g.userId)}
                  className="shrink-0 text-red-600 hover:underline"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h3 className="text-sm font-medium">Link público (somente leitura)</h3>
          <p className="mt-1 text-xs text-neutral-500">Qualquer pessoa com o link pode ver e baixar.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleCreateLink}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
            >
              {links.length > 0 ? "Gerar novo link" : "Criar link"}
            </button>
            {links.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => handleRevokeLink(link.id)}
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 dark:border-red-900"
              >
                Desativar
              </button>
            ))}
          </div>
          {publicUrl && (
            <div className="mt-3 flex gap-2">
              <input readOnly value={publicUrl} className="min-w-0 flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-xs dark:border-neutral-700" />
              <button type="button" onClick={() => void copyLink()} className="shrink-0 text-sm underline">
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
