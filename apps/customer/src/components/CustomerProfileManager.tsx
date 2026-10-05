/**
 * DEETOO - Customer Profile & Saved Addresses Manager (Sprint 5)
 * Manages profile information, preferences, and delivery addresses with PostGIS coordinates
 */

import React, { useState, useEffect } from 'react';
import { CustomerProfile, CustomerAddress } from '@deetoo/types';
import { DeetooApiClient } from '../../../../packages/api-client/src/index';
import {
  Card,
  Button,
  Input,
  Badge,
  Spinner,
  FormField,
  EmptyState,
} from '../../../../packages/ui/src/index';
import {
  User,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Smartphone,
  Mail,
  Compass,
  Star,
} from 'lucide-react';
import { CustomerAddressModal } from './CustomerAddressModal';

interface CustomerProfileManagerProps {
  apiClient: DeetooApiClient;
  onAddressListChanged?: () => void;
}

export const CustomerProfileManager: React.FC<CustomerProfileManagerProps> = ({
  apiClient,
  onAddressListChanged,
}) => {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile Form state
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Address Modal state
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setMsg(null);
    try {
      const [pRes, aRes] = await Promise.all([
        apiClient.getCustomerProfile().catch(() => ({ data: null })),
        apiClient.getCustomerAddresses().catch(() => ({ data: [] })),
      ]);

      if (pRes.data) {
        setProfile(pRes.data);
        setDisplayName(pRes.data.display_name || '');
        setFirstName(pRes.data.first_name || '');
        setLastName(pRes.data.last_name || '');
        setPhone(pRes.data.phone || '');
        setEmail(pRes.data.email || '');
      }

      setAddresses(aRes.data || []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load profile data' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setMsg(null);
    try {
      const res = await apiClient.updateCustomerProfile({
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
      });
      setProfile(res.data);
      setMsg({ type: 'success', text: 'Customer profile updated successfully.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to update profile' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this delivery address?')) return;
    try {
      await apiClient.deleteCustomerAddress(id);
      setAddresses(addresses.filter((a) => a.id !== id));
      setMsg({ type: 'success', text: 'Address removed.' });
      onAddressListChanged?.();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to delete address' });
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await apiClient.setDefaultCustomerAddress(id);
      setAddresses(
        addresses.map((a) => ({
          ...a,
          is_default: a.id === id,
        }))
      );
      setMsg({ type: 'success', text: 'Default delivery address updated.' });
      onAddressListChanged?.();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to set default address' });
    }
  };

  const handleAddressSaved = (saved: CustomerAddress) => {
    if (editingAddress) {
      setAddresses(addresses.map((a) => (a.id === saved.id ? saved : a)));
    } else {
      setAddresses([saved, ...addresses]);
    }
    setEditingAddress(null);
    setMsg({ type: 'success', text: 'Delivery address saved.' });
    onAddressListChanged?.();
  };

  if (isLoading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center gap-2">
        <Spinner size="md" />
        <p className="text-xs text-slate-500 font-medium">Loading customer profile & addresses...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alert Notification */}
      {msg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-red-600 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Grid: Profile Form & Saved Addresses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile Card (5 cols) */}
        <div className="lg:col-span-5">
          <Card className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-base">
                {displayName ? displayName.charAt(0).toUpperCase() : 'C'}
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">
                  {displayName || 'Customer Profile'}
                </h3>
                <p className="text-[11px] text-slate-400">Manage your identity and contact details</p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="mt-4 space-y-3 text-xs">
              <FormField label="Display Name">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Jane D."
                  required
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="First Name">
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                  />
                </FormField>
                <FormField label="Last Name">
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </FormField>
              </div>

              <FormField label="Phone Number (E.164)">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+2547XXXXXXXX"
                />
              </FormField>

              <FormField label="Email Address">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </FormField>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="w-full"
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Addresses List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <MapPin size={16} className="text-emerald-600" />
                Saved Delivery Addresses
              </h3>
              <p className="text-xs text-slate-500">
                Addresses with verified PostGIS coordinates for accurate delivery matching
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingAddress(null);
                setIsAddressModalOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Plus size={14} /> Add Address
            </Button>
          </div>

          {addresses.length === 0 ? (
            <Card className="p-8 text-center bg-white border border-slate-200 rounded-2xl">
              <MapPin size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-700">No saved addresses</p>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
                Save your home or office address to discover nearby restaurants and calculate exact delivery fees.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingAddress(null);
                  setIsAddressModalOpen(true);
                }}
              >
                Add Your First Address
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {addresses.map((addr) => (
                <Card
                  key={addr.id}
                  className={`p-4 bg-white border rounded-2xl transition-all ${
                    addr.is_default
                      ? 'border-emerald-300 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-xl shrink-0 ${
                          addr.is_default
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <MapPin size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-xs text-slate-900">{addr.label}</h4>
                          {addr.is_default && (
                            <Badge variant="success" className="text-[9px] px-1.5 py-0">
                              Primary Default
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-slate-700 mt-1 font-medium">
                          {addr.address_line1}
                          {addr.address_line2 && `, ${addr.address_line2}`}
                        </p>

                        {addr.landmark && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            <span className="font-semibold text-slate-600">Landmark:</span> {addr.landmark}
                          </p>
                        )}

                        {addr.delivery_instructions && (
                          <p className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md mt-1 inline-block">
                            "{addr.delivery_instructions}"
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Compass size={11} /> {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}
                          </span>
                          {addr.city && <span>{addr.city}, {addr.country_code}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!addr.is_default && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(addr.id)}
                          className="px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAddress(addr);
                          setIsAddressModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Edit address"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete address"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Address Edit/Create Modal */}
      {isAddressModalOpen && (
        <CustomerAddressModal
          isOpen={isAddressModalOpen}
          onClose={() => setIsAddressModalOpen(false)}
          onSaved={handleAddressSaved}
          apiClient={apiClient}
          initialAddress={editingAddress}
        />
      )}
    </div>
  );
};
