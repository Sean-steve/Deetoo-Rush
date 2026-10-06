import { AccountSupport } from "../../../packages/ui/src/AccountSupport";
/**
 * DEETOO - Customer Application Shell
 * Customer-facing food discovery, identity, addresses, and serviceability (Sprint 5)
 * Compliant with DEE-PRD-001, DEE-SEC-001 & PostGIS spatial delivery matching
 */

import { CustomerJourney } from "./components/CustomerJourney";
import {
  errorMessage,
  Navigation,
  NotificationInbox,
  useResource,
} from "../../../packages/ui/src/workflows";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  DeetooLogo,
  Button,
  Card,
  Badge,
  Input,
  Spinner,
  EmptyState,
  ErrorState,
  ErrorBoundary,
  Modal,
  FormField,
} from "../../../packages/ui/src/index";
import { AuthProvider, useAuth } from "../../../packages/auth/src/react";
import {
  MapPin,
  Search,
  ShoppingBag,
  UtensilsCrossed,
  User,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Key,
  Smartphone,
  Mail,
  History,
  Lock,
  RefreshCw,
  Star,
  ChevronRight,
  Clock,
  Filter,
  SlidersHorizontal,
  Compass,
  X,
  Bell,
} from "lucide-react";

import {
  CustomerAddress,
  PublicRestaurantBranch,
  RestaurantCategory,
  ServiceabilityCheckResult,
} from "@deetoo/types";

import { CustomerMenuViewer } from "./components/CustomerMenuViewer";
import { CustomerLocationSelector } from "./components/CustomerLocationSelector";
import { CustomerAddressModal } from "./components/CustomerAddressModal";
import { CustomerProfileManager } from "./components/CustomerProfileManager";
import { RestaurantCard } from "./components/RestaurantCard";
import { getBrowserCurrentLocation } from "../../../packages/ui-web/src/geolocation";

type CustomerTab = "discovery" | "cart" | "orders" | "profile" | "security" | "notifications" | "support";
const customerTabPath:Record<CustomerTab,string>={
  discovery:"/customer",
  cart:"/customer/cart",
  orders:"/customer/orders",
  profile:"/customer/profile",
  security:"/customer/security",
  notifications:"/customer/notifications",
  support:"/customer/support",
};
function customerTabFromPath():CustomerTab{
  const path=window.location.pathname.replace(/\/+$/,"");
  if(path.endsWith("/cart"))return "cart";
  if(path.endsWith("/orders"))return "orders";
  if(path.endsWith("/profile"))return "profile";
  if(path.endsWith("/security"))return "security";
  if(path.endsWith("/notifications"))return "notifications";
  if(path.endsWith("/support"))return "support";
  return "discovery";
}

export function CustomerApp() {
  return (
    <AuthProvider clientApp="customer">
      <CustomerAppInner />
    </AuthProvider>
  );
}

function CustomerAppInner() {
  const {
    user,
    isAuthenticated,
    isLoading,
    login,
    registerCustomer,
    logout,
    forgotPassword,
    resetPassword,
    requestOtp,
    confirmOtp,
    apiClient,
  } = useAuth();

  // Navigation tab state
  const [activeTab, setActiveTabState] = useState<CustomerTab>(()=>customerTabFromPath());
  const setActiveTab = useCallback((tab:CustomerTab)=>{
    setActiveTabState(tab);
    const next=customerTabPath[tab];
    if(window.location.pathname!==next)window.history.pushState({}, "", next);
  },[]);
  useEffect(()=>{
    const sync=()=>setActiveTabState(customerTabFromPath());
    window.addEventListener("popstate",sync);
    return()=>window.removeEventListener("popstate",sync);
  },[]);

  const cartSummary = useResource<any>(isAuthenticated ? "/cart" : null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Location & Serviceability state (Sprint 5)
  const [customerLocation, setCustomerLocation] = useState<{
    address: string;
    latitude: number;
    longitude: number;
  }>({
    address: "Choose delivery location",
    latitude: 0,
    longitude: 0,
  });
  const [hasDeliveryLocation, setHasDeliveryLocation] = useState(false);
  const [isLocatingCustomer, setIsLocatingCustomer] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [serviceability, setServiceability] =
    useState<ServiceabilityCheckResult | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  // Discovery state (Sprint 5)
  const [categories, setCategories] = useState<RestaurantCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [sortOption, setSortOption] = useState<
    "recommended" | "distance" | "open_now"
  >("recommended");
  const [restaurants, setRestaurants] = useState<PublicRestaurantBranch[]>([]);
  const [isLoadingRestaurants, setIsLoadingRestaurants] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Auth Modals State
  const [authModalMode, setAuthModalMode] = useState<
    "login" | "register" | "forgot" | "reset" | "otp" | null
  >(null);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Register Form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");

  // Forgot / Reset
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");

  // Phone OTP
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // Sessions list
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const handleUseCurrentLocation = useCallback(async () => {
    setIsLocatingCustomer(true);
    setLocationError(null);
    try {
      const coords = await getBrowserCurrentLocation();
      let address = "Current location";
      try {
        const reverse = await apiClient.reverseGeocode(
          coords.latitude,
          coords.longitude,
        );
        if (reverse.data?.formatted_address) {
          address = reverse.data.formatted_address;
        }
      } catch {
        // Coordinates remain authoritative even when reverse geocoding is unavailable.
      }
      setCustomerLocation({
        address,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      setHasDeliveryLocation(true);
    } catch (error) {
      setLocationError(errorMessage(error));
    } finally {
      setIsLocatingCustomer(false);
    }
  }, [apiClient]);

  // 1. Initial load of categories and current device location
  useEffect(() => {
    loadCategories();
    void handleUseCurrentLocation();
  }, [handleUseCurrentLocation]);

  useEffect(() => {
    if (isAuthenticated) {
      loadSavedAddresses();
    } else {
      setSavedAddresses([]);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated && ["profile", "security", "support"].includes(activeTab)) {
      setActiveTab("discovery");
    }
  }, [isAuthenticated, activeTab, setActiveTab]);

  // 2. Load serviceability whenever location coordinates change
  useEffect(() => {
    if (!hasDeliveryLocation) {
      setServiceability(null);
      return;
    }
    checkServiceability(customerLocation.latitude, customerLocation.longitude);
  }, [hasDeliveryLocation, customerLocation.latitude, customerLocation.longitude]);

  // 3. Discover restaurants whenever location, category, search, or filters change
  useEffect(() => {
    if (!hasDeliveryLocation) {
      setRestaurants([]);
      setIsLoadingRestaurants(false);
      return;
    }
    const timer = setTimeout(() => {
      loadRestaurants();
    }, 150);
    return () => clearTimeout(timer);
  }, [
    hasDeliveryLocation,
    customerLocation.latitude,
    customerLocation.longitude,
    selectedCategory,
    searchQuery,
    openNowOnly,
    sortOption,
  ]);

  useEffect(() => {
    if (isAuthenticated && activeTab === "security") {
      loadSessions();
    }
  }, [isAuthenticated, activeTab]);

  const loadCategories = async () => {
    try {
      const res = await apiClient.getRestaurantCategories();
      setCategories(res.data || []);
    } catch {
      // Fallback
    }
  };

  const loadSavedAddresses = async () => {
    try {
      const res = await apiClient.getCustomerAddresses();
      const addrs = res.data || [];
      setSavedAddresses(addrs);

      // Current device GPS is the default discovery location.
      // Saved addresses remain explicit user-selected delivery overrides.
    } catch {
      // ignore
    }
  };

  const serviceabilityRequest = useRef(0);
  const checkServiceability = async (lat: number, lng: number) => {
    const request = ++serviceabilityRequest.current;
    setServiceability(null);
    try {
      const res = await apiClient.checkServiceability(lat, lng);
      if (request === serviceabilityRequest.current) setServiceability(res.data);
    } catch {
      if (request === serviceabilityRequest.current) setServiceability(null);
    }
  };

  const discoveryRequest = useRef(0);
  const loadRestaurants = async () => {
    if (!hasDeliveryLocation) {
      setRestaurants([]);
      setIsLoadingRestaurants(false);
      return;
    }
    const request = ++discoveryRequest.current;
    setDiscoveryError(null);
    setIsLoadingRestaurants(true);
    setRestaurants([]);
    try {
      const res = await apiClient.discoverRestaurants({
        latitude: customerLocation.latitude,
        longitude: customerLocation.longitude,
        search: searchQuery.trim() || undefined,
        category: selectedCategory || undefined,
        open_now: openNowOnly ? true : undefined,
        sort: sortOption,
        page: 1,
        limit: 20,
      });
      if (request === discoveryRequest.current) setRestaurants(res.data || []);
    } catch (err: any) {
      if (request === discoveryRequest.current)
        setDiscoveryError(errorMessage(err));
      console.error("Failed to discover restaurants:", err);
    } finally {
      if (request === discoveryRequest.current) setIsLoadingRestaurants(false);
    }
  };

  const handleSelectAddress = (addr: CustomerAddress) => {
    setHasDeliveryLocation(true);
    setCustomerLocation({
      address: `${addr.label}: ${addr.address_line1}`,
      latitude: addr.latitude,
      longitude: addr.longitude,
    });
  };

  const handleAddressSaved = (saved: CustomerAddress) => {
    setSavedAddresses([saved, ...savedAddresses]);
    if (saved.is_default || savedAddresses.length === 0) {
      setHasDeliveryLocation(true);
      setCustomerLocation({
        address: saved.address_line1,
        latitude: saved.latitude,
        longitude: saved.longitude,
      });
    }
  };

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await apiClient.listSessions();
      setSessions(res.data || []);
    } catch {
      // ignore
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const res = await login(loginIdentifier, loginPassword);
      setAuthSuccessMsg(`Welcome back, ${res.name || res.email}!`);
      setAuthModalMode(null);
      setTimeout(() => setAuthSuccessMsg(null), 4000);
      loadSavedAddresses();
    } catch (err: any) {
      setAuthError(err.message || "Login failed. Verify credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const res = await registerCustomer({
        name: regName,
        email: regEmail || undefined,
        phone_e164: regPhone || undefined,
        password: regPassword,
      });
      setAuthSuccessMsg(`Account created successfully! Welcome, ${res.name}.`);
      setAuthModalMode(null);
      setTimeout(() => setAuthSuccessMsg(null), 4000);
    } catch (err: any) {
      setAuthError(
        err.message || "Registration failed. Check required fields.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const res = await forgotPassword(forgotIdentifier);
      setAuthSuccessMsg(res.message);
      if (res.dev_token) {
        setResetToken(res.dev_token);
        setAuthModalMode("reset");
      } else {
        setResetToken("");
        setAuthModalMode("reset");
      }
    } catch (err: any) {
      setAuthError(err.message || "Forgot password failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const res = await resetPassword({
        token: resetToken,
        new_password: resetNewPassword,
      });
      setAuthSuccessMsg(res.message);
      setAuthModalMode("login");
      setLoginPassword(resetNewPassword);
    } catch (err: any) {
      setAuthError(err.message || "Password reset failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendOtp = async () => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const res = await requestOtp(otpPhone);
      setAuthSuccessMsg(res.message);
      if (res.dev_otp) {
        setOtpCode(res.dev_otp);
      }
    } catch (err: any) {
      setAuthError(err.message || "Failed to send OTP");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const res = await confirmOtp(otpPhone, otpCode);
      setAuthSuccessMsg(res.message);
      setAuthModalMode(null);
    } catch (err: any) {
      setAuthError(err.message || "Verification failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiClient.revokeSession(sessionId);
      await loadSessions();
    } catch (err: any) {
      alert(err.message || "Failed to revoke session");
    }
  };

  const handleRevokeAllSessions = async () => {
    if (
      !confirm(
        "Are you sure you want to terminate all active sessions? You will be logged out.",
      )
    )
      return;
    try {
      await apiClient.revokeAllSessions();
      await logout();
    } catch (err: any) {
      alert(err.message || "Failed to revoke sessions");
    }
  };

  return (
    <ErrorBoundary fallbackTitle="Customer Application Error Boundary">
      <div className="customer-shell min-h-screen bg-canvas text-ink flex flex-col font-sans">
        {/* Top Navbar */}
        <header className="customer-topbar sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs px-4 py-3 sm:px-6">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <DeetooLogo className="h-7" />
            </div>

            {/* Address bar with PostGIS Location Selector */}
            <CustomerLocationSelector
              currentAddressText={customerLocation.address}
              currentCoords={
                hasDeliveryLocation
                  ? {
                      latitude: customerLocation.latitude,
                      longitude: customerLocation.longitude,
                    }
                  : undefined
              }
              savedAddresses={savedAddresses}
              serviceability={serviceability}
              onSelectAddress={handleSelectAddress}
              onUseCurrentLocation={() => void handleUseCurrentLocation()}
              onAddNewAddress={() => setIsAddressModalOpen(true)}
              isAuthenticated={isAuthenticated}
              isLocating={isLocatingCustomer}
              locationError={locationError}
            />

            {/* Authentication Bar & Navigation */}
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant={activeTab === "profile" ? "primary" : "outline"}
                    size="sm"
                    onClick={() =>
                      setActiveTab(
                        activeTab === "profile" ? "discovery" : "profile",
                      )
                    }
                    className="gap-1.5 text-xs font-semibold cursor-pointer"
                  >
                    <User size={14} />
                    <span className="max-w-[100px] truncate">
                      {user?.name || user?.email?.split("@")[0] || "Customer"}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={logout}
                    className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer"
                    title="Sign Out"
                  >
                    <LogOut size={14} />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAuthError(null);
                      setAuthModalMode("login");
                    }}
                    className="text-xs cursor-pointer"
                  >
                    Sign In
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setAuthError(null);
                      setAuthModalMode("register");
                    }}
                    className="text-xs cursor-pointer"
                  >
                    Register
                  </Button>
                </div>
              )}

              <Button
                variant={activeTab === "cart" ? "primary" : "outline"}
                size="sm"
                onClick={() =>
                  setActiveTab(activeTab === "cart" ? "discovery" : "cart")
                }
                className="relative"
              >
                <ShoppingBag size={15} className="mr-1.5" />
                Cart
                <span className="ml-1.5">
                  {cartSummary.data?.total_quantity ?? ""}
                </span>
              </Button>
            </div>
          </div>
        </header>

        {/* Global Alert Notification */}
        {authSuccessMsg && (
          <div className="bg-emerald-600 text-white text-xs py-2 px-4 text-center font-medium shadow-xs">
            ✓ {authSuccessMsg}
          </div>
        )}

        <div className="hidden sm:block max-w-6xl mx-auto w-full px-4 py-3">
          <Navigation
            active={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
            items={[
              { id: "discovery", label: "Discover", icon: <Search size={15}/> },
              { id: "cart", label: "Your bag", icon: <ShoppingBag size={15}/> },
              { id: "orders", label: "Orders & tracking", icon: <History size={15}/> },
              ...(isAuthenticated
                ? [
                    { id: "profile", label: "Profile & addresses", icon: <User size={15}/> },
                    { id: "security", label: "Security", icon: <ShieldCheck size={15}/> },
                    { id: "notifications", label: "Updates", icon: <Bell size={15}/> },
                    { id: "support", label: "Support", icon: <Mail size={15}/> },
                  ]
                : []),
            ]}
          />
        </div>

        {/* Main Content Area */}
        <main className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex-1 flex flex-col gap-6">
          {/* TAB 1: Discovery */}
          {activeTab === "discovery" && (
            <>
              {/* If user has clicked into a restaurant, show the menu viewer with back button */}
              {selectedBranchId ? (
                <CustomerMenuViewer
                  branchId={selectedBranchId}
                  onBackToBranches={() => setSelectedBranchId(null)}
                  onCartChanged={cartSummary.refresh}
                  onSignIn={() => setAuthModalMode("login")}
                />
              ) : (
                <div className="space-y-5">
                  <section className="customer-hero">
                    <p className="uppercase text-xs tracking-wider">
                      Deetoo · Nairobi kitchens
                    </p>
                    <h1>Good food. At your door.</h1>
                    <p>
                      Explore nearby kitchens, find your next craving, and make
                      it yours.
                    </p>
                  </section>
                  {discoveryError && (
                    <ErrorState
                      message={discoveryError}
                      onRetry={() => {
                        if (hasDeliveryLocation) {
                          void checkServiceability(customerLocation.latitude, customerLocation.longitude);
                          void loadRestaurants();
                        }
                      }}
                    />
                  )}
                  {/* Outside Service Zone Warning if PostGIS returns outside */}
                  {serviceability && !serviceability.serviceable && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900">
                      <AlertTriangle
                        size={18}
                        className="text-amber-600 shrink-0 mt-0.5"
                      />
                      <div>
                        <h4 className="font-bold text-xs">
                          Outside Delivery Service Area
                        </h4>
                        <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                          Your selected location is outside Deetoo's active
                          Nairobi delivery zones. You can still browse menus,
                          but ordering is currently limited to verified
                          serviceable zones.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Search and Filter Controls */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search
                          size={16}
                          className="absolute left-3.5 top-3 text-slate-400"
                        />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search restaurants, cuisines, or dishes (e.g. Burger, Pizza, Smash)..."
                          className="pl-9 pr-8"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setOpenNowOnly(!openNowOnly)}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                            openNowOnly
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <Clock size={13} />
                          <span>Open Now</span>
                        </button>

                        <select
                          value={sortOption}
                          onChange={(e: any) => setSortOption(e.target.value)}
                          className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                        >
                          <option value="recommended">Sort: Recommended</option>
                          <option value="distance">Sort: Nearest First</option>
                          <option value="open_now">Sort: Open Stores</option>
                        </select>
                      </div>
                    </div>

                    {/* Cuisine & Category Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(null)}
                        className={`px-3 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all cursor-pointer ${
                          selectedCategory === null
                            ? "bg-slate-900 text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        All Cuisines
                      </button>

                      {categories.map((cat) => {
                        const isSelected = selectedCategory === cat.slug;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() =>
                              setSelectedCategory(isSelected ? null : cat.slug)
                            }
                            className={`px-3 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            <span>{cat.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Restaurants Grid Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        <span>Restaurants Delivering Near You</span>
                        <Badge
                          variant="default"
                          className="text-[11px] font-bold"
                        >
                          {isLoadingRestaurants || discoveryError ? "—" : restaurants.length}
                        </Badge>
                      </h2>
                      <p className="text-xs text-slate-500">
                        {serviceability?.zone_name
                          ? `In ${serviceability.zone_name} Delivery Zone · Real-time operational availability`
                          : "Discover open branches and artisanal kitchens in Nairobi"}
                      </p>
                    </div>

                    {isLoadingRestaurants && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                        <Spinner size="sm" />
                        <span>Updating feed...</span>
                      </div>
                    )}
                  </div>

                  {/* Restaurants List / Grid */}
                  {isLoadingRestaurants && restaurants.length === 0 ? (
                    <div className="py-16 flex flex-col items-center justify-center gap-2">
                      <Spinner size="md" />
                      <p className="text-xs text-slate-500">
                        Discovering serviceable restaurants in Nairobi...
                      </p>
                    </div>
                  ) : discoveryError ? null : restaurants.length === 0 ? (
                    <Card className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
                      <UtensilsCrossed
                        size={36}
                        className="mx-auto text-slate-300 mb-2"
                      />
                      <h3 className="font-bold text-sm text-slate-800">
                        No restaurants found
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        We couldn't find any restaurants matching your current
                        location or filters. Try switching areas or clearing the
                        search query.
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        {selectedCategory && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCategory(null)}
                          >
                            Clear Category Filter
                          </Button>
                        )}
                        {searchQuery && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSearchQuery("")}
                          >
                            Clear Search
                          </Button>
                        )}
                      </div>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {restaurants.map((restaurant) => (
                        <RestaurantCard
                          key={restaurant.branch_id}
                          restaurant={restaurant}
                          onSelect={(branchId) => setSelectedBranchId(branchId)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {(activeTab === "cart" || activeTab === "orders") &&
            (isAuthenticated ? (
              <CustomerJourney
                key={activeTab}
                view={activeTab}
                addresses={savedAddresses}
                onBrowse={() => setActiveTab("discovery")}
                onAddress={() => setIsAddressModalOpen(true)}
                onCartChange={cartSummary.refresh}
              />
            ) : (
              <EmptyState
                title="Sign in to continue"
                description="Access your bag, orders and delivery updates."
                action={
                  <Button onClick={() => setAuthModalMode("login")}>
                    Sign in
                  </Button>
                }
              />
            ))}

          {activeTab === "notifications" && isAuthenticated && <NotificationInbox />}
          {activeTab === "support" && isAuthenticated && <AccountSupport />}
          {/* TAB 3: Customer Profile & Addresses (Sprint 5) */}
          {activeTab === "profile" && isAuthenticated && (
            <CustomerProfileManager
              apiClient={apiClient}
              onAddressListChanged={loadSavedAddresses}
            />
          )}

          {/* TAB 4: Active Sessions & Security */}
          {activeTab === "security" && isAuthenticated && (
            <Card className="bg-white">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <History size={16} className="text-emerald-600" /> Active
                    Device Sessions
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sessions are tracked with device fingerprints and can be
                    revoked individually or globally.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadSessions}
                    isLoading={isLoadingSessions}
                    className="gap-1.5 text-xs cursor-pointer"
                  >
                    <RefreshCw size={12} /> Refresh
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleRevokeAllSessions}
                    className="text-xs cursor-pointer"
                  >
                    Terminate All Sessions
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {sessions.length === 0 ? (
                  <div className="py-6 text-center text-slate-500">
                    No active sessions found
                  </div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className="py-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800">
                            {s.id.substring(0, 16)}...
                          </span>
                          {s.current && (
                            <Badge variant="success" className="text-[10px]">
                              Current Session
                            </Badge>
                          )}
                          {s.is_active ? (
                            <Badge
                              variant="default"
                              className="text-[10px] bg-emerald-50 text-emerald-700"
                            >
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="danger" className="text-[10px]">
                              Revoked
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-4">
                          <span>
                            IP: <strong>{s.ip_address || "127.0.0.1"}</strong>
                          </span>
                          <span>
                            Device:{" "}
                            <span className="truncate max-w-xs inline-block align-bottom">
                              {s.device_info || "Browser"}
                            </span>
                          </span>
                          <span>
                            Created:{" "}
                            {new Date(s.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div>
                        {!s.current && s.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevokeSession(s.id)}
                            className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer"
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}
        </main>

        <div className="sm:hidden customer-mobile-nav">
          <Navigation
            mobile
            active={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
            items={[
              { id: "discovery", label: "Explore", icon: <Search size={18}/> },
              { id: "cart", label: "Bag", icon: <ShoppingBag size={18}/> },
              { id: "orders", label: "Orders", icon: <History size={18}/> },
              ...(isAuthenticated
                ? [
                    { id: "profile", label: "Account", icon: <User size={18}/> },
                    { id: "notifications", label: "Updates", icon: <Bell size={18}/> },
                    { id: "support", label: "Help", icon: <Mail size={18}/> },
                  ]
                : []),
            ]}
          />
        </div>

        {/* Global Address Create Modal (Accessible from header Location Selector) */}
        {isAddressModalOpen && (
          <CustomerAddressModal
            isOpen={isAddressModalOpen}
            onClose={() => setIsAddressModalOpen(false)}
            onSaved={handleAddressSaved}
            apiClient={apiClient}
          />
        )}

        {/* ========================================== */}
        {/* Auth Modals (Login, Register, Forgot, OTP) */}
        {/* ========================================== */}

        {/* 1. Login Modal */}
        <Modal
          isOpen={authModalMode === "login"}
          onClose={() => setAuthModalMode(null)}
          title="Sign In to Deetoo Customer Account"
        >
          <form onSubmit={handleLogin} className="space-y-4">
            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle size={15} /> {authError}
              </div>
            )}

            <FormField label="Email or Phone Number (E.164)" required>
              <Input
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="customer@deetoo.ke or +254712345678"
                required
              />
            </FormField>

            <FormField label="Password" required>
              <Input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </FormField>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setAuthModalMode("forgot")}
                className="text-emerald-600 font-medium hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
              <button
                type="button"
                onClick={() => setAuthModalMode("register")}
                className="text-slate-600 font-medium hover:underline cursor-pointer"
              >
                Create Account
              </button>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full cursor-pointer"
                isLoading={isSubmitting}
              >
                Sign In
              </Button>
            </div>
          </form>
        </Modal>

        {/* 2. Register Modal */}
        <Modal
          isOpen={authModalMode === "register"}
          onClose={() => setAuthModalMode(null)}
          title="Create New Customer Account"
        >
          <form onSubmit={handleRegister} className="space-y-3">
            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle size={15} /> {authError}
              </div>
            )}

            <FormField label="Full Name" required>
              <Input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </FormField>

            <FormField label="Email Address">
              <Input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </FormField>

            <FormField label="Phone Number (E.164 format, e.g. +254712345678)">
              <Input
                type="tel"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                placeholder="+254712345678"
              />
            </FormField>

            <FormField label="Password (Min 8 characters)" required>
              <Input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
              />
            </FormField>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full cursor-pointer"
                isLoading={isSubmitting}
              >
                Complete Registration
              </Button>
            </div>

            <div className="text-center text-xs text-slate-500 pt-2">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setAuthModalMode("login")}
                className="text-emerald-600 font-bold hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </div>
          </form>
        </Modal>

        {/* 3. Forgot Password Modal */}
        <Modal
          isOpen={authModalMode === "forgot"}
          onClose={() => setAuthModalMode(null)}
          title="Reset Account Password"
        >
          <form onSubmit={handleForgotPassword} className="space-y-4">
            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs">
                {authError}
              </div>
            )}
            <p className="text-xs text-slate-600">
              Enter your email or phone number. Instructions and a reset token
              will be dispatched.
            </p>
            <FormField label="Email or Phone Number" required>
              <Input
                type="text"
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
                placeholder="customer@deetoo.ke"
                required
              />
            </FormField>
            <Button
              type="submit"
              variant="primary"
              className="w-full cursor-pointer"
              isLoading={isSubmitting}
            >
              Send Reset Token
            </Button>
          </form>
        </Modal>

        {/* 4. Reset Password Confirm Modal */}
        <Modal
          isOpen={authModalMode === "reset"}
          onClose={() => setAuthModalMode(null)}
          title="Enter New Password"
        >
          <form onSubmit={handleResetPassword} className="space-y-4">
            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs">
                {authError}
              </div>
            )}
            <FormField label="Reset Token" required>
              <Input
                type="text"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Paste token received"
                required
              />
            </FormField>
            <FormField label="New Password (Min 8 chars)" required>
              <Input
                type="password"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                placeholder="New strong password"
                minLength={8}
                required
              />
            </FormField>
            <Button
              type="submit"
              variant="primary"
              className="w-full cursor-pointer"
              isLoading={isSubmitting}
            >
              Set New Password
            </Button>
          </form>
        </Modal>

        {/* 5. Phone OTP Verification Modal */}
        <Modal
          isOpen={authModalMode === "otp"}
          onClose={() => setAuthModalMode(null)}
          title="Phone Number Verification"
        >
          <form onSubmit={handleConfirmOtp} className="space-y-4">
            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs">
                {authError}
              </div>
            )}
            <p className="text-xs text-slate-600">
              Verify your phone number with a 6-digit OTP code to enable SMS
              delivery dispatch updates.
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <FormField label="Phone Number (E.164)" required>
                  <Input
                    type="tel"
                    value={otpPhone}
                    onChange={(e) => setOtpPhone(e.target.value)}
                    placeholder="+254712345678"
                    required
                  />
                </FormField>
              </div>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleSendOtp}
                isLoading={isSubmitting}
                className="cursor-pointer"
              >
                Send Code
              </Button>
            </div>

            <FormField label="6-Digit Verification Code" required>
              <Input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                required
              />
            </FormField>

            <Button
              type="submit"
              variant="primary"
              className="w-full cursor-pointer"
              isLoading={isSubmitting}
            >
              Confirm Verification
            </Button>
          </form>
        </Modal>
      </div>
    </ErrorBoundary>
  );
}
