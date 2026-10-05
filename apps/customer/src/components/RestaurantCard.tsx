import React from "react";
import { PublicRestaurantBranch } from "@deetoo/types";
import { Clock, MapPin, ArrowUpRight, UtensilsCrossed } from "lucide-react";
import { Price } from "../../../../packages/ui/src/index";
import { StatusBadge } from "../../../../packages/ui/src/workflows";
export function RestaurantCard({
  restaurant,
  onSelect,
}: {
  restaurant: PublicRestaurantBranch;
  onSelect: (branchId: string) => void;
}) {
  const cover = restaurant.cover_url || restaurant.logo_url;
  return (
    <button
      type="button"
      onClick={() => onSelect(restaurant.branch_id)}
      className="restaurant-card text-left group"
    >
      <div className="restaurant-cover">
        {cover ? (
          <img src={cover} alt={restaurant.merchant_name} loading="lazy" />
        ) : (
          <div className="restaurant-placeholder">
            <UtensilsCrossed size={40} />
            <span>{restaurant.merchant_name}</span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <StatusBadge status={restaurant.open_status} />
        </div>
        <div className="restaurant-cover-meta">
          <span>
            <MapPin size={12} />
            {restaurant.branch_name}
          </span>
          <span>
            <Clock size={12} />
            {restaurant.prep_default_min} min prep
          </span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-bold text-lg leading-tight">
            {restaurant.merchant_name}
          </h3>
          <span className="rounded-full bg-stone-100 p-2">
            <ArrowUpRight size={18} />
          </span>
        </div>
        <p className="text-sm text-stone-600 mt-2">
          {restaurant.categories.join(" · ")}
        </p>
        <div className="flex justify-between text-xs mt-3">
          <span>
            Minimum <Price minor={restaurant.min_order_minor} />
          </span>
          {restaurant.distance_km != null && (
            <span>{restaurant.distance_km} km</span>
          )}
        </div>
        {restaurant.is_busy && (
          <p className="mt-2 text-xs text-amber-800">Kitchen is busy</p>
        )}
      </div>
    </button>
  );
}
