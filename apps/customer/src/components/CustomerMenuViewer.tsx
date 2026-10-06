/**
 * DEETOO - Customer Public-Safe Restaurant Menu Viewer (Sprint 4)
 * Allows customers to browse restaurant menus, categories, items, prices in minor units,
 * and select required/optional modifier options with dynamic price calculation.
 */

import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  Badge,
  BottomSheet,
  EmptyState,
  Toast,
  FilterChip,
  InlineBanner,
  ListSkeleton,
  StickyActionBar,
} from "../../../../packages/ui/src/index";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  PublicRestaurantMenu,
  PublicMenuCategory,
  PublicMenuItem,
  PublicModifierGroup,
  PublicModifierOption,
} from "../../../../packages/types/src/index";
import {
  ArrowLeft,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  Plus,
  Check,
  AlertCircle,
  Sparkles,
  Info,
} from "lucide-react";

interface CustomerMenuViewerProps {
  branchId: string;
  onBackToBranches: () => void;
  onCartChanged?: () => void;
  onSignIn?: () => void;
}

export function CustomerMenuViewer({
  branchId,
  onBackToBranches,
  onCartChanged,
  onSignIn,
}: CustomerMenuViewerProps) {
  const { apiClient, isAuthenticated } = useAuth();
  const [adding, setAdding] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);

  const [menuData, setMenuData] = useState<PublicRestaurantMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");

  // Item modifier configuration modal state
  const [selectedItem, setSelectedItem] = useState<PublicMenuItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<
    Record<string, string[]>
  >({}); // groupId -> array of optionIds
  const [itemQuantity, setItemQuantity] = useState(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Format minor units into KES
  const formatKES = (minor: number) => {
    return `KES ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  useEffect(() => {
    let isMounted = true;
    const loadMenu = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.getPublicRestaurantMenu(branchId);
        if (isMounted) {
          setMenuData(res.data || null);
          if (res.data?.categories && res.data.categories.length > 0) {
            setActiveCategory("ALL");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Unable to load restaurant menu");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadMenu();
    return () => {
      isMounted = false;
    };
  }, [branchId, apiClient]);

  // Open item configuration
  const handleOpenItem = (item: PublicMenuItem) => {
    if (!item.is_available) return;

    setSelectedItem(item);
    setItemQuantity(1);
    setCartError(null);

    // Initialize required modifiers with first available option
    const initialSelections: Record<string, string[]> = {};
    for (const group of item.modifier_groups) {
      if (group.min_selections === 1 && group.max_selections === 1) {
        const firstAvailable = group.options.find((o) => o.is_available);
        if (firstAvailable) {
          initialSelections[group.id] = [firstAvailable.id];
        }
      } else {
        initialSelections[group.id] = [];
      }
    }
    setSelectedModifiers(initialSelections);
  };

  // Toggle modifier option
  const handleToggleOption = (
    group: PublicModifierGroup,
    option: PublicModifierOption,
  ) => {
    if (!option.is_available) return;

    const currentSelected = selectedModifiers[group.id] || [];

    // Single-choice (Radio style)
    if (group.max_selections === 1) {
      setSelectedModifiers({
        ...selectedModifiers,
        [group.id]: [option.id],
      });
      return;
    }

    // Multi-choice (Checkbox style)
    if (currentSelected.includes(option.id)) {
      // Uncheck
      setSelectedModifiers({
        ...selectedModifiers,
        [group.id]: currentSelected.filter((id) => id !== option.id),
      });
    } else {
      // Check (if under max)
      if (currentSelected.length < group.max_selections) {
        setSelectedModifiers({
          ...selectedModifiers,
          [group.id]: [...currentSelected, option.id],
        });
      }
    }
  };

  // Check if all modifier requirements are fulfilled
  const isSelectionValid = (item: PublicMenuItem): boolean => {
    for (const group of item.modifier_groups) {
      const count = (selectedModifiers[group.id] || []).length;
      if (count < group.min_selections) {
        return false;
      }
      if (count > group.max_selections) {
        return false;
      }
    }
    return true;
  };

  // Calculate dynamic running total price
  const calculateTotalPrice = (item: PublicMenuItem): number => {
    let totalMinor = item.price_minor;

    for (const group of item.modifier_groups) {
      const selectedOptionIds = selectedModifiers[group.id] || [];
      for (const optId of selectedOptionIds) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt && opt.price_delta_minor) {
          totalMinor += opt.price_delta_minor;
        }
      }
    }

    return totalMinor * itemQuantity;
  };

  if (loading) {
    return (
      <div className="py-8 font-sans" aria-label="Loading live restaurant menu">
        <ListSkeleton rows={6} />
      </div>
    );
  }

  if (error || !menuData) {
    return (
      <div className="py-12 max-w-lg mx-auto font-sans">
        <Card className="p-6 text-center bg-white border border-slate-200">
          <AlertCircle size={32} className="mx-auto text-rose-500 mb-3" />
          <h3 className="text-base font-bold text-slate-900">
            Menu Unavailable
          </h3>
          <p className="text-xs text-slate-600 mt-1 mb-4">
            {error || "Could not find menu for this branch"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onBackToBranches}
            className="cursor-pointer"
          >
            <ArrowLeft size={14} className="mr-1.5" /> Back to Restaurants
          </Button>
        </Card>
      </div>
    );
  }

  // Filter categories
  const displayedCategories =
    activeCategory === "ALL"
      ? menuData.categories
      : menuData.categories.filter((c) => c.id === activeCategory);

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Restaurant Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Cover / Brand Bar */}
        <div className="h-28 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-6 flex items-start justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={onBackToBranches}
            className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-xs text-xs cursor-pointer"
          >
            <ArrowLeft size={14} className="mr-1" /> All Restaurants
          </Button>

          <Badge
            variant="success"
            className="text-xs bg-emerald-600 text-white border-0 shadow-sm"
          >
            {menuData.branch.operational_status}
          </Badge>
        </div>

        {/* Restaurant Info Card */}
        <div className="px-6 pb-6 pt-2 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 -mt-8">
          <div className="flex items-end gap-4">
            {/* Logo */}
            <div className="w-16 h-16 rounded-2xl bg-white border-2 border-white shadow-md overflow-hidden shrink-0 flex items-center justify-center">
              {menuData.merchant.logo_url ? (
                <img
                  src={menuData.merchant.logo_url}
                  alt={menuData.merchant.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-brand text-white flex items-center justify-center font-bold text-xl">
                  {menuData.merchant.display_name.charAt(0)}
                </div>
              )}
            </div>

            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-none">
                {menuData.merchant.display_name}
              </h1>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">
                  {menuData.branch.name}
                </span>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1 text-slate-500">
                  <MapPin size={12} /> {menuData.branch.address_text}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right text-xs text-slate-500">
            <span className="font-semibold text-slate-700 block">
              Current Menu:
            </span>
            <span className="font-medium text-emerald-700">
              {menuData.menu.name}
            </span>
          </div>
        </div>
      </div>

      {/* Category Navigation Pills */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md p-2 rounded-xl border border-slate-200 shadow-xs flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <FilterChip
          selected={activeCategory === "ALL"}
          count={menuData.categories.reduce((sum, category) => sum + category.items.length, 0)}
          onClick={() => setActiveCategory("ALL")}
        >
          All items
        </FilterChip>

        {menuData.categories.map((cat) => (
          <FilterChip
            key={cat.id}
            selected={activeCategory === cat.id}
            count={cat.items.length}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.name}
          </FilterChip>
        ))}
      </div>

      {/* Categories & Food Dishes Grid */}
      <div className="space-y-8">
        {displayedCategories.map((category) => (
          <div key={category.id} className="space-y-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {category.name}
              </h2>
              {category.description && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {category.description}
                </p>
              )}
            </div>

            {category.items.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                No dishes available in this section.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.items.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={item.is_available ? 0 : -1}
                    aria-disabled={!item.is_available}
                    aria-label={`Customize ${item.name}`}
                    onKeyDown={(event) => {
                      if (
                        item.is_available &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        handleOpenItem(item);
                      }
                    }}
                    onClick={() => item.is_available && handleOpenItem(item)}
                    className={`group bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col justify-between transition-all ${
                      item.is_available
                        ? "hover:border-slate-300 hover:shadow-md cursor-pointer"
                        : "opacity-60 bg-slate-50 cursor-not-allowed"
                    }`}
                  >
                    {/* Item Image */}
                    <div className="relative h-44 bg-slate-100 overflow-hidden">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className={`w-full h-full object-cover transition-transform duration-300 ${
                            item.is_available
                              ? "group-hover:scale-105"
                              : "grayscale"
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          Food Image
                        </div>
                      )}

                      {/* Status Tag */}
                      {!item.is_available && (
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center">
                          <span className="px-3 py-1 bg-rose-600 text-white font-bold text-xs rounded-md shadow-lg tracking-wide uppercase">
                            Sold Out
                          </span>
                        </div>
                      )}

                      {/* Price Tag */}
                      <div className="absolute bottom-2.5 right-2.5 bg-slate-900/90 text-white text-xs font-extrabold px-2.5 py-1 rounded-lg backdrop-blur-xs shadow-md">
                        {formatKES(item.price_minor)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 group-hover:text-brand transition-colors line-clamp-1">
                          {item.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {item.description ||
                            "Freshly prepared with quality ingredients."}
                        </p>
                      </div>

                      {/* Modifier Summary & Action */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <div className="text-[11px] text-slate-400">
                          {item.modifier_groups.length > 0 ? (
                            <span className="text-emerald-700 font-medium">
                              {item.modifier_groups.length} Customization
                              {item.modifier_groups.length > 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span>Standard Recipe</span>
                          )}
                        </div>

                        {item.is_available ? (
                          <span className="text-xs font-bold text-brand flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                            Customize <Plus size={13} />
                          </span>
                        ) : (
                          <span className="text-xs text-rose-500 font-medium">
                            Unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ==========================================
          MODAL: Item Customization & Modifier Selections
      ========================================== */}
      {selectedItem && (
        <BottomSheet
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          title={selectedItem.name}
          description="Choose your options, quantity and extras."
          size="lg"
        >
          <div className="space-y-6">
            {/* Food Header Card */}
            <div className="customer-item-sheet-hero">
              {selectedItem.image_url ? (
                <img
                  src={selectedItem.image_url}
                  alt=""
                  className="customer-item-sheet-image"
                />
              ) : (
                <div className="customer-item-sheet-placeholder">
                  <Sparkles size={30} aria-hidden="true" />
                </div>
              )}
              <div>
                <p className="customer-item-sheet-price">
                  {formatKES(selectedItem.price_minor)}
                </p>
                <p className="customer-item-sheet-description">
                  {selectedItem.description ||
                    "Freshly prepared and customized to your selection."}
                </p>
              </div>
            </div>

            {/* Modifier Groups */}
            <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-1">
              {selectedItem.modifier_groups.map((group) => {
                const isRadio = group.max_selections === 1;
                const currentSelections = selectedModifiers[group.id] || [];
                const isGroupFulfilled =
                  currentSelections.length >= group.min_selections;

                return (
                  <div
                    key={group.id}
                    className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs"
                  >
                    {/* Group Header */}
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900">
                            {group.name}
                          </h4>
                          {group.is_required ? (
                            <Badge variant="danger" className="text-[10px]">
                              REQUIRED
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-[10px]">
                              OPTIONAL
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {isRadio
                            ? "Select 1 option"
                            : `Choose up to ${group.max_selections} (selected ${currentSelections.length})`}
                        </span>
                      </div>

                      {isGroupFulfilled ? (
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                          <Check size={13} /> Complete
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600">
                          Requires{" "}
                          {group.min_selections - currentSelections.length} more
                        </span>
                      )}
                    </div>

                    {/* Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.options.map((option) => {
                        const isSelected = currentSelections.includes(
                          option.id,
                        );
                        const disabled = !option.is_available;

                        return (
                          <button
                            type="button"
                            disabled={disabled}
                            aria-pressed={isSelected}
                            key={option.id}
                            onClick={() =>
                              !disabled && handleToggleOption(group, option)
                            }
                            className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-all ${
                              disabled
                                ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                                : isSelected
                                  ? "bg-emerald-50/80 border-brand text-slate-900 font-semibold shadow-2xs cursor-pointer"
                                  : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                                  isSelected
                                    ? "bg-brand border-brand text-white"
                                    : "border-slate-400 bg-white"
                                }`}
                              >
                                {isSelected && (
                                  <Check size={10} strokeWidth={3} />
                                )}
                              </div>
                              <span>{option.name}</span>
                            </div>

                            <div className="text-right">
                              {disabled ? (
                                <span className="text-[10px] text-rose-500 font-medium">
                                  Sold Out
                                </span>
                              ) : option.price_delta_minor > 0 ? (
                                <span className="font-mono text-emerald-700 font-bold">
                                  +{formatKES(option.price_delta_minor)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">
                                  Included
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {cartError && (
              <InlineBanner kind="danger">{cartError}</InlineBanner>
            )}
            {/* Quantity Selector & Sticky purchase action */}
            <div className="customer-item-quantity">
              <span>Quantity</span>
              <div>
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                >
                  −
                </button>
                <strong>{itemQuantity}</strong>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setItemQuantity(itemQuantity + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <StickyActionBar
              primary={
                <Button
                  variant="primary"
                  fullWidth
                  disabled={!isSelectionValid(selectedItem)}
                  isLoading={adding}
                  onClick={async () => {
                    if (!isAuthenticated) {
                      onSignIn?.();
                      return;
                    }
                    setAdding(true);
                    setCartError(null);
                    try {
                      await apiClient.addToCart({
                        branch_id: branchId,
                        menu_item_id: selectedItem.id,
                        quantity: itemQuantity,
                        modifier_option_ids:
                          Object.values(selectedModifiers).flat(),
                      });
                      setSelectedItem(null);
                      setSelectedModifiers({});
                      setItemQuantity(1);
                      setToastMessage("Added to your bag.");
                      onCartChanged?.();
                    } catch (e: any) {
                      setCartError(
                        e?.error?.message || e.message || "Unable to add item.",
                      );
                    } finally {
                      setAdding(false);
                    }
                  }}
                >
                  {isAuthenticated
                    ? `Add · ${formatKES(calculateTotalPrice(selectedItem))}`
                    : "Sign in to add"}
                </Button>
              }
            />

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-500 flex items-center gap-2">
              <Info size={14} className="text-slate-400 shrink-0" />
              <span>
                Final availability and pricing are verified at checkout.
              </span>
            </div>
          </div>
        </BottomSheet>
      )}
      <Toast
        message={toastMessage}
        onDismiss={() => setToastMessage(null)}
        kind="success"
      />
    </div>
  );
}
