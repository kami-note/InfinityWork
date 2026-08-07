import argon2 from "argon2";

// Cheaper-but-still-safe preset for small VPS per ticket:
// memoryCost: 19456 KiB (~19 MiB), timeCost: 2, parallelism: 1
const DEFAULT_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string) {
  return await argon2.hash(password, DEFAULT_OPTIONS);
}

export async function verifyPassword(hash: string, password: string) {
  return await argon2.verify(hash, password);
}

export const ARGON2_PRESET = { ...DEFAULT_OPTIONS };

