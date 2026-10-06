import { requirePaidOrder } from '../payment/paid-order-guard';
import { AuthUser } from "@deetoo/types";
import { AppError } from "../../middleware/error-handler";
import { merchantRepository } from "../merchant/merchant.repository";
import { orderService } from "../order/order.service";

export const merchantRoles = [
  "merchant",
  "merchant_owner",
  "merchant_manager",
  "merchant_staff",
];
export function hasAnyRole(user: AuthUser, roles: string[]) {
  return user.roles.some((role) => roles.includes(role));
}
export function deny(): never {
  throw new AppError(403, "FORBIDDEN_SCOPE", "Access denied to this resource");
}
export async function merchantScope(
  user: AuthUser,
  merchantId: string,
  ownerOnly = false,
  managerAllowed = false,
  operationalRead = true,
) {
  if (hasAnyRole(user, operationalRead ? ["super_admin", "admin", "ops"] : ["super_admin", "admin"])) return;
  if (!hasAnyRole(user, merchantRoles)) deny();
  const memberships = await merchantRepository.getMembershipsForUser(user.id);
  if (
    !memberships.some(
      (m) =>
        m.status === "ACTIVE" &&
        m.merchant_id === merchantId &&
        (!ownerOnly ||
          m.role_code === "merchant_owner" ||
          (managerAllowed && m.role_code === "merchant_manager")),
    )
  )
    deny();
}
export async function branchScope(user: AuthUser, branchId: string) {
  if (hasAnyRole(user, ["admin", "ops"])) return;
  if (!hasAnyRole(user, merchantRoles)) deny();
  const branch = await merchantRepository.findBranchById(branchId);
  if (!branch) deny();
  const memberships = await merchantRepository.getMembershipsForUser(user.id);
  if (
    !memberships.some(
      (m) =>
        m.status === "ACTIVE" &&
        m.merchant_id === branch!.merchant_id &&
        (m.role_code === "merchant_owner" || m.branch_ids.includes(branchId)),
    )
  )
    deny();
}
export async function orderScope(
  user: AuthUser,
  orderId: string,
  payments = false,
) {
  const order = await orderService.getOrderById(orderId);
  if (
    hasAnyRole(
      user,
      payments
        ? ["super_admin", "admin", "ops", "support", "finance"]
        : ["super_admin", "admin", "ops", "support"],
    )
  )
    return order;
  if (hasAnyRole(user, ["customer"]) && order.customer_id === user.id)
    return order;
  if (payments) deny();
  await branchScope(user, order.branch_id);
  await requirePaidOrder(order.id);
  return order;
}
