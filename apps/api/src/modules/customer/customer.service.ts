import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Customer Domain Service
 * Handles customer profile management, address CRUD with strict isolation, and audit trails
 */

import { CustomerProfile, CustomerAddress, AuditAction, UserRole } from '@deetoo/types';
import { customerRepository } from './customer.repository';
import { authRepository } from '../auth/auth.repository';
import { mapsProvider } from '../maps/maps.provider';
import { AppError } from '../../middleware/error-handler';

export class CustomerService {
  /**
   * Retrieves or initializes customer profile
   */
  public async getProfile(userId: string): Promise<CustomerProfile> {
    let profile = await customerRepository.getProfileByUserId(userId);
    if (!profile) {
      profile = await customerRepository.upsertProfile({
        user_id: userId,
        display_name: 'Customer',
      });
    }
    return profile;
  }

  /**
   * Updates customer profile fields with audit trail
   */
  public async updateProfile(
    userId: string,
    data: {
      first_name?: string;
      last_name?: string;
      display_name?: string;
      phone?: string;
      email?: string;
    },
    actor: { userId: string; role: string; ip?: string }
  ): Promise<CustomerProfile> {
    const previous = await this.getProfile(userId);

    const updated = await customerRepository.upsertProfile({
      user_id: userId,
      first_name: data.first_name,
      last_name: data.last_name,
      display_name: data.display_name,
      phone: data.phone,
      email: data.email,
    });

    await authRepository.createAuditLog({
      actor_user_id: actor.userId,
      actor_role: (actor.role as UserRole) || UserRole.CUSTOMER,
      action: AuditAction.CUSTOMER_PROFILE_UPDATED,
      resource_type: 'CUSTOMER_PROFILE',
      resource_id: userId,
      metadata: {
        before: previous,
        after: updated,
        ip_address: actor.ip,
      },
    });

    return updated;
  }

  /**
   * Returns all active saved addresses for a customer
   */
  public async listAddresses(customerId: string): Promise<CustomerAddress[]> {
    return customerRepository.listAddressesByCustomerId(customerId);
  }

  /**
   * Retrieves single address with strict customer ownership enforcement
   */
  public async getAddress(addressId: string, customerId: string): Promise<CustomerAddress> {
    const address = await customerRepository.findAddressById(addressId);
    if (!address || address.customer_id !== customerId) {
      throw new AppError(404, 'CUSTOMER_ADDRESS_NOT_FOUND', 'Delivery address does not exist or does not belong to you');
    }
    return address;
  }

  /**
   * Creates a new customer address
   */
  public async createAddress(
    customerId: string,
    data: {
      label: string;
      recipient_name?: string;
      phone_e164?: string;
      address_line1: string;
      address_line2?: string;
      landmark?: string;
      city?: string;
      region?: string;
      country_code?: string;
      postal_code?: string;
      latitude: number;
      longitude: number;
      delivery_instructions?: string;
      is_default?: boolean;
    },
    actor: { userId: string; role: string; ip?: string }
  ): Promise<CustomerAddress> {
    // If coords are missing or 0, attempt geocode
    let lat = data.latitude;
    let lng = data.longitude;

    if (!lat || !lng) {
      const fullText = [data.address_line1, data.landmark, data.city || 'Nairobi'].filter(Boolean).join(' ');
      const geocoded = await mapsProvider.geocode(fullText);
      if (geocoded.length > 0) {
        lat = geocoded[0].latitude;
        lng = geocoded[0].longitude;
      } else {
        lat = -1.2683;
        lng = 36.8044;
      }
    }

    const created = await customerRepository.createAddress({
      ...data,
      customer_id: customerId,
      latitude: lat,
      longitude: lng,
    });

    await authRepository.createAuditLog({
      actor_user_id: actor.userId,
      actor_role: (actor.role as UserRole) || UserRole.CUSTOMER,
      action: AuditAction.CUSTOMER_ADDRESS_CREATED,
      resource_type: 'CUSTOMER_ADDRESS',
      resource_id: created.id,
      metadata: { created, ip_address: actor.ip },
    });

    return created;
  }

  /**
   * Updates an existing customer address with strict customer isolation
   */
  public async updateAddress(
    addressId: string,
    customerId: string,
    data: Partial<CustomerAddress>,
    actor: { userId: string; role: string; ip?: string }
  ): Promise<CustomerAddress> {
    const existing = await customerRepository.findAddressById(addressId);
    if (!existing || existing.customer_id !== customerId) {
      throw new AppError(404, 'CUSTOMER_ADDRESS_NOT_FOUND', 'Delivery address does not exist or does not belong to you');
    }

    const updated = await customerRepository.updateAddress(addressId, customerId, data);
    if (!updated) {
      throw new AppError(500, 'CUSTOMER_ADDRESS_UPDATE_FAILED', 'Could not update delivery address');
    }

    await authRepository.createAuditLog({
      actor_user_id: actor.userId,
      actor_role: (actor.role as UserRole) || UserRole.CUSTOMER,
      action: AuditAction.CUSTOMER_ADDRESS_UPDATED,
      resource_type: 'CUSTOMER_ADDRESS',
      resource_id: addressId,
      metadata: {
        before: existing,
        after: updated,
        ip_address: actor.ip,
      },
    });

    return updated;
  }

  /**
   * Deletes a customer address
   */
  public async deleteAddress(
    addressId: string,
    customerId: string,
    actor: { userId: string; role: string; ip?: string }
  ): Promise<boolean> {
    const existing = await customerRepository.findAddressById(addressId);
    if (!existing || existing.customer_id !== customerId) {
      throw new AppError(404, 'CUSTOMER_ADDRESS_NOT_FOUND', 'Delivery address does not exist or does not belong to you');
    }

    const success = await customerRepository.deleteAddress(addressId, customerId);

    await authRepository.createAuditLog({
      actor_user_id: actor.userId,
      actor_role: (actor.role as UserRole) || UserRole.CUSTOMER,
      action: AuditAction.CUSTOMER_ADDRESS_DELETED,
      resource_type: 'CUSTOMER_ADDRESS',
      resource_id: addressId,
      metadata: { deleted: existing, ip_address: actor.ip },
    });

    return success;
  }

  /**
   * Sets default delivery address for customer
   */
  public async setDefaultAddress(
    addressId: string,
    customerId: string,
    actor: { userId: string; role: string; ip?: string }
  ): Promise<CustomerAddress> {
    const existing = await customerRepository.findAddressById(addressId);
    if (!existing || existing.customer_id !== customerId) {
      throw new AppError(404, 'CUSTOMER_ADDRESS_NOT_FOUND', 'Delivery address does not exist or does not belong to you');
    }

    const updated = await customerRepository.setDefaultAddress(addressId, customerId);
    if (!updated) {
      throw new AppError(500, 'CUSTOMER_ADDRESS_DEFAULT_FAILED', 'Failed setting default delivery address');
    }

    await authRepository.createAuditLog({
      actor_user_id: actor.userId,
      actor_role: (actor.role as UserRole) || UserRole.CUSTOMER,
      action: AuditAction.CUSTOMER_DEFAULT_ADDRESS_SET,
      resource_type: 'CUSTOMER_ADDRESS',
      resource_id: addressId,
      metadata: { default_address_id: addressId, ip_address: actor.ip },
    });

    return updated;
  }
}

export const customerService = transactionalService(new CustomerService());

