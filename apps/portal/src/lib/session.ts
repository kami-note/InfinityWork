import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_TOKEN_COOKIE } from "./config";

/**
 * The portal never verifies the JWT signature itself — it only checks the
 * cookie is present and lets each backend module (which owns the shared
 * secret) reject invalid/expired tokens. This keeps the portal a thin UI
 * shell, consistent with the "single access door, modular backends" design.
 */
export async function requireAccessToken(): Promise<string> {
  const store = await cookies();
  const token = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) redirect("/login");
  return token;
}

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}
