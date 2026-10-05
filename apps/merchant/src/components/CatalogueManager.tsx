/**
 * DEETOO - Merchant Catalogue & Menu Management Interface (Sprint 4)
 * Allows merchants to manage menus, categories, items, prices in minor units,
 * images, modifier groups & options, selection constraints, and branch-specific availability overrides.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Card,
  Badge,
  Modal,
  FormField,
  Input,
  Select,
  EmptyState,
} from '../../../../packages/ui/src/index';
import { errorMessage } from '../../../../packages/ui/src/workflows';
import { useAuth } from '../../../../packages/auth/src/react';
import {
  Menu,
  MerchantBranch,
  MenuCategory,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  UserRole,
} from '../../../../packages/types/src/index';
import {
  Plus,
  Edit2,
  Trash2,
  Layers,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Tag,
  CheckCircle2,
  XCircle,
  Clock,
  Image as ImageIcon,
  Building2,
  Sliders,
  AlertCircle,
  DollarSign,
  Check,
  RefreshCw,
} from 'lucide-react';

interface CatalogueManagerProps {
  currentBranchId: string;
  branches: Pick<MerchantBranch, "id" | "name">[];
}

export function CatalogueManager({ currentBranchId, branches }: CatalogueManagerProps) {
  const { apiClient, hasRole } = useAuth();
  const canEdit =
    hasRole(UserRole.MERCHANT_OWNER) ||
    hasRole(UserRole.MERCHANT_MANAGER) ||
    hasRole(UserRole.ADMIN);

  // Core catalogue state
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuBusy, setAddMenuBusy] = useState(false);
  const [addMenuError, setAddMenuError] = useState<string | null>(null);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuBranchId, setNewMenuBranchId] = useState(currentBranchId);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View scoping: 'base' or specific branch ID
  const [catalogueScope, setCatalogueScope] = useState<'base' | string>('base');
  const [branchCatalogueData, setBranchCatalogueData] = useState<any>(null);

  // Active category filter
  const [activeCategoryId, setActiveCategoryId] = useState<string>('ALL');

  // Modals
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [menuFormData, setMenuFormData] = useState({ id: '', name: '', description: '', is_active: true });

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({ id: '', name: '', description: '' });

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemFormData, setItemFormData] = useState({
    id: '',
    category_id: '',
    name: '',
    description: '',
    price_major: '0.00',
    sku: '',
    image_url: '',
    is_available: true,
    modifier_group_ids: [] as string[],
  });

  const [modifiersDrawerOpen, setModifiersDrawerOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupFormData, setGroupFormData] = useState({
    id: '',
    name: '',
    min_selections: 0,
    max_selections: 1,
  });

  const [optionModalOpen, setOptionModalOpen] = useState(false);
  const [optionGroupId, setOptionGroupId] = useState<string>('');
  const [optionFormData, setOptionFormData] = useState({
    id: '',
    name: '',
    price_delta_major: '0.00',
    is_available: true,
  });

  const [branchAssignModalOpen, setBranchAssignModalOpen] = useState(false);
  const [assignedBranches, setAssignedBranches] = useState<string[]>([]);

  // Format minor units (cents) to KES currency
  const formatKES = (cents: number) => {
    return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Preset food image gallery
  const PRESET_FOOD_IMAGES = [
    { label: 'Smash Burger', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80' },
    { label: 'Loaded Truffle Fries', url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80' },
    { label: 'Crispy Wings', url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600&auto=format&fit=crop&q=80' },
    { label: 'Artisanal Milkshake', url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80' },
    { label: 'Fresh Green Salad', url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80' },
  ];

  // ==========================================
  // Fetch Catalogue Data
  // ==========================================
  const loadCatalogue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch menus
      const menusRes = await apiClient.listMenus();
      const loadedMenus = menusRes.data || [];
      setMenus(loadedMenus);

      // Select first menu if none selected
      let activeMenuId = selectedMenuId;
      if (!activeMenuId && loadedMenus.length > 0) {
        activeMenuId = loadedMenus[0].id;
        setSelectedMenuId(activeMenuId);
      }

      if (activeMenuId) {
        // 2. Fetch categories & items for selected menu
        const [catsRes, itemsRes, modGroupsRes] = await Promise.all([
          apiClient.listCategories(activeMenuId),
          apiClient.listItems(activeMenuId),
          apiClient.listModifierGroups(),
        ]);
        setCategories(catsRes.data || []);
        setItems(itemsRes.data || []);
        setModifierGroups(modGroupsRes.data || []);
      }

      // If branch scope is selected, fetch effective branch catalogue
      if (catalogueScope !== 'base') {
        const branchCatRes = await apiClient.getBranchCatalogue(catalogueScope);
        setBranchCatalogueData(branchCatRes.data || null);
      } else {
        setBranchCatalogueData(null);
      }
    } catch (err: any) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [apiClient, selectedMenuId, catalogueScope]);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  // Current active menu object
  const activeMenu = menus.find((m) => m.id === selectedMenuId);

  // ==========================================
  // Fast Availability Toggle
  // ==========================================
  const toggleItemAvailability = async (item: MenuItem, currentStatus: boolean) => {
    if (!canEdit) return;
    const newStatus = !currentStatus;

    // Optimistic UI update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_available: newStatus } : i))
    );

    try {
      const branchId = catalogueScope !== 'base' ? catalogueScope : undefined;
      await apiClient.updateItemAvailability(item.id, newStatus, branchId);
      if (catalogueScope !== 'base') {
        // Refresh branch view
        const branchCatRes = await apiClient.getBranchCatalogue(catalogueScope);
        setBranchCatalogueData(branchCatRes.data || null);
      }
    } catch (err: any) {
      // Revert on error
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: currentStatus } : i))
      );
      setError(errorMessage(err));
    }
  };

  // ==========================================
  // Category Handlers
  // ==========================================
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMenuId) { setError('Create or select a menu before adding a category.'); return; }

    try {
      if (categoryFormData.id) {
        await apiClient.updateCategory(categoryFormData.id, {
          name: categoryFormData.name,
          description: categoryFormData.description,
        });
      } else {
        await apiClient.createCategory(selectedMenuId, {
          name: categoryFormData.name,
          description: categoryFormData.description,
        });
      }
      setCategoryModalOpen(false);
      loadCatalogue();
    } catch (err: any) {
      setError(errorMessage(err));
    }
  };

  const handleReorderCategory = async (catId: string, direction: 'up' | 'down') => {
    const currentIndex = categories.findIndex((c) => c.id === catId);
    if (currentIndex < 0) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const newCats = [...categories];
    const [moved] = newCats.splice(currentIndex, 1);
    newCats.splice(targetIndex, 0, moved);

    setCategories(newCats);
    try {
      await apiClient.reorderCategories(selectedMenuId, newCats.map((c) => c.id));
    } catch (err: any) {
      loadCatalogue();
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!window.confirm('Delete this category and move its items?')) return;
    try {
      await apiClient.deleteCategory(categoryId);
      loadCatalogue();
    } catch (err: any) {
      setError(errorMessage(err));
    }
  };

  // ==========================================
  // Menu Item Handlers
  // ==========================================
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMenuId) return;

    const priceMajor = parseFloat(itemFormData.price_major || '0');
    if (isNaN(priceMajor) || priceMajor < 0) {
      setError('Please enter a valid price');
      return;
    }
    const price_minor = Math.round(priceMajor * 100);

    try {
      if (itemFormData.id) {
        await apiClient.updateItem(itemFormData.id, {
          category_id: itemFormData.category_id,
          name: itemFormData.name,
          description: itemFormData.description,
          price_minor,
          sku: itemFormData.sku,
          image_url: itemFormData.image_url,
          is_available: itemFormData.is_available,
          modifier_group_ids: itemFormData.modifier_group_ids,
        });
      } else {
        await apiClient.createItem(selectedMenuId, {
          category_id: itemFormData.category_id,
          name: itemFormData.name,
          description: itemFormData.description,
          price_minor,
          sku: itemFormData.sku,
          image_url: itemFormData.image_url,
          is_available: itemFormData.is_available,
          modifier_group_ids: itemFormData.modifier_group_ids,
        });
      }
      setItemModalOpen(false);
      loadCatalogue();
    } catch (err: any) {
      setError(errorMessage(err));
    }
  };

  const handleCreateMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMenuName.trim()) {
      setAddMenuError('Menu name is required');
      return;
    }
    if (!branches.some(branch => branch.id === newMenuBranchId)) {
      setAddMenuError('Select a branch for this menu.');
      return;
    }
    setAddMenuBusy(true);
    setAddMenuError(null);
    try {
      const res = await apiClient.createMenu({ name: newMenuName.trim(), branch_ids: [newMenuBranchId] });
      setAddMenuOpen(false);
      setNewMenuName('');
      await loadCatalogue();
      const created = (res as any)?.data;
      if (created?.id) setSelectedMenuId(created.id);
    } catch (err: any) {
      setAddMenuError(errorMessage(err));
    } finally {
      setAddMenuBusy(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm('Are you sure you want to delete this menu item?')) return;
    try {
      await apiClient.deleteItem(itemId);
      loadCatalogue();
    } catch (err: any) {
      setError(errorMessage(err));
    }
  };

  // ==========================================
  // Modifier Groups & Options Handlers
  // ==========================================
  const handleSaveModifierGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (groupFormData.id) {
        await apiClient.updateModifierGroup(groupFormData.id, {
          name: groupFormData.name,
          min_selections: Number(groupFormData.min_selections),
          max_selections: Number(groupFormData.max_selections),
        });
      } else {
        await apiClient.createModifierGroup({
          name: groupFormData.name,
          min_selections: Number(groupFormData.min_selections),
          max_selections: Number(groupFormData.max_selections),
        });
      }
      setGroupModalOpen(false);
      loadCatalogue();
    } catch (err: any) {
      setError(errorMessage(err));
    }
  };

  const handleDeleteModifierGroup = async (groupId: string) => {
    if (!window.confirm('Delete this modifier group?')) return;
    try {
      await apiClient.deleteModifierGroup(groupId);
      loadCatalogue();
    } catch (err: any) {
      setError(errorMessage(err));
    }
  };

  const handleSaveModifierOption = async (e: React.FormEvent) => {
    e.preventDefault();
    const deltaMajor = parseFloat(optionFormData.price_delta_major || '0');
    const price_delta_minor = Math.round(deltaMajor * 100);

    try {
      if (optionFormData.id) {
        await apiClient.updateModifierOption(optionFormData.id, {
          name: optionFormData.name,
          price_delta_minor,
          is_available: optionFormData.is_available,
        });
      } else {
        await apiClient.createModifierOption(optionGroupId, {
          name: optionFormData.name,
          price_delta_minor,
          is_available: optionFormData.is_available,
        });
      }
      setOptionModalOpen(false);
      loadCatalogue();
    } catch (err: any) {
      setError(errorMessage(err));
    }
  };

  const handleDeleteModifierOption = async (optionId: string) => {
    try {
      await apiClient.deleteModifierOption(optionId);
      loadCatalogue();
    } catch (err: any) {
      setError(errorMessage(err));
    }
  };

  // Filter items by category
  const filteredItems = items.filter((item) => {
    if (activeCategoryId === 'ALL') return true;
    return item.category_id === activeCategoryId;
  });

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Top Controls & Navigation Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Left: Menu & Branch Scope Selector */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Menu Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Menu:</span>
            <Select
              value={selectedMenuId}
              onChange={(e) => setSelectedMenuId(e.target.value)}
              className="text-xs font-medium py-1.5 min-w-[200px]"
            >
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.is_active ? '(Active)' : '(Inactive)'}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddMenuError(null);
                setAddMenuOpen(true);
              }}
              className="text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} /> Add Menu
            </Button>
          </div>

          {/* Scope Selector: Base vs Branch Override */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Catalogue Scope:</span>
            <Select
              value={catalogueScope}
              onChange={(e) => setCatalogueScope(e.target.value)}
              className="text-xs font-medium py-1.5 min-w-[220px] bg-slate-50"
            >
              <option value="base">Menu catalogue</option>
              {branches.filter(branch => activeMenu?.assigned_branch_ids?.includes(branch.id)).map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name} (Overrides)</option>
              ))}
            </Select>
          </div>

          {catalogueScope !== 'base' && (
            <Badge variant="warning" className="text-xs flex items-center gap-1 bg-amber-50 text-amber-800 border-amber-300">
              <Building2 size={12} /> Branch Override Mode
            </Badge>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModifiersDrawerOpen(true)}
            className="text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Sliders size={14} /> Modifiers & Add-ons ({modifierGroups.length})
          </Button>

          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedMenuId}
                onClick={() => {
                  setError(null);
                  setAssignedBranches(activeMenu?.assigned_branch_ids || []);
                  setBranchAssignModalOpen(true);
                }}
                className="text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Building2 size={14} /> Branch Serving
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!selectedMenuId}
                onClick={() => {
                  setError(null);
                  setCategoryFormData({ id: '', name: '', description: '' });
                  setCategoryModalOpen(true);
                }}
                className="text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} /> Add Category
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setItemFormData({
                    id: '',
                    category_id: categories[0]?.id || '',
                    name: '',
                    description: '',
                    price_major: '850.00',
                    sku: '',
                    image_url: PRESET_FOOD_IMAGES[0].url,
                    is_available: true,
                    modifier_group_ids: modifierGroups.slice(0, 2).map((g) => g.id),
                  });
                  setItemModalOpen(true);
                }}
                className="text-xs flex items-center gap-1.5 cursor-pointer bg-brand hover:bg-[#008c44]"
              >
                <Plus size={14} /> Add Food Item
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={loadCatalogue}
            className="text-xs p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
            title="Refresh Catalogue"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800">
            Dismiss
          </button>
        </div>
      )}

      {/* Scope Advisory Banner */}
      {catalogueScope !== 'base' && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Branch-Specific Availability & Pricing:</span> You are currently editing overrides for{' '}
            <strong>{branches.find(branch => branch.id === catalogueScope)?.name || 'Selected branch'}</strong>.
            Toggling an item to &quot;Sold Out&quot; here will ONLY hide it from this specific branch without affecting any other locations.
          </div>
        </div>
      )}

      {/* Main Catalogue Grid Layout: Categories Sidebar + Items Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Categories List (3 cols) */}
        <div className="md:col-span-3 flex flex-col gap-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Categories</span>
              <span className="text-[11px] text-slate-400 font-mono">{categories.length} total</span>
            </div>

            <div className="flex flex-col gap-1">
              <button
                onClick={() => setActiveCategoryId('ALL')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-all ${
                  activeCategoryId === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>All Categories</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200/50 text-slate-700">
                  {items.length}
                </span>
              </button>

              {categories.map((cat, idx) => {
                const count = items.filter((i) => i.category_id === cat.id).length;
                const isSelected = activeCategoryId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                      isSelected ? 'bg-brand text-white shadow-xs' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      onClick={() => setActiveCategoryId(cat.id)}
                      className="flex-1 text-left font-medium truncate cursor-pointer"
                    >
                      {cat.name}
                    </button>

                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {count}
                      </span>

                      {canEdit && (
                        <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                          <button
                            onClick={() => handleReorderCategory(cat.id, 'up')}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-black/10 disabled:opacity-30 cursor-pointer"
                            title="Move Up"
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            onClick={() => handleReorderCategory(cat.id, 'down')}
                            disabled={idx === categories.length - 1}
                            className="p-1 rounded hover:bg-black/10 disabled:opacity-30 cursor-pointer"
                            title="Move Down"
                          >
                            <ArrowDown size={11} />
                          </button>
                          <button
                            onClick={() => {
                              setCategoryFormData({ id: cat.id, name: cat.name, description: cat.description || '' });
                              setCategoryModalOpen(true);
                            }}
                            className="p-1 rounded hover:bg-black/10 cursor-pointer"
                            title="Edit Category"
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1 rounded hover:bg-rose-500/20 text-rose-500 cursor-pointer"
                            title="Delete Category"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Menu Overview Card */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600">
            <span className="font-bold text-slate-800 block mb-1">Serving Branches:</span>
            <div className="flex flex-col gap-1 text-[11px]">
              {(activeMenu?.assigned_branch_ids || []).length === 0 ? (
                <span className="text-amber-600 italic">No branches assigned yet</span>
              ) : (
                activeMenu?.assigned_branch_ids.map((bId) => (
                  <div key={bId} className="flex items-center gap-1.5 text-slate-700">
                    <Check size={12} className="text-brand" />
                    <span>{branches.find(branch => branch.id === bId)?.name || 'Assigned branch'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Menu Items Showcase (9 cols) */}
        <div className="md:col-span-9 flex flex-col gap-4">
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <EmptyState
                icon={Layers}
                title="No Food Items in this Category"
                description="Click 'Add Food Item' above to add mouthwatering dishes, prices, descriptions, and modifier options."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => {
                const category = categories.find((c) => c.id === item.category_id);
                const attachedGroups = modifierGroups.filter((g) =>
                  (item.modifier_group_ids || []).includes(g.id)
                );

                // Calculate effective availability if in branch mode
                let isAvailable = item.is_available;
                let effectivePrice = item.price_minor;
                let hasBranchOverride = false;

                if (catalogueScope !== 'base' && branchCatalogueData) {
                  // Find branch item
                  for (const cat of branchCatalogueData.categories || []) {
                    const branchItem = cat.items.find((i: any) => i.id === item.id);
                    if (branchItem) {
                      isAvailable = branchItem.effective_available;
                      effectivePrice = branchItem.effective_price_minor;
                      hasBranchOverride = true;
                      break;
                    }
                  }
                }

                return (
                  <Card
                    key={item.id}
                    className={`overflow-hidden border flex flex-col justify-between transition-all ${
                      !isAvailable
                        ? 'bg-slate-50/80 border-slate-300 opacity-80'
                        : 'bg-white border-slate-200 shadow-xs hover:shadow-md'
                    }`}
                  >
                    <div>
                      {/* Food Image */}
                      <div className="relative h-40 bg-slate-100 overflow-hidden">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className={`w-full h-full object-cover transition-transform duration-300 ${
                              !isAvailable ? 'grayscale contrast-75' : 'hover:scale-105'
                            }`}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                            <ImageIcon size={32} />
                            <span className="text-[11px] mt-1">No Food Photo</span>
                          </div>
                        )}

                        {/* Status Badge Over Image */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          {isAvailable ? (
                            <Badge variant="success" className="text-[10px] shadow-sm bg-emerald-600 text-white font-bold">
                              AVAILABLE
                            </Badge>
                          ) : (
                            <Badge variant="danger" className="text-[10px] shadow-sm bg-rose-600 text-white font-bold">
                              SOLD OUT
                            </Badge>
                          )}

                          {hasBranchOverride && (
                            <Badge variant="warning" className="text-[9px] bg-amber-500 text-white">
                              BRANCH OVERRIDE
                            </Badge>
                          )}
                        </div>

                        {/* Price Badge */}
                        <div className="absolute bottom-2 right-2 bg-slate-900/90 text-white text-xs font-bold px-2.5 py-1 rounded-md backdrop-blur-xs shadow-md">
                          {formatKES(effectivePrice)}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-3.5 flex flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-sm text-slate-900 leading-snug line-clamp-1">{item.name}</h4>
                        </div>

                        {category && (
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            {category.name}
                          </span>
                        )}

                        <p className="text-xs text-slate-600 line-clamp-2 min-h-[32px]">
                          {item.description || 'No description provided.'}
                        </p>

                        {/* Modifiers Pill */}
                        {attachedGroups.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {attachedGroups.map((g) => (
                              <span
                                key={g.id}
                                className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200"
                              >
                                {g.name} ({g.min_selections}-{g.max_selections})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                      {/* Fast Toggle Button */}
                      <button
                        disabled={!canEdit}
                        onClick={() => toggleItemAvailability(item, isAvailable)}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                          isAvailable
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                        title={catalogueScope !== 'base' ? 'Toggle for this branch only' : 'Toggle for all branches'}
                      >
                        {isAvailable ? (
                          <>
                            <XCircle size={13} /> Mark Sold Out
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={13} /> Mark Available
                          </>
                        )}
                      </button>

                      {/* Edit / Delete Buttons */}
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setItemFormData({
                                id: item.id,
                                category_id: item.category_id,
                                name: item.name,
                                description: item.description || '',
                                price_major: (item.price_minor / 100).toFixed(2),
                                sku: item.sku || '',
                                image_url: item.image_url || '',
                                is_available: item.is_available,
                                modifier_group_ids: item.modifier_group_ids || [],
                              });
                              setItemModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-200 cursor-pointer"
                            title="Edit Item"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-100 cursor-pointer"
                            title="Delete Item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ==========================================
          MODAL: Add / Edit Menu Item
      ========================================== */}
      <Modal
        isOpen={addMenuOpen}
        onClose={() => setAddMenuOpen(false)}
        title="Add Menu"
      >
        <form onSubmit={handleCreateMenu} className="space-y-4">
          <FormField label="Menu Name" required>
            <Input
              type="text"
              value={newMenuName}
              onChange={(e) => setNewMenuName(e.target.value)}
              placeholder="e.g., Weekend Brunch Menu"
              required
            />
          </FormField>
          <FormField label="Serving branch" required>
            <Select value={newMenuBranchId} onChange={e => setNewMenuBranchId(e.target.value)} required>
              <option value="">Select a branch</option>
              {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </FormField>

          {addMenuError && <p role="alert" className="text-rose-700 text-xs">{addMenuError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAddMenuOpen(false)} disabled={addMenuBusy}>
              Cancel
            </Button>
            <Button type="submit" disabled={addMenuBusy}>
              {addMenuBusy ? 'Creating...' : 'Create menu'}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        isOpen={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={itemFormData.id ? 'Edit Menu Item' : 'Add Food Item to Catalogue'}
        size="lg"
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Item Name" required>
              <Input
                type="text"
                value={itemFormData.name}
                onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                placeholder="e.g., Truffle Glazed Double Smash"
                required
              />
            </FormField>

            <FormField label="Category" required>
              <Select
                value={itemFormData.category_id}
                onChange={(e) => setItemFormData({ ...itemFormData, category_id: e.target.value })}
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Item Description">
            <textarea
              value={itemFormData.description}
              onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
              placeholder="Crispy prime beef patties, aged cheddar, caramelized onions, house truffle mayo on toasted brioche..."
              className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand"
              rows={3}
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Price in KES (Strict Minor Units)" required>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">KES</span>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={itemFormData.price_major}
                  onChange={(e) => setItemFormData({ ...itemFormData, price_major: e.target.value })}
                  className="pl-12 font-bold"
                  required
                />
              </div>
            </FormField>

            <FormField label="SKU / Barcode">
              <Input
                type="text"
                value={itemFormData.sku}
                onChange={(e) => setItemFormData({ ...itemFormData, sku: e.target.value })}
                placeholder="e.g. BURG-001"
              />
            </FormField>

            <FormField label="Base Stock Status">
              <Select
                value={itemFormData.is_available ? 'true' : 'false'}
                onChange={(e) => setItemFormData({ ...itemFormData, is_available: e.target.value === 'true' })}
              >
                <option value="true">In Stock & Ready</option>
                <option value="false">Sold Out</option>
              </Select>
            </FormField>
          </div>

          {/* Food Image Selection */}
          <FormField label="Food Image URL / Presets">
            <Input
              type="text"
              value={itemFormData.image_url}
              onChange={(e) => setItemFormData({ ...itemFormData, image_url: e.target.value })}
              placeholder="https://..."
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-400">Quick Food Presets:</span>
              {PRESET_FOOD_IMAGES.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setItemFormData({ ...itemFormData, image_url: p.url })}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </FormField>

          {/* Modifier Groups Attachment */}
          <div className="border-t border-slate-200 pt-3">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Attach Modifier Groups (Options & Add-ons):
            </label>
            {modifierGroups.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                No modifier groups created yet. Open &quot;Modifiers & Add-ons&quot; to define bun choices, toppings, etc.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modifierGroups.map((g) => {
                  const checked = itemFormData.modifier_group_ids.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        checked ? 'bg-emerald-50/60 border-emerald-300 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setItemFormData({
                              ...itemFormData,
                              modifier_group_ids: [...itemFormData.modifier_group_ids, g.id],
                            });
                          } else {
                            setItemFormData({
                              ...itemFormData,
                              modifier_group_ids: itemFormData.modifier_group_ids.filter((id) => id !== g.id),
                            });
                          }
                        }}
                        className="mt-0.5 rounded text-brand focus:ring-brand"
                      />
                      <div>
                        <span className="font-bold block">{g.name}</span>
                        <span className="text-[10px] text-slate-500">
                          {g.is_required ? 'Required' : 'Optional'} · Min: {g.min_selections}, Max: {g.max_selections}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setItemModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" className="bg-brand hover:bg-[#008c44]">
              {itemFormData.id ? 'Save Item Changes' : 'Create Food Item'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==========================================
          MODAL: Add / Edit Category
      ========================================== */}
      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={categoryFormData.id ? 'Edit Category' : 'Create Menu Category'}
        size="md"
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <FormField label="Category Name" required>
            <Input
              type="text"
              value={categoryFormData.name}
              onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
              placeholder="e.g. Gourmet Burgers, Loaded Fries, Desserts"
              required
            />
          </FormField>

          <FormField label="Category Description">
            <Input
              type="text"
              value={categoryFormData.description}
              onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
              placeholder="Optional summary shown to diners"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setCategoryModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" className="bg-brand hover:bg-[#008c44]">
              Save Category
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==========================================
          MODAL: Modifier Groups & Options Drawer
      ========================================== */}
      <Modal
        isOpen={modifiersDrawerOpen}
        onClose={() => setModifiersDrawerOpen(false)}
        title="Modifier Groups & Options Configuration"
        size="lg"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Customization & Add-on Groups</h4>
              <p className="text-[11px] text-slate-500">
                Define rules for customer selections (e.g., &quot;Choose 1 Bun&quot;, &quot;Pick up to 3 Sauces&quot;)
              </p>
            </div>
            {canEdit && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setGroupFormData({ id: '', name: '', min_selections: 0, max_selections: 1 });
                  setGroupModalOpen(true);
                }}
                className="text-xs bg-brand hover:bg-[#008c44] flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} /> New Modifier Group
              </Button>
            )}
          </div>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {modifierGroups.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">
                No modifier groups defined. Create one to allow custom burger toppings, sides, and drinks.
              </p>
            ) : (
              modifierGroups.map((group) => (
                <div key={group.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{group.name}</span>
                        {group.is_required ? (
                          <Badge variant="danger" className="text-[10px]">REQUIRED</Badge>
                        ) : (
                          <Badge variant="default" className="text-[10px]">OPTIONAL</Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Selection constraint: min {group.min_selections}, max {group.max_selections} choices
                      </span>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setOptionGroupId(group.id);
                            setOptionFormData({ id: '', name: '', price_delta_major: '0.00', is_available: true });
                            setOptionModalOpen(true);
                          }}
                          className="text-[11px] h-7 px-2 cursor-pointer flex items-center gap-1"
                        >
                          <Plus size={11} /> Add Option
                        </Button>
                        <button
                          onClick={() => {
                            setGroupFormData({
                              id: group.id,
                              name: group.name,
                              min_selections: group.min_selections,
                              max_selections: group.max_selections,
                            });
                            setGroupModalOpen(true);
                          }}
                          className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                          title="Edit Group"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteModifierGroup(group.id)}
                          className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                          title="Delete Group"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Options List */}
                  <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {(group.options || []).length === 0 ? (
                      <div className="p-3 text-[11px] text-slate-400 italic">
                        No options added yet. Click &quot;Add Option&quot; above.
                      </div>
                    ) : (
                      group.options?.map((opt) => (
                        <div key={opt.id} className="p-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{opt.name}</span>
                            {opt.price_delta_minor > 0 && (
                              <span className="text-[11px] font-mono text-emerald-600 font-semibold">
                                +{formatKES(opt.price_delta_minor)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {opt.is_available ? (
                              <span className="text-[10px] text-emerald-600 font-semibold">In Stock</span>
                            ) : (
                              <span className="text-[10px] text-rose-600 font-semibold">Unavailable</span>
                            )}

                            {canEdit && (
                              <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                                <button
                                  onClick={() => {
                                    setOptionGroupId(group.id);
                                    setOptionFormData({
                                      id: opt.id,
                                      name: opt.name,
                                      price_delta_major: (opt.price_delta_minor / 100).toFixed(2),
                                      is_available: opt.is_available,
                                    });
                                    setOptionModalOpen(true);
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-800 cursor-pointer"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  onClick={() => handleDeleteModifierOption(opt.id)}
                                  className="p-1 text-rose-400 hover:text-rose-700 cursor-pointer"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* ==========================================
          MODAL: Add / Edit Modifier Group
      ========================================== */}
      <Modal
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title={groupFormData.id ? 'Edit Modifier Group' : 'Create Modifier Group'}
        size="md"
      >
        <form onSubmit={handleSaveModifierGroup} className="space-y-4">
          <FormField label="Group Name" required>
            <Input
              type="text"
              value={groupFormData.name}
              onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
              placeholder="e.g. Choose Your Bun, Patty Doneness, Extra Toppings"
              required
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Min Selections (0 = Optional)" required>
              <Input
                type="number"
                min="0"
                value={groupFormData.min_selections}
                onChange={(e) => setGroupFormData({ ...groupFormData, min_selections: parseInt(e.target.value) || 0 })}
                required
              />
            </FormField>

            <FormField label="Max Selections" required>
              <Input
                type="number"
                min="1"
                value={groupFormData.max_selections}
                onChange={(e) => setGroupFormData({ ...groupFormData, max_selections: parseInt(e.target.value) || 1 })}
                required
              />
            </FormField>
          </div>

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600">
            <strong>Rule:</strong> If Min Selections &ge; 1, the customer will be required to pick an option before ordering.
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setGroupModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" className="bg-brand hover:bg-[#008c44]">
              Save Group
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==========================================
          MODAL: Add / Edit Modifier Option
      ========================================== */}
      <Modal
        isOpen={optionModalOpen}
        onClose={() => setOptionModalOpen(false)}
        title={optionFormData.id ? 'Edit Modifier Option' : 'Add Modifier Option'}
        size="md"
      >
        <form onSubmit={handleSaveModifierOption} className="space-y-4">
          <FormField label="Option Name" required>
            <Input
              type="text"
              value={optionFormData.name}
              onChange={(e) => setOptionFormData({ ...optionFormData, name: e.target.value })}
              placeholder="e.g. Toasted Brioche Bun, Extra Melted Cheddar (+100 KES)"
              required
            />
          </FormField>

          <FormField label="Price Delta in KES (0 for free option)" required>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">KES +</span>
              <Input
                type="number"
                step="1"
                min="0"
                value={optionFormData.price_delta_major}
                onChange={(e) => setOptionFormData({ ...optionFormData, price_delta_major: e.target.value })}
                className="pl-14 font-bold"
                required
              />
            </div>
          </FormField>

          <FormField label="Stock Availability">
            <Select
              value={optionFormData.is_available ? 'true' : 'false'}
              onChange={(e) => setOptionFormData({ ...optionFormData, is_available: e.target.value === 'true' })}
            >
              <option value="true">In Stock & Selectable</option>
              <option value="false">Unavailable</option>
            </Select>
          </FormField>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setOptionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" className="bg-brand hover:bg-[#008c44]">
              Save Option
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==========================================
          MODAL: Branch Assignment
      ========================================== */}
      <Modal
        isOpen={branchAssignModalOpen}
        onClose={() => setBranchAssignModalOpen(false)}
        title="Select the Branch Serving This Menu"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Each menu belongs to one branch. Select the branch that serves this menu.
          </p>

          <div className="space-y-2">
            {branches.map((b) => {
              const isChecked = assignedBranches.includes(b.id);
              return (
                <label
                  key={b.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-xs cursor-pointer ${
                    isChecked ? 'bg-emerald-50/50 border-emerald-300 font-semibold' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="menu-serving-branch"
                    checked={isChecked}
                    onChange={() => setAssignedBranches([b.id])}
                    className="rounded text-brand focus:ring-brand"
                  />
                  <span>{b.name}</span>
                </label>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setBranchAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={assignedBranches.length !== 1}
              onClick={async () => {
                try {
                  await apiClient.assignMenuBranches(selectedMenuId, assignedBranches);
                  setBranchAssignModalOpen(false);
                  loadCatalogue();
                } catch (err: any) {
                  setError(errorMessage(err));
                }
              }}
              className="bg-brand hover:bg-[#008c44]"
            >
              Save Serving Branch
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
