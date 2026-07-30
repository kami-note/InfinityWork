import { AUTH_SERVICE_URL } from "./config";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export async function searchUserByEmail(token: string, email: string): Promise<PublicUser | null> {
  const res = await fetch(`${AUTH_SERVICE_URL}/users/search?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`auth search failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<PublicUser>;
}
