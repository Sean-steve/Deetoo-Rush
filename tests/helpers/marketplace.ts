import assert from "node:assert/strict";
import { merchantRepository } from "../../apps/api/src/modules/merchant/merchant.repository";
import { closeRedisClient } from "../../apps/api/src/db/redis";
import { closeDbPool } from "../../apps/api/src/db/client";
export async function login(base: string, role: string) {
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: `${role}@deetoo.ke`,
      password: `${role[0].toUpperCase()}${role.slice(1)}Pass123!`,
    }),
  });
  assert.equal(response.status, 200, `${role} login`);
  return ((await response.json()) as any).data.accessToken as string;
}
export async function openTestKitchen() {
  for (const id of ["branch_westlands_01", "branch_kilimani_02"]) {
    const hours = await merchantRepository.getOpeningHours(id);
    await merchantRepository.setOpeningHours(
      id,
      hours.map((h) => ({
        ...h,
        open_time: "00:00",
        close_time: "23:59:59",
        is_closed: false,
      })),
    );
  }
}
export async function closeTestResources() {
  closeRedisClient();
  await closeDbPool();
}
