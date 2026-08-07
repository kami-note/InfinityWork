import argon2 from "argon2";
import { hashPassword } from "./password-hasher.js";
import { DEFAULT_ROLES } from "@infinitywork/shared";
import { prisma } from "./prisma.js";

/**
 * Idempotent seed: creates the built-in roles from DEFAULT_ROLES, the
 * permission rows they reference, and one bootstrap admin user so the
 * system is usable on first boot. Safe to run on every deploy.
 */
async function main() {
  for (const [roleName, permissionKeys] of Object.entries(DEFAULT_ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    for (const key of permissionKeys) {
      const permission = await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key },
      });

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@infinitywork.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const passwordHash = await hashPassword(adminPassword);
    const admin = await prisma.user.create({
      data: { email: adminEmail, name: "Admin", passwordHash },
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" } });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
    console.log(`Seeded admin user: ${adminEmail} (change the password after first login)`);
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
