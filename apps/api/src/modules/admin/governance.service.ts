import { randomUUID } from 'node:crypto';
import {
  MerchantApprovalStatus,
  MerchantStatus,
  RiderOnboardingStatus,
  RiderOperationalStatus,
  RiderWorkStatus,
  UserRole,
  UserStatus,
  VehicleStatus,
  VehicleType,
} from '@deetoo/types';
import { generateSecureToken, hashPassword } from '@deetoo/auth';
import { getDbPool } from '../../db/client';
import { AppError } from '../../middleware/error-handler';
import { authRepository } from '../auth/auth.repository';
import { authService } from '../auth/auth.service';
import { merchantRepository } from '../merchant/merchant.repository';
import { merchantOnboardingService } from '../merchant/merchant-onboarding.service';
import { riderRepository } from '../rider/rider.repository';

type SubjectType = 'CUSTOMER' | 'MERCHANT' | 'RIDER' | 'STAFF';

export interface GovernanceActor {
  id: string;
  role: string;
  requestId?: string;
}

class GovernanceService {
  private async event(input: {
    subjectUserId: string;
    subjectType: SubjectType;
    action:
      | 'PROVISIONED'
      | 'PROFILE_EDITED'
      | 'SUSPENDED'
      | 'REACTIVATED'
      | 'DEACTIVATED'
      | 'ANONYMIZED'
      | 'ROLE_CHANGED';
    reason: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    actor: GovernanceActor;
  }): Promise<void> {
    await getDbPool().query(
      `INSERT INTO account_governance_events(
         id,subject_user_id,subject_type,action,reason,before_values,after_values,
         actor_user_id,actor_role,request_id,created_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [
        randomUUID(),
        input.subjectUserId,
        input.subjectType,
        input.action,
        input.reason,
        JSON.stringify(input.before || {}),
        JSON.stringify(input.after || {}),
        input.actor.id,
        input.actor.role,
        input.actor.requestId || null,
      ],
    );
  }

  private requireReason(reason?: string): string {
    const value = String(reason || '').trim();
    if (value.length < 3) {
      throw new AppError(400, 'REASON_REQUIRED', 'A meaningful governance reason is required');
    }
    return value.slice(0, 1000);
  }

  async provision(
    input: {
      subject_type: SubjectType;
      name: string;
      email?: string;
      phone_e164?: string;
      staff_role?: UserRole;
      vehicle_type?: VehicleType;
      merchant_legal_name?: string;
      merchant_display_name?: string;
      reason: string;
    },
    actor: GovernanceActor,
  ): Promise<any> {
    const reason = this.requireReason(input.reason);
    const name = String(input.name || '').trim();
    if (!name) throw new AppError(400, 'NAME_REQUIRED', 'Name is required');
    const email = input.email?.trim().toLowerCase() || null;
    const phone = input.phone_e164?.trim() || null;
    if (!email && !phone) {
      throw new AppError(400, 'IDENTITY_REQUIRED', 'Email or phone is required');
    }
    if (email && await authRepository.findUserByEmail(email)) {
      throw new AppError(409, 'IDENTITY_CONFLICT', 'An account with this email already exists');
    }
    if (phone && await authRepository.findUserByPhone(phone)) {
      throw new AppError(409, 'IDENTITY_CONFLICT', 'An account with this phone already exists');
    }

    const userId = randomUUID();
    const unusablePassword = await hashPassword(generateSecureToken(48));
    const user = await authRepository.createUser({
      id: userId,
      email,
      phone_e164: phone,
      password_hash: unusablePassword,
      status: UserStatus.PENDING,
    });

    let resource: any = null;
    let roles: UserRole[] = [];

    if (input.subject_type === 'CUSTOMER') {
      roles = [UserRole.CUSTOMER];
      await authRepository.setUserRoles(userId, roles);
      await authRepository.createCustomerProfile({
        id: userId,
        user_id: userId,
        name,
      });
      resource = { customer_user_id: userId };
    } else if (input.subject_type === 'RIDER') {
      roles = [UserRole.RIDER];
      await authRepository.setUserRoles(userId, roles);
      const parts = name.split(/\s+/);
      const profile = await riderRepository.createProfile({
        userId,
        firstName: parts.shift() || name,
        lastName: parts.join(' ') || '',
        phone: phone || '',
        vehicleType: input.vehicle_type || VehicleType.MOTORBIKE,
        onboardingStatus: RiderOnboardingStatus.DRAFT,
        operationalStatus: RiderOperationalStatus.ACTIVE,
        workStatus: RiderWorkStatus.OFFLINE,
        serviceZoneIds: [],
      });
      await riderRepository.upsertVehicle(profile.id, {
        type: input.vehicle_type || VehicleType.MOTORBIKE,
        status: VehicleStatus.ACTIVE,
      });
      resource = profile;
    } else if (input.subject_type === 'MERCHANT') {
      roles = [UserRole.MERCHANT_OWNER, UserRole.MERCHANT];
      await authRepository.setUserRoles(userId, roles);
      const merchantId = randomUUID();
      const displayName = String(input.merchant_display_name || name).trim();
      const legalName = String(input.merchant_legal_name || displayName).trim();
      const now = new Date().toISOString();
      const merchant = await merchantRepository.createMerchant({
        id: merchantId,
        legal_name: legalName,
        display_name: displayName,
        slug: `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${merchantId.slice(0, 6)}`,
        phone: phone || undefined,
        email: email || undefined,
        status: MerchantStatus.DISABLED,
        approval_status: MerchantApprovalStatus.DRAFT,
        commission_bps: 2000,
        settlement_schedule: 'WEEKLY',
        created_at: now,
        updated_at: now,
      } as any);
      await merchantRepository.createMembership({
        id: randomUUID(),
        merchant_id: merchantId,
        user_id: userId,
        role_code: 'merchant_owner' as any,
        status: 'ACTIVE' as any,
        branch_ids: [],
        created_at: now,
      });
      await merchantOnboardingService.update(
        merchantId,
        'APPLICATION',
        actor.id,
        'Provisioned by Super Admin; onboarding and final approval remain required',
      );
      resource = merchant;
    } else {
      const staffRole = input.staff_role;
      const allowed = [
        UserRole.SUPPORT,
        UserRole.OPS,
        UserRole.FINANCE,
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
      ];
      if (!staffRole || !allowed.includes(staffRole)) {
        throw new AppError(400, 'STAFF_ROLE_INVALID', 'A valid staff role is required');
      }
      roles = [staffRole];
      await authRepository.setUserRoles(userId, roles);
      resource = { staff_role: staffRole };
    }

    await this.event({
      subjectUserId: userId,
      subjectType: input.subject_type,
      action: 'PROVISIONED',
      reason,
      after: { email, phone_e164: phone, roles, resource_id: resource?.id },
      actor,
    });

    return {
      user: await authService.toAuthUser(user),
      resource,
      requires_activation: true,
      note: 'Provisioned accounts remain PENDING until an authorized activation/reset flow is completed.',
    };
  }

  async updateIdentity(
    userId: string,
    input: { email?: string | null; phone_e164?: string | null; display_name?: string; reason: string },
    actor: GovernanceActor,
  ): Promise<any> {
    const reason = this.requireReason(input.reason);
    const user = await authRepository.findUserById(userId);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    const before = { email: user.email, phone_e164: user.phone_e164 };
    const email = input.email === undefined ? user.email : input.email?.trim().toLowerCase() || null;
    const phone = input.phone_e164 === undefined ? user.phone_e164 : input.phone_e164?.trim() || null;

    if (email && email !== user.email) {
      const existing = await authRepository.findUserByEmail(email);
      if (existing && existing.id !== userId) throw new AppError(409, 'IDENTITY_CONFLICT', 'Email is already in use');
    }
    if (phone && phone !== user.phone_e164) {
      const existing = await authRepository.findUserByPhone(phone);
      if (existing && existing.id !== userId) throw new AppError(409, 'IDENTITY_CONFLICT', 'Phone is already in use');
    }

    await getDbPool().query(
      'UPDATE users SET email=$1,phone_e164=$2,updated_at=NOW() WHERE id=$3',
      [email, phone, userId],
    );
    if (input.display_name !== undefined) {
      await getDbPool().query(
        'UPDATE customer_profiles SET display_name=$1 WHERE user_id=$2',
        [input.display_name.trim(), userId],
      );
    }
    await authRepository.revokeAllUserSessions(userId);
    await this.event({
      subjectUserId: userId,
      subjectType: await this.subjectType(userId),
      action: 'PROFILE_EDITED',
      reason,
      before,
      after: { email, phone_e164: phone, display_name: input.display_name },
      actor,
    });
    const updated = await authRepository.findUserById(userId);
    return updated ? authService.toAuthUser(updated) : null;
  }

  async deactivate(
    userId: string,
    reasonInput: string,
    actor: GovernanceActor,
  ): Promise<any> {
    const reason = this.requireReason(reasonInput);
    if (userId === actor.id) {
      throw new AppError(409, 'SELF_DEACTIVATION_FORBIDDEN', 'Super Admin cannot deactivate their own account');
    }
    const user = await authRepository.findUserById(userId);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    const subjectType = await this.subjectType(userId);

    await authRepository.updateUserStatus(userId, UserStatus.DISABLED);
    await authRepository.revokeAllUserSessions(userId);
    await getDbPool().query(
      `UPDATE customer_profiles SET status='DISABLED' WHERE user_id=$1`,
      [userId],
    );
    await getDbPool().query(
      `UPDATE rider_profiles
       SET operational_status='DISABLED',work_status='OFFLINE',updated_at=NOW()
       WHERE user_id=$1`,
      [userId],
    );

    await this.event({
      subjectUserId: userId,
      subjectType,
      action: 'DEACTIVATED',
      reason,
      before: { status: user.status },
      after: { status: UserStatus.DISABLED },
      actor,
    });
    return { user_id: userId, status: UserStatus.DISABLED, subject_type: subjectType };
  }

  async reactivate(
    userId: string,
    reasonInput: string,
    actor: GovernanceActor,
  ): Promise<any> {
    const reason = this.requireReason(reasonInput);
    const user = await authRepository.findUserById(userId);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    await authRepository.updateUserStatus(userId, UserStatus.ACTIVE);
    await this.event({
      subjectUserId: userId,
      subjectType: await this.subjectType(userId),
      action: 'REACTIVATED',
      reason,
      before: { status: user.status },
      after: { status: UserStatus.ACTIVE },
      actor,
    });
    return { user_id: userId, status: UserStatus.ACTIVE };
  }

  async setRoles(
    userId: string,
    roles: UserRole[],
    reasonInput: string,
    actor: GovernanceActor,
  ): Promise<any> {
    const reason = this.requireReason(reasonInput);
    if (!roles.length || roles.some((role) => !Object.values(UserRole).includes(role))) {
      throw new AppError(400, 'ROLES_INVALID', 'At least one valid role is required');
    }
    const user = await authRepository.findUserById(userId);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    const before = await authRepository.getUserRoles(userId);
    await authRepository.setUserRoles(userId, roles);
    await authRepository.revokeAllUserSessions(userId);
    await this.event({
      subjectUserId: userId,
      subjectType: await this.subjectType(userId),
      action: 'ROLE_CHANGED',
      reason,
      before: { roles: before },
      after: { roles },
      actor,
    });
    return authService.toAuthUser(user);
  }

  async updateRiderProfile(
    riderId: string,
    input: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      vehicle_type?: VehicleType;
      vehicle_registration?: string;
      reason: string;
    },
    actor: GovernanceActor,
  ): Promise<any> {
    const reason = this.requireReason(input.reason);
    const existing = await riderRepository.findProfileById(riderId);
    if (!existing) throw new AppError(404, 'RIDER_NOT_FOUND', 'Rider profile not found');

    const before = {
      first_name: existing.firstName,
      last_name: existing.lastName,
      phone: existing.phone,
      vehicle_type: existing.vehicleType,
      vehicle_registration: existing.vehicleRegistration,
    };

    const updates: any = {};
    if (input.first_name !== undefined) updates.firstName = input.first_name.trim();
    if (input.last_name !== undefined) updates.lastName = input.last_name.trim();
    if (input.phone !== undefined) updates.phone = input.phone.trim();
    if (input.vehicle_type !== undefined) updates.vehicleType = input.vehicle_type;
    if (input.vehicle_registration !== undefined) {
      updates.vehicleRegistration = input.vehicle_registration.trim();
    }
    const updated = await riderRepository.updateProfile(riderId, updates);
    if (input.vehicle_type !== undefined || input.vehicle_registration !== undefined) {
      await riderRepository.upsertVehicle(riderId, {
        type: input.vehicle_type || existing.vehicleType || VehicleType.MOTORBIKE,
        registrationNumber:
          input.vehicle_registration !== undefined
            ? input.vehicle_registration
            : existing.vehicleRegistration,
      });
    }

    await this.event({
      subjectUserId: existing.userId,
      subjectType: 'RIDER',
      action: 'PROFILE_EDITED',
      reason,
      before,
      after: {
        first_name: updated.firstName,
        last_name: updated.lastName,
        phone: updated.phone,
        vehicle_type: updated.vehicleType,
        vehicle_registration: updated.vehicleRegistration,
      },
      actor,
    });
    return updated;
  }

  async listEvents(limit = 100): Promise<any[]> {
    const result = await getDbPool().query(
      `SELECT * FROM account_governance_events ORDER BY created_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)],
    );
    return result.rows;
  }

  private async subjectType(userId: string): Promise<SubjectType> {
    const rider = await getDbPool().query('SELECT 1 FROM rider_profiles WHERE user_id=$1',[userId]);
    if (rider.rowCount) return 'RIDER';
    const customer = await getDbPool().query('SELECT 1 FROM customer_profiles WHERE user_id=$1',[userId]);
    if (customer.rowCount) return 'CUSTOMER';
    const merchant = await getDbPool().query('SELECT 1 FROM merchant_memberships WHERE user_id=$1',[userId]);
    if (merchant.rowCount) return 'MERCHANT';
    return 'STAFF';
  }
}

export const governanceService = new GovernanceService();
