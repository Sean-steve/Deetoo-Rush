import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {
  AuditAction,
  UserRole,
  UserStatus,
  VehicleType,
} from '@deetoo/types';
import { AppError } from '../../middleware/error-handler';
import { authRepository } from '../auth/auth.repository';
import { customerRepository } from '../customer/customer.repository';
import { riderRepository } from '../rider/rider.repository';

function normalizeRoles(value: unknown): UserRole[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError(400, 'ROLES_REQUIRED', 'At least one role is required');
  }
  const allowed = new Set(Object.values(UserRole));
  const roles = value.map((item) => String(item) as UserRole);
  if (roles.some((role) => !allowed.has(role))) {
    throw new AppError(400, 'ROLE_INVALID', 'One or more roles are invalid');
  }
  return Array.from(new Set(roles));
}

export class AdminGovernanceService {
  public async provisionIdentity(
    input: {
      email?: string;
      phone_e164?: string;
      roles: UserRole[];
      name?: string;
      first_name?: string;
      last_name?: string;
      vehicle_type?: VehicleType;
      vehicle_registration?: string;
      reason: string;
    },
    actorUserId: string,
    requestId?: string,
  ) {
    const roles = normalizeRoles(input.roles);
    if (!input.email && !input.phone_e164) {
      throw new AppError(
        400,
        'IDENTIFIER_REQUIRED',
        'Provisioned accounts require an email or phone number',
      );
    }

    if (input.email && (await authRepository.findUserByEmail(input.email))) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email is already registered');
    }
    if (
      input.phone_e164 &&
      (await authRepository.findUserByPhone(input.phone_e164))
    ) {
      throw new AppError(409, 'PHONE_ALREADY_EXISTS', 'Phone number is already registered');
    }

    const id = crypto.randomUUID();
    // A provisioned identity starts locked behind the normal password-reset /
    // invitation workflow. The random secret is never returned or logged.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12);
    const user = await authRepository.createUser({
      id,
      email: input.email || null,
      phone_e164: input.phone_e164 || null,
      password_hash: passwordHash,
      status: UserStatus.PENDING,
    });
    await authRepository.setUserRoles(id, roles);

    const name = (input.name || [input.first_name, input.last_name].filter(Boolean).join(' ') || 'User').trim();

    if (roles.includes(UserRole.CUSTOMER)) {
      await customerRepository.upsertProfile({
        user_id: id,
        first_name: input.first_name || name.split(' ')[0] || 'Customer',
        last_name: input.last_name || name.split(' ').slice(1).join(' '),
        display_name: name,
        phone: input.phone_e164,
        email: input.email,
      });
    }

    if (roles.includes(UserRole.RIDER)) {
      await riderRepository.createProfile({
        userId: id,
        firstName: input.first_name || name.split(' ')[0] || 'Rider',
        lastName: input.last_name || name.split(' ').slice(1).join(' '),
        phone: input.phone_e164 || '',
        vehicleType: input.vehicle_type || VehicleType.MOTORBIKE,
        vehicleRegistration: input.vehicle_registration,
        serviceZoneIds: [],
      });
    }

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.SUPER_ADMIN,
      action: AuditAction.USER_PROVISIONED,
      resource_type: 'USER',
      resource_id: id,
      request_id: requestId,
      reason: input.reason,
      metadata: {
        email: user.email,
        phone_e164: user.phone_e164,
        roles,
        status: UserStatus.PENDING,
      },
    });

    return authRepository.findUserById(id);
  }

  public async updateIdentity(
    userId: string,
    input: { email?: string | null; phone_e164?: string | null; reason: string },
    actorUserId: string,
    requestId?: string,
  ) {
    const before = await authRepository.findUserById(userId);
    if (!before) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    if (
      input.email &&
      input.email !== before.email &&
      (await authRepository.findUserByEmail(input.email))
    ) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email is already registered');
    }
    if (
      input.phone_e164 &&
      input.phone_e164 !== before.phone_e164 &&
      (await authRepository.findUserByPhone(input.phone_e164))
    ) {
      throw new AppError(409, 'PHONE_ALREADY_EXISTS', 'Phone number is already registered');
    }

    const updated = await authRepository.updateUserIdentity(userId, {
      email: input.email,
      phone_e164: input.phone_e164,
    });

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.SUPER_ADMIN,
      action: AuditAction.IDENTITY_UPDATED,
      resource_type: 'USER',
      resource_id: userId,
      request_id: requestId,
      reason: input.reason,
      metadata: {
        before: { email: before.email, phone_e164: before.phone_e164 },
        after: {
          email: updated?.email || null,
          phone_e164: updated?.phone_e164 || null,
        },
      },
    });

    return updated;
  }

  public async deactivateIdentity(
    userId: string,
    input: { reason: string; anonymize?: boolean },
    actorUserId: string,
    requestId?: string,
  ) {
    if (userId === actorUserId) {
      throw new AppError(
        409,
        'SELF_DEACTIVATION_FORBIDDEN',
        'A Super Admin cannot deactivate their own active session identity',
      );
    }
    const before = await authRepository.findUserById(userId);
    if (!before) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const roles = await authRepository.getUserRoles(userId);
    if (roles.includes(UserRole.SUPER_ADMIN)) {
      throw new AppError(
        409,
        'SUPER_ADMIN_DEACTIVATION_REQUIRES_PEER_REVIEW',
        'Super Admin identities cannot be deactivated through the standard lifecycle endpoint',
      );
    }

    const updated = await authRepository.deactivateUser(
      userId,
      input.reason,
      Boolean(input.anonymize),
    );

    await authRepository.createAuditLog({
      actor_user_id: actorUserId,
      actor_role: UserRole.SUPER_ADMIN,
      action: input.anonymize
        ? AuditAction.ACCOUNT_ANONYMIZED
        : AuditAction.ACCOUNT_DEACTIVATED,
      resource_type: 'USER',
      resource_id: userId,
      request_id: requestId,
      reason: input.reason,
      metadata: {
        previous_status: before.status,
        anonymized: Boolean(input.anonymize),
      },
    });

    return updated;
  }
}

export const adminGovernanceService = new AdminGovernanceService();
