/**
 * DEETOO - Customer Location Selector
 * Location picker header control showing serviceability, saved addresses, and geocoded zones
 */

import React, { useState } from 'react';
import { CustomerAddress, ServiceabilityCheckResult } from '@deetoo/types';
import { MapPin, ChevronDown, Plus, Check, Compass, AlertCircle, ShieldCheck } from 'lucide-react';
import { Badge, Button } from '../../../../packages/ui/src/index';

interface CustomerLocationSelectorProps {
  currentAddressText: string;
  currentCoords: { latitude: number; longitude: number };
  savedAddresses: CustomerAddress[];
  serviceability: ServiceabilityCheckResult | null;
  onSelectAddress: (address: CustomerAddress) => void;
  onSelectPresetCoords: (name: string, lat: number, lng: number) => void;
  onAddNewAddress: () => void;
  isAuthenticated: boolean;
}

const PRESET_ZONES = [

  { name: 'Westlands (Mpaka Rd)', lat: -1.2683, lng: 36.8044 },
  { name: 'Kilimani (Argwings Kodhek)', lat: -1.1026, lng: 36.7876 },
  { name: 'Nairobi CBD (Kenyatta Ave)', lat: -1.2864, lng: 36.8172 },
  { name: 'Upper Hill (Elgon Rd)', lat: -1.2989, lng: 36.8145 },
  { name: 'Karen (Karen Rd)', lat: -1.3197, lng: 36.7065 },
  { name: 'Limuru', lat: -1.1123, lng: 36.6432 },
];

export const CustomerLocationSelector: React.FC<CustomerLocationSelectorProps> = ({
  currentAddressText,
  currentCoords,
  savedAddresses,
  serviceability,
  onSelectAddress,
  onSelectPresetCoords,
  onAddNewAddress,
  isAuthenticated,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const isServiceable = serviceability?.serviceable;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition-all cursor-pointer group"
      >
        <div className={`p-1.5 rounded-lg shrink-0 ${isServiceable === undefined ? 'bg-slate-100 text-slate-600' : isServiceable ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          <MapPin size={15} />
        </div>
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Deliver To:
            </span>
            <Badge
              variant={isServiceable === undefined ? 'default' : isServiceable ? 'success' : 'danger'}
              className="text-[9px] px-1.5 py-0 font-semibold"
            >
              {isServiceable === undefined ? 'Availability unconfirmed' : isServiceable ? 'Zone Active' : 'Outside Zone'}
            </Badge>
          </div>
          <span className="text-xs font-bold text-slate-800 truncate max-w-[200px] sm:max-w-[260px] group-hover:text-emerald-700 transition-colors">
            {currentAddressText}
          </span>
        </div>
        <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-700 shrink-0 ml-1" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 divide-y divide-slate-100">
            {/* Serviceability info header */}
            <div className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Compass size={14} className="text-emerald-600" />
                  Serviceability & Location
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {currentCoords.latitude.toFixed(4)}, {currentCoords.longitude.toFixed(4)}
                </span>
              </div>
              <div className={`mt-2 p-2.5 rounded-xl text-xs flex items-start gap-2 ${
                isServiceable === undefined ? 'bg-slate-100 text-slate-600' : isServiceable ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {isServiceable ? (
                  <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold text-[11px]">
                    {isServiceable === undefined
                      ? 'Delivery availability has not been confirmed.'
                      : isServiceable
                      ? `${serviceability?.zone_name || 'Delivery Zone'} Active`
                      : 'Delivery Not Available Here'}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                    {isServiceable === undefined
                      ? 'Delivery availability has not been confirmed.'
                      : isServiceable
                      ? `${serviceability?.eligible_branch_count ?? 0} open branches can deliver to this location.`
                      : 'Delivery is not currently available at this location.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Saved Customer Addresses */}
            {isAuthenticated && (
              <div className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                    Saved Addresses ({savedAddresses.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onAddNewAddress();
                    }}
                    className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} /> Add New
                  </button>
                </div>

                {savedAddresses.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-1">No saved addresses yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {savedAddresses.map((addr) => {
                      const isSelected =
                        Math.abs(addr.latitude - currentCoords.latitude) < 0.0001 &&
                        Math.abs(addr.longitude - currentCoords.longitude) < 0.0001;

                      return (
                        <div
                          key={addr.id}
                          onClick={() => {
                            onSelectAddress(addr);
                            setIsOpen(false);
                          }}
                          className={`p-2 rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-emerald-50 border border-emerald-300'
                              : 'hover:bg-slate-50 border border-slate-100'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <MapPin size={13} className={isSelected ? 'text-emerald-600 mt-0.5' : 'text-slate-400 mt-0.5'} />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800">{addr.label}</span>
                                {addr.is_default && (
                                  <Badge variant="default" className="text-[9px] px-1 py-0">Default</Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 truncate max-w-[200px]">
                                {addr.address_line1}
                              </p>
                            </div>
                          </div>
                          {isSelected && <Check size={14} className="text-emerald-600 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Nearby Locations */}
            <div className="pt-3">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-2">
                Choose a Nairobi location
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_ZONES.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      onSelectPresetCoords(preset.name, preset.lat, preset.lng);
                      setIsOpen(false);
                    }}
                    className="p-2 text-left bg-slate-50 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                  >
                    <p className="font-semibold text-[11px] text-slate-800 truncate">{preset.name.split(' ')[0]}</p>
                    <p className="text-[10px] text-slate-400">{preset.lat}, {preset.lng}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
