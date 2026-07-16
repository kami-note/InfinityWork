import { requireAccessToken } from "@/lib/session";
import { getStorageUsage } from "@/lib/file-manager-client";
import { formatSize } from "@/lib/format";

// No fake quota/paywall here — self-hosted storage is only bounded by disk,
// so this just reports actual usage instead of pretending there's a plan.
export async function StorageUsage() {
  const token = await requireAccessToken();
  const { totalBytes } = await getStorageUsage(token);

  return (
    <div className="px-4 text-xs text-neutral-500 dark:text-neutral-400">
      {formatSize(totalBytes)} usados
    </div>
  );
}
