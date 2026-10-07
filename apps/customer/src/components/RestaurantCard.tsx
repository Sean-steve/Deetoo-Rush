import React from "react";
import { PublicRestaurantBranch } from "@deetoo/types";
import {
  ArrowRight,
  Clock3,
  MapPin,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import { Price } from "../../../../packages/ui/src/index";
import { StatusBadge } from "../../../../packages/ui/src/workflows";

export function RestaurantCard({
  restaurant,
  onSelect,
  featured = false,
}: {
  restaurant: PublicRestaurantBranch;
  onSelect: (branchId: string) => void;
  featured?: boolean;
}) {
  const cover = restaurant.cover_url || restaurant.logo_url;
  const unavailable = !restaurant.serviceable || restaurant.open_status === "UNAVAILABLE";
  const busy = restaurant.is_busy || restaurant.open_status === "BUSY";
  const distanceLabel =
    restaurant.distance_km != null
      ? `${Number(restaurant.distance_km).toFixed(
          Number(restaurant.distance_km) >= 10 ? 0 : 1,
        )} km away`
      : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(restaurant.branch_id)}
      className={`restaurant-card customer-restaurant-card text-left group ${
        featured ? "customer-restaurant-card-featured" : ""
      }`}
      aria-label={`Open ${restaurant.merchant_name} menu`}
    >
      <div className="restaurant-cover customer-restaurant-media">
        {cover ? (
          <img src={cover} alt="" loading="lazy" />
        ) : (
          <div className="restaurant-placeholder">
            <UtensilsCrossed size={38} aria-hidden="true" />
            <span>{restaurant.merchant_name}</span>
          </div>
        )}

        <div className="customer-restaurant-status">
          <StatusBadge status={restaurant.open_status} />
          {busy && <span className="customer-busy-badge">Busy kitchen</span>}
        </div>

        <div className="customer-restaurant-image-footer">
          <span>
            <Clock3 size={13} aria-hidden="true" />
            ~{restaurant.prep_default_min} min prep
          </span>
          {distanceLabel && (
            <span>
              <MapPin size={13} aria-hidden="true" />
              {distanceLabel}
            </span>
          )}
        </div>
      </div>

      <div className="customer-restaurant-content">
        <div className="customer-restaurant-heading">
          <div className="min-w-0">
            <h3>{restaurant.merchant_name}</h3>
            <p className="customer-restaurant-cuisines">
              {restaurant.categories.length
                ? restaurant.categories.join(" · ")
                : "Restaurant"}
            </p>
          </div>
          <span className="customer-restaurant-arrow" aria-hidden="true">
            <ArrowRight size={18} />
          </span>
        </div>

        <div className="customer-restaurant-facts">
          <span>
            <ShoppingBag size={13} aria-hidden="true" />
            Minimum <Price minor={restaurant.min_order_minor} />
          </span>
          <span className="customer-restaurant-branch">{restaurant.branch_name}</span>
        </div>

        {unavailable && (
          <p className="customer-restaurant-note">
            Browse the menu now; ordering is unavailable at this location.
          </p>
        )}
        {busy && !unavailable && (
          <p className="customer-restaurant-note customer-restaurant-note-warning">
            Preparation may take longer than usual.
          </p>
        )}
      </div>
    </button>
  );
}
