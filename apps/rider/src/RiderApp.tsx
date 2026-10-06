import { AccountSupport } from "../../../packages/ui/src/AccountSupport";
import { RiderRun, RiderEarnings } from "./components/RiderRun";
import { RiderWalletPanel, RiderPerformancePanel } from "./components/RiderWallet";
import {
  Navigation as AppNavigation,
  NotificationInbox,
  errorMessage,
} from "../../../packages/ui/src/workflows";
/**
 * DEETOO - Rider Application Shell (Sprint 8)
 * Authoritative Courier application with operational eligibility, onboarding, vehicle configuration,
 * availability lifecycle (Go Online/Offline), and GPS location ingestion.
 * Compliant with Sprint 8 requirements, ADR-005, and DEE-DSP-001.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  DeetooLogo,
  Button,
  Card,
  Badge,
  EmptyState,
  ErrorBoundary,
  Spinner,
  FormField,
  Input,
} from "../../../packages/ui/src/index";
import { AuthProvider, useAuth } from "../../../packages/auth/src/react";
import {
  RiderProfile,
  RiderVehicle,
  RiderAvailabilitySession,
  RiderOnboardingStatus,
  RiderOperationalStatus,
  RiderWorkStatus,
  VehicleType,
  VehicleStatus,
  UserRole,
} from "../../../packages/types/src/index";
import {
  Bike,
  Navigation,
  ShieldCheck,
  ShieldAlert,
  Power,
  Radio,
  RefreshCw,
  LogOut,
  Lock,
  AlertTriangle,
  History,
  Phone,
  User,
  CheckCircle2,
  XCircle,
  Clock,
  Car,
  MapPin,
  Send,
  AlertCircle,
} from "lucide-react";

export function RiderApp() {
  return (
    <AuthProvider clientApp="rider">
      <RiderAppInner />
    </AuthProvider>
  );
}

function RiderAppInner() {
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    login,
    logout,
    hasRole,
    apiClient,
  } = useAuth();

  // Primary Domain State (authoritative from backend)
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [vehicle, setVehicle] = useState<RiderVehicle | null>(null);
  const [activeSession, setActiveSession] =
    useState<RiderAvailabilitySession | null>(null);
  const [eligibility, setEligibility] = useState<{
    eligible: boolean;
    reasons: string[];
  }>({
    eligible: false,
    reasons: [],
  });
  const [assignedZones, setAssignedZones] = useState<any[]>([]);
  const [locationFreshness, setLocationFreshness] = useState<{
    lastLocationAgeSeconds?: number;
    isStale: boolean;
  }>({ isStale: true });

  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // GPS Telemetry State
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: 0,
    lng: 0,
  });
  const [gpsAcquiredAt, setGpsAcquiredAt] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(10);
  const [isPublishingGps, setIsPublishingGps] = useState<boolean>(false);
  const [gpsWatchId, setGpsWatchId] = useState<number | null>(null);
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string>(
    "Waiting for browser GPS",
  );

  // Navigation tab
  const [activeTab, setActiveTab] = useState<
    | "run"
    | "earnings"
    | "wallet"
    | "performance"
    | "availability"
    | "vehicle"
    | "profile"
    | "notifications"
    | "support"
    | "sessions"
  >("run");

  // Sessions History
  const [sessions, setSessions] = useState<RiderAvailabilitySession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Profile Edit / Submit Onboarding
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSubmittingOnboarding, setIsSubmittingOnboarding] = useState(false);
  const [profileActionMessage, setProfileActionMessage] = useState<
    string | null
  >(null);

  // Vehicle Edit
  const [editVehicleType, setEditVehicleType] = useState<VehicleType>(
    VehicleType.MOTORBIKE,
  );
  const [editVehicleReg, setEditVehicleReg] = useState("");
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [vehicleActionMessage, setVehicleActionMessage] = useState<
    string | null
  >(null);

  // Online / Offline transition loader
  const [isTogglingAvailability, setIsTogglingAvailability] = useState(false);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  const isRiderAuthorized = hasRole(UserRole.RIDER) || hasRole(UserRole.ADMIN);

  // ============================================================================
  // Data Fetching & Synchronization
  // ============================================================================

  const fetchRiderStatus = useCallback(async () => {
    if (!isAuthenticated || !isRiderAuthorized) return;
    setIsLoadingStatus(true);
    setStatusError(null);
    try {
      const res = await apiClient.request<any>("/rider/status");
      if (res.data) {
        setProfile(res.data.profile);
        setVehicle(res.data.vehicle);
        setActiveSession(res.data.activeSession);
        setEligibility(
          res.data.eligibility || { eligible: false, reasons: [] },
        );
        setAssignedZones(res.data.assignedZones || []);
        setLocationFreshness(res.data.locationFreshness || { isStale: true });

        // populate edit fields
        setEditFirstName(res.data.profile.firstName || "");
        setEditLastName(res.data.profile.lastName || "");
        setEditPhone(res.data.profile.phone || "");

        if (res.data.vehicle) {
          setEditVehicleType(res.data.vehicle.type);
          setEditVehicleReg(res.data.vehicle.registrationNumber || "");
        }

        if (
          res.data.profile.lastKnownLatitude &&
          res.data.profile.lastKnownLongitude
        ) {
          setCoords({
            lat: res.data.profile.lastKnownLatitude,
            lng: res.data.profile.lastKnownLongitude,
          });
        }
      }
    } catch (err: any) {
      setStatusError(
        err.error?.message ||
          err.message ||
          "Failed to load rider operational status",
      );
    } finally {
      setIsLoadingStatus(false);
    }
  }, [apiClient, isAuthenticated, isRiderAuthorized]);

  const fetchSessions = useCallback(async () => {
    if (!isAuthenticated || !isRiderAuthorized) return;
    setIsLoadingSessions(true);
    try {
      const res =
        await apiClient.request<RiderAvailabilitySession[]>("/rider/sessions");
      if (res.data) {
        setSessions(res.data);
      }
    } catch {
      // best-effort
    } finally {
      setIsLoadingSessions(false);
    }
  }, [apiClient, isAuthenticated, isRiderAuthorized]);

  useEffect(() => {
    if (isAuthenticated && isRiderAuthorized) {
      fetchRiderStatus();
    }
  }, [isAuthenticated, isRiderAuthorized, fetchRiderStatus]);

  // ============================================================================
  // GPS Location Tracking & Ingestion
  // ============================================================================

  // Ingest location to backend
  const publishLocation = useCallback(
    async (lat: number, lng: number, accuracy: number) => {
      if (!isAuthenticated || !profile) return;
      setIsPublishingGps(true);
      try {
        const res = await apiClient.request<any>("/rider/location", {
          method: "POST",
          body: JSON.stringify({
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
            accuracy_meters: Number(accuracy.toFixed(1)),
          }),
        });

        if (res.data) {
          // update local work status if backend updated it (e.g. from degraded GPS)
          if (res.data.workStatus && profile) {
            setProfile((prev) =>
              prev ? { ...prev, workStatus: res.data.workStatus } : null,
            );
          }
          setLocationFreshness({
            lastLocationAgeSeconds: 0,
            isStale: false,
          });
        }
      } catch (err: any) {
        console.warn("Rider location update failed", err.message);
      } finally {
        setIsPublishingGps(false);
      }
    },
    [apiClient, isAuthenticated, profile],
  );

  // Keep the timer stable while watchPosition produces new fixes.
  const gpsHeartbeat = useRef({
    profile,
    coords,
    gpsAccuracy,
    gpsAcquiredAt,
    publishLocation,
  });
  gpsHeartbeat.current = {
    profile,
    coords,
    gpsAccuracy,
    gpsAcquiredAt,
    publishLocation,
  };
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = window.setInterval(() => {
      const state = gpsHeartbeat.current;
      if (
        state.profile &&
        state.profile.workStatus !== RiderWorkStatus.OFFLINE &&
        state.gpsAcquiredAt &&
        Date.now() - state.gpsAcquiredAt < 30000
      )
        void state.publishLocation(
          state.coords.lat,
          state.coords.lng,
          state.gpsAccuracy,
        );
    }, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const reportGpsError = (error: GeolocationPositionError) => {
    setGpsAcquiredAt(null);
    const messages: Record<number, string> = {
      1: 'Location access is blocked. Allow location for this site in your browser settings, then select Retry location.',
      2: 'This browser could not determine your location. Open the Rider page in a location-enabled browser or phone, then retry.',
      3: 'Location request timed out. Check your device location service, then select Retry location.',
    };
    setGpsStatusMessage(messages[error.code] || 'Location is unavailable. Check your device location settings, then retry.');
  };
  const acquireGps = (pos: GeolocationPosition) => {
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    setGpsAccuracy(pos.coords.accuracy);
    setGpsAcquiredAt(Date.now());
    setGpsStatusMessage("Browser GPS acquired");
  };
  useEffect(() => {
    if (!isAuthenticated || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      acquireGps,
      reportGpsError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [isAuthenticated]);
  const pingGpsManually = () => {
    if (!navigator.geolocation) {
      setGpsStatusMessage("This browser does not support GPS.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        acquireGps(pos);
        void publishLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
        );
      },
      reportGpsError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  };

  // ============================================================================
  // Availability Toggles (Go Online / Go Offline)
  // ============================================================================

  const handleToggleOnline = async () => {
    if (!profile) return;
    setIsTogglingAvailability(true);
    setStatusError(null);

    try {
      if (
        profile.workStatus === RiderWorkStatus.ONLINE_AVAILABLE ||
        profile.workStatus === RiderWorkStatus.ONLINE_UNAVAILABLE
      ) {
        // Go Offline
        const res = await apiClient.request<any>(
          "/rider/availability/offline",
          {
            method: "POST",
          },
        );
        if (res.data) {
          setProfile(res.data.profile);
          setActiveSession(null);
        }
      } else {
        if (!gpsAcquiredAt || Date.now() - gpsAcquiredAt > 30000)
          throw new Error("Acquire a fresh GPS location before going online.");
        // Go Online
        const res = await apiClient.request<any>("/rider/availability/online", {
          method: "POST",
          body: JSON.stringify({
            latitude: coords.lat,
            longitude: coords.lng,
            accuracy_meters: gpsAccuracy,
          }),
        });
        if (res.data) {
          setProfile(res.data.profile);
          setActiveSession(res.data.session);
        }
      }
      await fetchRiderStatus();
    } catch (err: any) {
      setStatusError(errorMessage(err));
    } finally {
      setIsTogglingAvailability(false);
    }
  };

  // ============================================================================
  // Profile & Onboarding Handlers
  // ============================================================================

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileActionMessage(null);
    try {
      const res = await apiClient.request<RiderProfile>("/rider/profile", {
        method: "PATCH",
        body: JSON.stringify({
          first_name: editFirstName,
          last_name: editLastName,
          phone: editPhone,
        }),
      });
      if (res.data) {
        setProfile(res.data);
        setProfileActionMessage("Profile updated successfully");
      }
    } catch (err: any) {
      setProfileActionMessage(`Error: ${err.message}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSubmitOnboarding = async () => {
    setIsSubmittingOnboarding(true);
    setProfileActionMessage(null);
    try {
      const res = await apiClient.request<RiderProfile>(
        "/rider/onboarding/submit",
        {
          method: "POST",
        },
      );
      if (res.data) {
        setProfile(res.data);
        setProfileActionMessage(
          "Application submitted for administrative review!",
        );
        await fetchRiderStatus();
      }
    } catch (err: any) {
      setProfileActionMessage(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmittingOnboarding(false);
    }
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingVehicle(true);
    setVehicleActionMessage(null);
    try {
      const res = await apiClient.request<RiderVehicle>("/rider/vehicles", {
        method: "POST",
        body: JSON.stringify({
          type: editVehicleType,
          registration_number: editVehicleReg.trim() || undefined,
          status: VehicleStatus.ACTIVE,
        }),
      });
      if (res.data) {
        setVehicle(res.data);
        setVehicleActionMessage("Vehicle information saved");
        await fetchRiderStatus();
      }
    } catch (err: any) {
      setVehicleActionMessage(`Failed to save vehicle: ${err.message}`);
    } finally {
      setIsSavingVehicle(false);
    }
  };

  // ============================================================================
  // Authentication Handlers
  // ============================================================================

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmittingAuth(true);
    try {
      await login(loginIdentifier, loginPassword);
    } catch (err: any) {
      setAuthError(err.error?.message || err.message || "Login failed");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // 1. UNAUTHENTICATED STATE
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col justify-center items-center p-4 font-sans text-ink max-w-xl mx-auto">
        <div className="w-full">
          <div className="text-center mb-6">
            <DeetooLogo className="h-9 mx-auto  contrast-200 mb-2" />
            <h1 className="text-lg font-bold text-ink tracking-tight">
              Rider Courier Portal
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Courier availability, operational eligibility, and shift sessions
            </p>
          </div>

          <Card className="bg-canvas border-stone-200 p-5 text-stone-700 shadow-xl">
            <form onSubmit={handleLogin} className="space-y-4">
              {authError && (
                <div className="p-3 bg-rose-950/80 border border-rose-800 rounded text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle size={15} /> {authError}
                </div>
              )}

              <FormField label="Courier Phone or Email" required>
                <Input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="rider@deetoo.ke or +254733000001"
                  className="bg-canvas border-stone-200 text-ink text-xs"
                  required
                />
              </FormField>

              <FormField label="Password" required>
                <Input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-canvas border-stone-200 text-ink text-xs"
                  required
                />
              </FormField>

              <Button
                type="submit"
                variant="primary"
                className="w-full cursor-pointer mt-2 text-xs"
                isLoading={isSubmittingAuth}
              >
                Sign In as Courier
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // 2. FORBIDDEN ROLE STATE
  if (!isRiderAuthorized) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col justify-center items-center p-4 font-sans text-ink max-w-md mx-auto border-x border-stone-200">
        <Card className="w-full bg-canvas border-stone-200 p-6 text-center">
          <Lock size={36} className="mx-auto text-rose-500 mb-3" />
          <h2 className="text-base font-bold text-ink">
            403 Forbidden: Courier Role Required
          </h2>
          <p className="text-xs text-slate-400 mt-2 mb-4 leading-relaxed">
            Your account (
            <span className="font-mono text-ink">{user?.email}</span>) does not
            have the RIDER role.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={logout}
            className="cursor-pointer"
          >
            Sign Out & Switch Account
          </Button>
        </Card>
      </div>
    );
  }

  const isOnline =
    profile?.workStatus === RiderWorkStatus.ONLINE_AVAILABLE ||
    profile?.workStatus === RiderWorkStatus.ONLINE_UNAVAILABLE;

  const isSuspended =
    profile?.operationalStatus === RiderOperationalStatus.SUSPENDED;
  const isPendingReview =
    profile?.onboardingStatus === RiderOnboardingStatus.PENDING_REVIEW;
  const isDraft = profile?.onboardingStatus === RiderOnboardingStatus.DRAFT;
  const isRejected =
    profile?.onboardingStatus === RiderOnboardingStatus.REJECTED;

  // 3. MAIN RIDER INTERFACE
  return (
    <ErrorBoundary fallbackTitle="Rider Application Error">
      <div className="min-h-screen bg-canvas text-ink flex flex-col font-sans max-w-xl mx-auto">
        {/* Top Header */}
        <header className="sticky top-0 z-30 border-b border-stone-200 bg-canvas px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DeetooLogo className="h-6 " />
              <Badge
                variant="default"
                className="text-[10px] bg-emerald-950 text-emerald-700 border-emerald-800"
              >
                Rider App
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchRiderStatus}
                className="p-1.5 rounded text-slate-400 hover:text-ink hover:bg-white transition-colors"
                title="Refresh Status"
              >
                <RefreshCw
                  size={13}
                  className={
                    isLoadingStatus ? "animate-spin text-emerald-700" : ""
                  }
                />
              </button>
              <button
                onClick={logout}
                className="p-1.5 rounded text-rose-700 hover:text-rose-300 hover:bg-white transition-colors"
                title="Sign Out"
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </header>

        {/* Operational Status / Availability Action Header */}
        <div className="p-4 bg-canvas border-b border-stone-200 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-full ${
                  isOnline
                    ? "bg-emerald-500/20 text-brand"
                    : isSuspended
                      ? "bg-rose-500/20 text-rose-700"
                      : "bg-white text-slate-400"
                }`}
              >
                <Bike size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ink">
                    {profile
                      ? `${profile.firstName} ${profile.lastName}`
                      : "Courier"}
                  </span>
                  {profile && (
                    <Badge
                      variant={
                        profile.workStatus === RiderWorkStatus.ONLINE_AVAILABLE
                          ? "success"
                          : profile.workStatus ===
                              RiderWorkStatus.ONLINE_UNAVAILABLE
                            ? "warning"
                            : "default"
                      }
                    >
                      {profile.workStatus}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {profile && (
                    <>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Onboarding:{" "}
                        <strong className="text-stone-700">
                          {profile.onboardingStatus}
                        </strong>
                      </span>
                      <span className="text-[10px] text-slate-500">•</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Ops:{" "}
                        <strong
                          className={
                            isSuspended ? "text-rose-700" : "text-stone-700"
                          }
                        >
                          {profile.operationalStatus}
                        </strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Go Online / Go Offline Primary Toggle */}
            <Button
              variant={isOnline ? "danger" : "primary"}
              size="sm"
              onClick={handleToggleOnline}
              disabled={
                isTogglingAvailability ||
                (!isOnline &&
                  (!gpsAcquiredAt || Date.now() - gpsAcquiredAt > 30000)) ||
                isSuspended ||
                !profile ||
                profile.onboardingStatus !== RiderOnboardingStatus.APPROVED
              }
              className="shrink-0 cursor-pointer text-xs"
            >
              <Power size={14} className="mr-1.5" />
              {isTogglingAvailability ? (
                <Spinner size="sm" />
              ) : isOnline ? (
                "Go Offline"
              ) : (
                "Go Online"
              )}
            </Button>
          </div>

          {/* Warnings & Notices */}
          {statusError && (
            <div className="p-2.5 bg-rose-950/80 border border-rose-800 rounded text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{statusError}</span>
            </div>
          )}

          {isSuspended && (
            <div className="p-2.5 bg-rose-950/90 border border-rose-800 rounded text-rose-200 text-xs flex items-start gap-2">
              <ShieldAlert
                size={16}
                className="shrink-0 mt-0.5 text-rose-700"
              />
              <div>
                <strong className="block font-semibold">
                  Account Suspended by Operations
                </strong>
                <p className="text-[11px] text-rose-300 mt-0.5">
                  Reason:{" "}
                  {profile?.suspensionReason ||
                    "Operational review in progress"}
                  . You cannot go online until reactivated by an administrator.
                </p>
              </div>
            </div>
          )}

          {isPendingReview && (
            <div className="p-2.5 bg-amber-950/80 border border-amber-800 rounded text-amber-200 text-xs flex items-start gap-2">
              <Clock size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <div>
                <strong className="block font-semibold">
                  Onboarding Under Review
                </strong>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Your courier profile has been submitted. Deetoo operations
                  will approve your vehicle and identity before you can go
                  online.
                </p>
              </div>
            </div>
          )}

          {isDraft && (
            <div className="p-2.5 bg-blue-950/80 border border-blue-800 rounded text-blue-200 text-xs flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="shrink-0 mt-0.5 text-blue-400"
              />
              <div>
                <strong className="block font-semibold">
                  Complete Onboarding Application
                </strong>
                <p className="text-[11px] text-blue-300 mt-0.5">
                  Please verify your identity and vehicle information below,
                  then click &quot;Submit for Approval&quot;.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* GPS Live Status Strip */}
        <div className="px-4 py-2.5 bg-canvas border-b border-stone-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-stone-600">
            <Radio
              size={14}
              className={
                isOnline ? "text-emerald-700 animate-pulse" : "text-slate-600"
              }
            />
            <span className="font-mono text-[11px]">
              {gpsAcquiredAt
                ? `GPS: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} (±${Math.round(gpsAccuracy)}m)`
                : "GPS unavailable"}
            </span>
          </div>
          <button
            onClick={pingGpsManually}
            disabled={isPublishingGps}
            className="text-[11px] text-emerald-700 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
          >
            {isPublishingGps ? <Spinner size="sm" /> : <RefreshCw size={11} />}
            Retry location
          </button>
        </div>

        {!gpsAcquiredAt && gpsStatusMessage && (
          <p role="status" className="px-4 py-2 text-xs text-amber-800 bg-amber-50">{gpsStatusMessage}</p>
        )}
        <div className="p-3">
          <AppNavigation
            active={activeTab}
            onChange={(id) => {
              setActiveTab(id as typeof activeTab);
              if (id === "sessions") void fetchSessions();
            }}
            items={[
              { id: "run", label: "Delivery run" },
              { id: "earnings", label: "Earnings" },
              { id: "wallet", label: "Wallet" },
              { id: "performance", label: "Performance" },
              { id: "availability", label: "Availability" },
              { id: "vehicle", label: "Vehicle" },
              { id: "profile", label: "Profile" },
              { id: "sessions", label: "Sessions" },
              { id: "notifications", label: "Notifications" },
              { id: "support", label: "Support" },
            ]}
          />
        </div>
        <main className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          {/* TAB 1: READINESS & AVAILABILITY */}
          {activeTab === "run" && (
            <RiderRun
              coordinates={
                gpsAcquiredAt && Date.now() - gpsAcquiredAt < 30000
                  ? {
                      latitude: coords.lat,
                      longitude: coords.lng,
                      accuracy_meters: gpsAccuracy,
                    }
                  : null
              }
              onChanged={fetchRiderStatus}
            />
          )}
          {activeTab === "notifications" && <NotificationInbox />}
          {activeTab === "support" && <AccountSupport mode="participant" />}
          {activeTab === "earnings" && <RiderEarnings />}
          {activeTab === "wallet" && <RiderWalletPanel />}
          {activeTab === "performance" && <RiderPerformancePanel />}
          {activeTab === "availability" && (
            <div className="flex flex-col gap-4">
              {/* Active Session Card */}
              {activeSession ? (
                <Card className="bg-emerald-950/40 border-emerald-800/80 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 block">
                        Active Shift Session
                      </span>
                      <h3 className="text-sm font-bold text-ink mt-0.5">
                        Online in Redis Geospatial Index
                      </h3>
                      <p className="text-xs text-stone-600 mt-1">
                        Started:{" "}
                        {new Date(activeSession.startedAt).toLocaleTimeString()}{" "}
                        (
                        {Math.floor(
                          (Date.now() -
                            new Date(activeSession.startedAt).getTime()) /
                            60000,
                        )}
                        m ago)
                      </p>
                    </div>
                    <Badge variant="success" className="animate-pulse">
                      {gpsAcquiredAt && Date.now() - gpsAcquiredAt < 30000
                        ? "GPS acquired"
                        : "GPS unavailable"}
                    </Badge>
                  </div>
                </Card>
              ) : (
                <Card className="bg-white/60 border-stone-200 p-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    Availability State
                  </span>
                  <p className="text-xs text-stone-600 mt-1">
                    You are currently offline. When ready to work, tap &quot;Go
                    Online&quot; to begin your shift session.
                  </p>
                </Card>
              )}

              {/* Authoritative Operational Dispatch Eligibility Checklist */}
              <Card className="bg-white/90 border-stone-200 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-emerald-700" />{" "}
                    Dispatch Eligibility Verification
                  </h4>
                  <Badge variant={eligibility.eligible ? "success" : "default"}>
                    {eligibility.eligible ? "ELIGIBLE" : "INELIGIBLE"}
                  </Badge>
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  {/* Item 1: Identity & Authentication */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600 flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-emerald-700 shrink-0"
                      />{" "}
                      Authenticated Courier Account
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {user?.email}
                    </span>
                  </div>

                  {/* Item 2: Onboarding Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600 flex items-center gap-2">
                      {profile?.onboardingStatus ===
                      RiderOnboardingStatus.APPROVED ? (
                        <CheckCircle2
                          size={14}
                          className="text-emerald-700 shrink-0"
                        />
                      ) : (
                        <XCircle
                          size={14}
                          className="text-amber-400 shrink-0"
                        />
                      )}
                      Administrative Approval
                    </span>
                    <Badge
                      variant={
                        profile?.onboardingStatus ===
                        RiderOnboardingStatus.APPROVED
                          ? "success"
                          : "warning"
                      }
                    >
                      {profile?.onboardingStatus || "DRAFT"}
                    </Badge>
                  </div>

                  {/* Item 3: Operational Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600 flex items-center gap-2">
                      {profile?.operationalStatus ===
                      RiderOperationalStatus.ACTIVE ? (
                        <CheckCircle2
                          size={14}
                          className="text-emerald-700 shrink-0"
                        />
                      ) : (
                        <XCircle size={14} className="text-rose-700 shrink-0" />
                      )}
                      Operational Account Standing
                    </span>
                    <Badge
                      variant={
                        profile?.operationalStatus ===
                        RiderOperationalStatus.ACTIVE
                          ? "success"
                          : "danger"
                      }
                    >
                      {profile?.operationalStatus || "UNKNOWN"}
                    </Badge>
                  </div>

                  {/* Item 4: Registered Vehicle */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600 flex items-center gap-2">
                      {vehicle?.status === VehicleStatus.ACTIVE ? (
                        <CheckCircle2
                          size={14}
                          className="text-emerald-700 shrink-0"
                        />
                      ) : (
                        <XCircle
                          size={14}
                          className="text-amber-400 shrink-0"
                        />
                      )}
                      Active Vehicle Assigned
                    </span>
                    <span className="font-mono text-[11px] text-stone-600">
                      {vehicle
                        ? `${vehicle.type} (${vehicle.registrationNumber || "No plate"})`
                        : "None"}
                    </span>
                  </div>

                  {/* Item 5: Service Zone Coverage */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600 flex items-center gap-2">
                      {assignedZones.length > 0 ? (
                        <CheckCircle2
                          size={14}
                          className="text-emerald-700 shrink-0"
                        />
                      ) : (
                        <XCircle
                          size={14}
                          className="text-amber-400 shrink-0"
                        />
                      )}
                      Assigned Service Zones
                    </span>
                    <span className="text-[11px] text-stone-600">
                      {assignedZones.length > 0
                        ? assignedZones.map((z) => z.name).join(", ")
                        : "Pending zone assignment"}
                    </span>
                  </div>

                  {/* Item 6: GPS Signal Freshness */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600 flex items-center gap-2">
                      {!locationFreshness.isStale ? (
                        <CheckCircle2
                          size={14}
                          className="text-emerald-700 shrink-0"
                        />
                      ) : (
                        <XCircle
                          size={14}
                          className="text-amber-400 shrink-0"
                        />
                      )}
                      GPS Signal Freshness (&lt; 60s)
                    </span>
                    <span className="text-[11px] font-mono text-stone-600">
                      {locationFreshness.lastLocationAgeSeconds !== undefined
                        ? `${locationFreshness.lastLocationAgeSeconds}s ago`
                        : "No signal"}
                    </span>
                  </div>
                </div>

                {eligibility.reasons.length > 0 && !eligibility.eligible && (
                  <div className="mt-4 p-2.5 bg-canvas border border-stone-200 rounded text-[11px] text-amber-800 space-y-1">
                    <strong className="block font-semibold">
                      Eligibility Requirements to Resolve:
                    </strong>
                    <ul className="list-disc pl-4 space-y-0.5 text-stone-600">
                      {eligibility.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              {/* Empty state disclaimer regarding dispatch scope */}
              <EmptyState
                icon={Navigation}
                title={
                  isOnline ? "Active on Dispatch Roster" : "Courier Offline"
                }
                description={
                  isOnline
                    ? "Your availability is managed by dispatch. Open Delivery run to view eligible offers."
                    : "Tap Go Online above to start receiving GPS pings and register availability."
                }
              />
            </div>
          )}

          {/* TAB 2: VEHICLE INFORMATION */}
          {activeTab === "vehicle" && (
            <div className="flex flex-col gap-4">
              <Card className="bg-white border-stone-200 p-4">
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-stone-200">
                  <Car size={16} className="text-emerald-700" /> Vehicle
                  Configuration
                </h4>

                {vehicleActionMessage && (
                  <div className="my-3 p-2.5 rounded bg-canvas border border-stone-200 text-xs text-emerald-300">
                    {vehicleActionMessage}
                  </div>
                )}

                <form onSubmit={handleSaveVehicle} className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Vehicle Type
                    </label>
                    <select
                      value={editVehicleType}
                      onChange={(e) =>
                        setEditVehicleType(e.target.value as VehicleType)
                      }
                      className="w-full p-2 bg-canvas border border-stone-200 rounded text-xs text-ink"
                    >
                      <option value={VehicleType.MOTORBIKE}>
                        Motorbike / Boda Boda
                      </option>
                      <option value={VehicleType.BICYCLE}>Bicycle</option>
                      <option value={VehicleType.CAR}>Car / Van</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      License Plate / Registration
                    </label>
                    <input
                      type="text"
                      value={editVehicleReg}
                      onChange={(e) => setEditVehicleReg(e.target.value)}
                      placeholder="e.g. KMD 123X or BIKE-01"
                      className="w-full p-2 bg-canvas border border-stone-200 rounded text-xs text-ink"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    className="w-full mt-2 cursor-pointer text-xs"
                    isLoading={isSavingVehicle}
                  >
                    Save Vehicle Details
                  </Button>
                </form>
              </Card>
            </div>
          )}

          {/* TAB 3: COURIER PROFILE & ONBOARDING */}
          {activeTab === "profile" && (
            <div className="flex flex-col gap-4">
              <Card className="bg-white border-stone-200 p-4">
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-stone-200">
                  <User size={16} className="text-emerald-700" /> Personal
                  Details & Onboarding
                </h4>

                {profileActionMessage && (
                  <div className="my-3 p-2.5 rounded bg-canvas border border-stone-200 text-xs text-emerald-300">
                    {profileActionMessage}
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="w-full p-2 bg-canvas border border-stone-200 rounded text-xs text-ink"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="w-full p-2 bg-canvas border border-stone-200 rounded text-xs text-ink"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Mobile Phone (M-Pesa / SMS)
                    </label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full p-2 bg-canvas border border-stone-200 rounded text-xs text-ink"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    className="w-full mt-2 cursor-pointer text-xs"
                    isLoading={isSavingProfile}
                  >
                    Update Profile
                  </Button>
                </form>

                {/* Onboarding Submit Action */}
                {profile?.onboardingStatus === RiderOnboardingStatus.DRAFT && (
                  <div className="mt-4 pt-4 border-t border-stone-200">
                    <p className="text-xs text-slate-400 mb-2">
                      When your contact details and vehicle information are
                      ready, submit your profile for admin verification.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSubmitOnboarding}
                      isLoading={isSubmittingOnboarding}
                      className="w-full cursor-pointer text-xs"
                    >
                      <Send size={13} className="mr-1.5" /> Submit Onboarding
                      Application
                    </Button>
                  </div>
                )}
              </Card>

              {/* Account Metadata */}
              <Card className="bg-white/60 border-stone-200 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Rider ID:</span>
                  <span className="font-mono text-emerald-700">
                    {profile?.id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">User Account ID:</span>
                  <span className="font-mono text-slate-400">{user?.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Approved At:</span>
                  <span className="text-stone-600">
                    {profile?.approvedAt
                      ? new Date(profile.approvedAt).toLocaleDateString()
                      : "Pending"}
                  </span>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 4: AVAILABILITY SESSIONS */}
          {activeTab === "sessions" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                  <History size={15} className="text-emerald-700" /> Past Shift
                  Sessions
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchSessions}
                  className="text-xs py-1"
                >
                  <RefreshCw
                    size={12}
                    className={isLoadingSessions ? "animate-spin" : ""}
                  />{" "}
                  Refresh
                </Button>
              </div>

              {sessions.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No Shift History Recorded"
                  description="Previous online sessions and durations will appear here once completed."
                />
              ) : (
                sessions.map((s, idx) => {
                  const started = new Date(s.startedAt);
                  const ended = s.endedAt ? new Date(s.endedAt) : null;
                  const durationMin = ended
                    ? Math.round((ended.getTime() - started.getTime()) / 60000)
                    : null;

                  return (
                    <Card
                      key={idx}
                      className="bg-white border-stone-200 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-ink">
                          {started.toLocaleDateString()}
                        </span>
                        <Badge variant={s.endedAt ? "default" : "success"}>
                          {s.endedAt
                            ? s.endReason || "COMPLETED"
                            : "ACTIVE SHIFT"}
                        </Badge>
                      </div>
                      <div className="text-slate-400 text-[11px] flex items-center gap-3">
                        <span>Started: {started.toLocaleTimeString()}</span>
                        {ended && (
                          <span>Ended: {ended.toLocaleTimeString()}</span>
                        )}
                        {durationMin !== null && (
                          <span className="text-emerald-700 font-bold">
                            {durationMin} min
                          </span>
                        )}
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
