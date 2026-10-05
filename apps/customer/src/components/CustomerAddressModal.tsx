/**
 * DEETOO - Customer Address Modal
 * Address creation and editing with geocoding, coordinates, and delivery instructions
 */

import React, { useState } from 'react';
import { CustomerAddress, GeocodeResult } from '@deetoo/types';
import { Button, Input, Modal, FormField, Badge } from '../../../../packages/ui/src/index';
import { MapPin, Navigation, Compass, AlertCircle, CheckCircle } from 'lucide-react';
import { DeetooApiClient } from '../../../../packages/api-client/src/index';

interface CustomerAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (address: CustomerAddress) => void;
  apiClient: DeetooApiClient;
  initialAddress?: CustomerAddress | null;
}

const NAIROBI_PRESETS = [
  { name: 'Westlands (Mpaka Rd)', lat: -1.2683, lng: 36.8044, area: 'Westlands' },
  { name: 'Kilimani (Argwings Kodhek)', lat: -1.2921, lng: 36.7876, area: 'Kilimani' },
  { name: 'Nairobi CBD (Kenyatta Ave)', lat: -1.2864, lng: 36.8172, area: 'CBD' },
  { name: 'Upper Hill (Elgon Rd)', lat: -1.2989, lng: 36.8145, area: 'Upper Hill' },
  { name: 'Karen (Karen Rd)', lat: -1.3197, lng: 36.7065, area: 'Karen' },
  { name: 'Lavington (James Gichuru)', lat: -1.2785, lng: 36.7725, area: 'Lavington' },
];

export const CustomerAddressModal: React.FC<CustomerAddressModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  apiClient,
  initialAddress,
}) => {
  const [label, setLabel] = useState(initialAddress?.label || 'Home');
  const [recipientName, setRecipientName] = useState(initialAddress?.recipient_name || '');
  const [phone, setPhone] = useState(initialAddress?.phone_e164 || '');
  const [addressLine1, setAddressLine1] = useState(initialAddress?.address_line1 || '');
  const [addressLine2, setAddressLine2] = useState(initialAddress?.address_line2 || '');
  const [landmark, setLandmark] = useState(initialAddress?.landmark || '');
  const [latitude, setLatitude] = useState<number>(initialAddress?.latitude || -1.2683);
  const [longitude, setLongitude] = useState<number>(initialAddress?.longitude || 36.8044);
  const [instructions, setInstructions] = useState(initialAddress?.delivery_instructions || '');
  const [isDefault, setIsDefault] = useState(initialAddress?.is_default || false);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const res = await apiClient.geocodeAddress(searchQuery);
      setSearchResults(res.data || []);
      if ((res.data || []).length === 0) {
        setError('No locations found for this query in Nairobi.');
      }
    } catch (err: any) {
      setError(err.message || 'Geocoding failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectGeocode = (geo: GeocodeResult) => {
    setAddressLine1(geo.formatted_address);
    setLatitude(geo.latitude);
    setLongitude(geo.longitude);
    if (geo.city && !landmark) {
      setLandmark(geo.city);
    }
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleApplyPreset = (preset: typeof NAIROBI_PRESETS[0]) => {
    setAddressLine1(preset.name);
    setLatitude(preset.lat);
    setLongitude(preset.lng);
    setLandmark(preset.area);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressLine1) {
      setError('Please provide an address.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        label,
        recipient_name: recipientName || undefined,
        phone_e164: phone || undefined,
        address_line1: addressLine1,
        address_line2: addressLine2 || undefined,
        landmark: landmark || undefined,
        city: 'Nairobi',
        country_code: 'KE',
        latitude,
        longitude,
        delivery_instructions: instructions || undefined,
        is_default: isDefault,
      };

      let saved: CustomerAddress;
      if (initialAddress?.id) {
        const res = await apiClient.updateCustomerAddress(initialAddress.id, payload);
        saved = res.data;
      } else {
        const res = await apiClient.createCustomerAddress(payload);
        saved = res.data;
      }

      onSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save address');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialAddress ? 'Edit Delivery Address' : 'Add New Delivery Address'}
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Location Preset Buttons */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Quick Select Nairobi Area:</label>
          <div className="flex flex-wrap gap-1.5">
            {NAIROBI_PRESETS.map((p) => (
              <button
                type="button"
                key={p.name}
                onClick={() => handleApplyPreset(p)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
              >
                {p.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Geocode Search */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <label className="block font-semibold text-slate-700">Search Address or Landmark:</label>
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. Westgate Mall, Sarit Centre, Mpaka Road..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSearchAddress}
              disabled={isSearching}
            >
              {isSearching ? 'Locating...' : 'Search'}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 divide-y divide-slate-100 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
              {searchResults.map((result, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectGeocode(result)}
                  className="p-2 hover:bg-emerald-50 cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <MapPin size={13} className="text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-800 text-[11px]">{result.formatted_address}</p>
                      <p className="text-[10px] text-slate-400">
                        {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="default" className="text-[9px]">Select</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Address Label */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Address Label">
            <select
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="Home">Home</option>
              <option value="Work">Work</option>
              <option value="Office">Office</option>
              <option value="Gym">Gym</option>
              <option value="Partner">Partner</option>
              <option value="Other">Other</option>
            </select>
          </FormField>

          <FormField label="Recipient Name (Optional)">
            <Input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Jane Doe"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Phone Number (Optional)">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254 7XX XXX XXX"
            />
          </FormField>

          <FormField label="Landmark / Estate">
            <Input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="Near Sarit Centre, Gate B"
            />
          </FormField>
        </div>

        <FormField label="Street Address / Building">
          <Input
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder="e.g. Mpaka Rd, Block 4, Flat 12"
            required
          />
        </FormField>

        <FormField label="Apartment / Suite / Floor (Optional)">
          <Input
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            placeholder="e.g. 3rd Floor, Door 3B"
          />
        </FormField>

        {/* Coordinates Preview */}
        <div className="flex items-center justify-between p-2.5 bg-slate-100 rounded-lg text-[11px] text-slate-600 font-mono">
          <div className="flex items-center gap-1.5">
            <Compass size={13} className="text-slate-500" />
            <span>GPS: {latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
          </div>
          <span className="text-emerald-700 font-semibold flex items-center gap-1">
            <CheckCircle size={12} /> PostGIS Ready
          </span>
        </div>

        <FormField label="Delivery Instructions">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="e.g. Ring doorbell, leave at front desk, call upon arrival..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-normal focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </FormField>

        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
          />
          <span className="text-slate-700 font-medium">Set as primary default delivery address</span>
        </label>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
            {isSaving ? 'Saving...' : initialAddress ? 'Update Address' : 'Save Address'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
