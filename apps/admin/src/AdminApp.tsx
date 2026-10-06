import { AuthenticatorPanel } from './components/AuthenticatorPanel';
import {
  OperationsLayout,
  Navigation,
} from "../../../packages/ui/src/workflows";
import { CommandCenter } from "./components/CommandCenter";
import { ResourceTable } from "./components/ResourceTable";
import { adminViews } from "./components/adminViews";
import { OperationsConfig } from "./components/OperationsConfig";
import { LaunchReadiness } from "./components/LaunchReadiness";
import { SupportCaseConsole } from "./components/SupportCaseConsole";

function adminTabFromPath(){
  const path=window.location.pathname.replace(/^\/ops/,"").replace(/\/+$/,"");
  return path&&path!=="/"?path.replace(/^\//,""):"command";
}
function adminTabPath(tab:string){const prefix=window.location.pathname.startsWith("/ops")?"/ops":"";return `${prefix}/${tab}`;}
/**
 * DEETOO - Admin & Operations Application Shell
 * Central operations console: User management, RBAC, live audit trail, zones, health
 * Compliant with Section 29, 30, 41-52 & DEE-PRD-001, DEE-SEC-001, DEE-OPS-001
 */

import React, { useState, useEffect, useCallback } from "react";
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
  Select,
  Modal,
} from "../../../packages/ui/src/index";
import { AuthProvider, useAuth } from "../../../packages/auth/src/react";
import {
  SystemHealthResponse,
  UserRole,
  UserStatus,
} from "../../../packages/types/src/index";
import {
  ShieldAlert,
  Server,
  Database,
  MapPin,
  FileText,
  Activity,
  DollarSign,
  RefreshCw,
  User,
  Users,
  LogOut,
  Lock,
  Search,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Filter,
  Bike,
  Car,
  Radio,
  Store,
} from "lucide-react";

export function AdminApp() {
  return (
    <AuthProvider clientApp="admin">
      <AdminAppInner />
    </AuthProvider>
  );
}

function AdminAppInner() {
  const {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    hasRole,
    hasPermission,
    apiClient,
  } = useAuth();

  const [activeTab, setActiveTabState] = useState<string>(()=>adminTabFromPath());
  const setActiveTab=(tab:string)=>{
    setActiveTabState(tab);
    const next=adminTabPath(tab);
    if(window.location.pathname!==next)window.history.pushState({}, "", next);
  };
  useEffect(()=>{
    const sync=()=>setActiveTabState(adminTabFromPath());
    window.addEventListener("popstate",sync);
    return()=>window.removeEventListener("popstate",sync);
  },[]);
  const [healthData, setHealthData] = useState<SystemHealthResponse | null>(
    null,
  );
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rider Management State (Sprint 8)
  const [ridersList, setRidersList] = useState<any[]>([]);
  const [isLoadingRiders, setIsLoadingRiders] = useState(false);
  const [riderAvailabilitySummary, setRiderAvailabilitySummary] =
    useState<any>(null);
  const [riderOnboardingFilter, setRiderOnboardingFilter] = useState("");
  const [riderOperationalFilter, setRiderOperationalFilter] = useState("");
  const [riderWorkFilter, setRiderWorkFilter] = useState("");
  const [selectedRiderAction, setSelectedRiderAction] = useState<any | null>(
    null,
  );
  const [riderActionModalType, setRiderActionModalType] = useState<
    "approve" | "reject" | "suspend" | "reactivate" | null
  >(null);
  const [riderActionReason, setRiderActionReason] = useState(
    "Standard operational review",
  );
  const [isProcessingRiderAction, setIsProcessingRiderAction] = useState(false);

  // User Management State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userRoleFilter, setUserRoleFilter] = useState<string>("");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("");
  const [userSearchQuery, setUserSearchQuery] = useState<string>("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Suspend / Reactivate Modal
  const [suspendTargetUser, setSuspendTargetUser] = useState<any | null>(null);
  const [suspendReason, setSuspendReason] = useState(
    "Security policy violation or identity review",
  );
  const [isProcessingStatus, setIsProcessingStatus] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditActionFilter, setAuditActionFilter] = useState<string>("");
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const isAdminAuthorized =
    hasRole(UserRole.SUPER_ADMIN) ||
    hasRole(UserRole.ADMIN) ||
    hasRole(UserRole.OPS) ||
    hasRole(UserRole.SUPPORT) ||
    hasRole(UserRole.FINANCE);

  const canManageUsers =
    hasRole(UserRole.ADMIN) ||
    hasRole(UserRole.OPS) ||
    hasPermission("user:manage");

  const fetchHealth = async () => {
    setIsLoadingHealth(true);
    setHealthError(null);
    try {
      const data = await apiClient.getHealth();
      setHealthData(data);
    } catch {
      setHealthData(null);
      setHealthError("Health probes are unavailable. No runtime status has been assumed.");
    } finally {
      setIsLoadingHealth(false);
    }
  };

  const fetchUsers = useCallback(async () => {
    if (!isAuthenticated || !canManageUsers) return;
    setIsLoadingUsers(true);
    try {
      const queryParams: any = {};
      if (userRoleFilter) queryParams.role = userRoleFilter;
      if (userStatusFilter) queryParams.status = userStatusFilter;
      if (userSearchQuery) queryParams.search = userSearchQuery;

      const res = await apiClient.listUsers(queryParams);
      setUsersList((res.data as any)?.users || res.data || []);
    } catch {
      // ignore
    } finally {
      setIsLoadingUsers(false);
    }
  }, [
    isAuthenticated,
    canManageUsers,
    userRoleFilter,
    userStatusFilter,
    userSearchQuery,
    apiClient,
  ]);

  const fetchAuditLogs = useCallback(async () => {
    if (!isAuthenticated || !isAdminAuthorized) return;
    setIsLoadingAudit(true);
    try {
      const queryParams: any = { limit: 50 };
      if (auditActionFilter) queryParams.action = auditActionFilter;

      const res = await apiClient.getAuditLogs(queryParams);
      setAuditLogs((res.data as any)?.logs || res.data || []);
    } catch {
      // ignore
    } finally {
      setIsLoadingAudit(false);
    }
  }, [isAuthenticated, isAdminAuthorized, auditActionFilter, apiClient]);

  const fetchRiders = useCallback(async () => {
    if (!isAuthenticated || !isAdminAuthorized) return;
    setIsLoadingRiders(true);
    try {
      const params = new URLSearchParams();
      if (riderOnboardingFilter)
        params.append("onboarding_status", riderOnboardingFilter);
      if (riderOperationalFilter)
        params.append("operational_status", riderOperationalFilter);
      if (riderWorkFilter) params.append("work_status", riderWorkFilter);

      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await apiClient.request<any[]>(`/admin/riders${qs}`);
      setRidersList(res.data || []);
    } catch {
      // ignore
    } finally {
      setIsLoadingRiders(false);
    }
  }, [
    isAuthenticated,
    isAdminAuthorized,
    riderOnboardingFilter,
    riderOperationalFilter,
    riderWorkFilter,
    apiClient,
  ]);

  const fetchRiderSummary = useCallback(async () => {
    if (!isAuthenticated || !isAdminAuthorized) return;
    try {
      const res = await apiClient.request<any>(
        "/admin/riders/availability/summary",
      );
      setRiderAvailabilitySummary(res.data || null);
    } catch {
      // ignore
    }
  }, [isAuthenticated, isAdminAuthorized, apiClient]);

  const handleRiderAction = async () => {
    if (!selectedRiderAction || !riderActionModalType) return;
    setIsProcessingRiderAction(true);
    try {
      const riderId = selectedRiderAction.id;
      if (riderActionModalType === "approve") {
        await apiClient.request(`/admin/riders/${riderId}/approve`, {
          method: "POST",
        });
      } else if (riderActionModalType === "reject") {
        await apiClient.request(`/admin/riders/${riderId}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason: riderActionReason }),
        });
      } else if (riderActionModalType === "suspend") {
        await apiClient.request(`/admin/riders/${riderId}/suspend`, {
          method: "POST",
          body: JSON.stringify({ reason: riderActionReason }),
        });
      } else if (riderActionModalType === "reactivate") {
        await apiClient.request(`/admin/riders/${riderId}/reactivate`, {
          method: "POST",
          body: JSON.stringify({ reason: riderActionReason }),
        });
      }

      setRiderActionModalType(null);
      setSelectedRiderAction(null);
      await fetchRiders();
      await fetchRiderSummary();
    } catch (err: any) {
      alert(err.error?.message || err.message || "Failed to execute rider action");
    } finally {
      setIsProcessingRiderAction(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers();
    } else if (activeTab === "riders") {
      fetchRiders();
      fetchRiderSummary();
    } else if (activeTab === "audit") {
      fetchAuditLogs();
    }
  }, [activeTab, fetchUsers, fetchRiders, fetchRiderSummary, fetchAuditLogs]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await login(loginIdentifier, loginPassword);
    } catch (err: any) {
      setAuthError(err.error?.message || err.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (status: UserStatus) => {
    if (!suspendTargetUser) return;
    setIsProcessingStatus(true);
    try {
      if (status === UserStatus.SUSPENDED) {
        await apiClient.suspendUser(suspendTargetUser.id, suspendReason);
      } else {
        await apiClient.reactivateUser(suspendTargetUser.id, suspendReason);
      }
      setSuspendTargetUser(null);
      await fetchUsers();
      if (activeTab === "audit") await fetchAuditLogs();
    } catch (err: any) {
      alert(err.error?.message || err.message || "Failed to update user status");
    } finally {
      setIsProcessingStatus(false);
    }
  };

  // 1. UNAUTHENTICATED STATE: Admin Login View
  if (!isAuthenticated) {
    return (
      <div className="portal-login-shell min-h-screen bg-canvas flex flex-col justify-center items-center p-4 font-sans text-ink">
        <div className="portal-login-wrap max-w-md w-full">
          <div className="text-center mb-8">
            <DeetooLogo className="h-10 mx-auto  mb-3" />
            <h1 className="text-xl font-bold text-ink tracking-tight">
              DeeToo Operations
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Live marketplace control for orders, riders, restaurants, payments and platform health.
            </p>
          </div>

          <Card className="portal-login-card bg-white border-stone-200 p-6 text-ink shadow-2xl">
            <form onSubmit={handleLogin} className="space-y-4">
              {authError && (
                <div className="p-3 bg-rose-950/80 border border-rose-800 rounded text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle size={15} /> {authError}
                </div>
              )}

              <FormField label="Administrator Email" required>
                <Input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="admin@deetoo.ke"
                  className="bg-canvas border-stone-200 text-ink"
                  required
                />
              </FormField>

              <FormField label="Password" required>
                <Input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-canvas border-stone-200 text-ink"
                  required
                />
              </FormField>

              <Button
                type="submit"
                variant="primary"
                className="w-full cursor-pointer mt-2"
                isLoading={isSubmitting}
              >
                Sign In to Platform Admin
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // 2. FORBIDDEN ROLE STATE
  if (!isAdminAuthorized) {
    return (
      <div className="portal-login-shell min-h-screen bg-canvas flex flex-col justify-center items-center p-4 font-sans text-ink">
        <Card className="max-w-md w-full bg-canvas border-stone-200 p-6 text-center">
          <Lock size={36} className="mx-auto text-rose-500 mb-3" />
          <h2 className="text-base font-bold text-ink">
            403 Forbidden: Administrative Privileges Required
          </h2>
          <p className="text-xs text-slate-600 mt-2 mb-4 leading-relaxed">
            Your current account (
            <span className="font-mono text-ink">{user?.email}</span>) does not
            hold an administrative role (SUPER_ADMIN, ADMIN, OPS, SUPPORT, or FINANCE).
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

  // 3. AUTHENTICATED PLATFORM CONSOLE
  const superAdminAccess = hasRole(UserRole.SUPER_ADMIN);
  const financeAccess = hasRole(UserRole.ADMIN) || hasRole(UserRole.FINANCE);
  const operationsAccess = hasRole(UserRole.ADMIN) || hasRole(UserRole.OPS);
  const operationalRead = operationsAccess || hasRole(UserRole.SUPPORT);
  const navigation = [
    ...(operationalRead
      ? [
          { id: "command", label: "Live overview", icon:<Activity size={16}/>, group:"Operations" },
          { id: "dispatch", label: "Dispatch", icon:<Radio size={16}/>, group:"Operations" },
          { id: "orders", label: "Orders & deliveries", icon:<FileText size={16}/>, group:"Operations" },
          { id: "incidents", label: "Fleet & incidents", icon:<AlertTriangle size={16}/>, group:"Operations" },
        ]
      : []),
    ...(operationsAccess
      ? [
          { id: "merchants", label: "Merchants & approvals", icon:<Store size={16}/>, group:"Marketplace" },
          { id: "onboarding", label: "Merchant onboarding", icon:<CheckCircle2 size={16}/>, group:"Marketplace" },
          { id: "branches", label: "Branches", icon:<MapPin size={16}/>, group:"Marketplace" },
          { id: "zones", label: "Service zones", icon:<MapPin size={16}/>, group:"Marketplace" },
        ]
      : []),
    ...(operationalRead
      ? [{ id: "riders", label: "Riders", icon:<Bike size={16}/>, group:"People" }]
      : []),
    ...(canManageUsers
      ? [{ id: "users", label: "Users & access", icon:<Users size={16}/>, group:"People" }]
      : []),
    ...(superAdminAccess
      ? [{ id: "governance", label: "Identity governance", icon:<Lock size={16}/>, group:"People" }]
      : []),
    { id: "support", label: "Case inbox", icon:<User size={16}/>, group:"Support" },
    ...(operationalRead
      ? [{ id: "payments", label: "Payments & refunds", icon:<DollarSign size={16}/>, group:"Finance" }]
      : []),
    ...(financeAccess
      ? [
          { id: "ledger", label: "Financial ledger", icon:<Database size={16}/>, group:"Finance" },
          { id: "accounts", label: "Ledger accounts", icon:<FileText size={16}/>, group:"Finance" },
          { id: "adjustments", label: "Financial adjustments", icon:<DollarSign size={16}/>, group:"Finance" },
          { id: "destinations", label: "Payout destinations", icon:<MapPin size={16}/>, group:"Finance" },
          { id: "disbursements", label: "Disbursement attempts", icon:<DollarSign size={16}/>, group:"Finance" },
          { id: "settlements", label: "Merchant settlements", icon:<Store size={16}/>, group:"Finance" },
          { id: "payouts", label: "Rider payouts", icon:<Bike size={16}/>, group:"Finance" },
        ]
      : []),
    { id: "risk", label: "Risk signals", icon:<ShieldAlert size={16}/>, group:"Risk & Trust" },
    { id: "notifications", label: "Notifications", icon:<Radio size={16}/>, group:"Platform" },
    { id: "jobs", label: "Background jobs", icon:<Server size={16}/>, group:"Platform" },
    ...(operationsAccess
      ? [
          { id: "configuration", label: "Dispatch & controls", icon:<Filter size={16}/>, group:"Platform" },
          { id: "launch", label: "Launch readiness", icon:<CheckCircle2 size={16}/>, group:"Platform" },
          { id: "audit", label: "Audit trail", icon:<FileText size={16}/>, group:"Platform" },
        ]
      : []),
    { id: "overview", label: "System health", icon:<Activity size={16}/>, group:"Platform" },
  ];
  const selectedView = navigation.some((n) => n.id === activeTab)
    ? activeTab
    : "overview";
  return (
    <ErrorBoundary fallbackTitle="Admin Platform Operations Error Boundary">
      <OperationsLayout
        title="Operations command"
        userName={user?.name || user?.email}
        onLogout={logout}
        navigation={
          <Navigation
            active={selectedView}
            onChange={setActiveTab}
            items={navigation}
          />
        }
      >
        <AuthenticatorPanel />
        {selectedView === "command" && <CommandCenter />}
        {selectedView === "support" && <SupportCaseConsole />}
        {adminViews[selectedView] && selectedView !== "support" && (
          <ResourceTable
            key={selectedView}
            config={{
              ...adminViews[selectedView],
              actions:
                operationsAccess ||
                [
                  "incidents",
                  "support",
                  "notifications",
                  "jobs",
                  "risk",
                ].includes(selectedView) ||
                (financeAccess &&
                  ["accounts", "ledger", "adjustments", "destinations", "disbursements", "settlements", "payouts"].includes(
                    selectedView,
                  ))
                  ? adminViews[selectedView].actions
                  : undefined,
            }}
          />
        )}
        {selectedView === "configuration" && <OperationsConfig />}
        {selectedView === "launch" && <LaunchReadiness />}
        {/* TAB 1: OVERVIEW & HEALTH PROBES */}
        {selectedView === "overview" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Platform Health & Infrastructure Status
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authoritative system of record probes and runtime monitoring
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHealth}
                isLoading={isLoadingHealth}
                className="text-xs gap-1.5 cursor-pointer"
              >
                <RefreshCw size={13} /> Refresh Probes
              </Button>
            </div>

            {healthError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {healthError}
              </div>
            )}

            {/* Dependency Health Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                    <Database size={18} className="text-blue-600" /> PostgreSQL
                  </div>
                  <Badge
                    variant={
                      healthData?.dependencies.postgres.status === "healthy"
                        ? "success"
                        : "warning"
                    }
                  >
                    {healthData?.dependencies.postgres.status || "CHECKING"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  {healthData?.dependencies.postgres.message ||
                    "Authoritative transactional system of record."}
                </p>
                <div className="mt-3 text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                  Tables: users, user_roles, user_sessions, audit_logs
                </div>
              </Card>

              <Card className="bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                    <MapPin size={18} className="text-emerald-600" /> PostGIS
                  </div>
                  <Badge
                    variant={
                      healthData?.dependencies.postgis.status === "healthy"
                        ? "success"
                        : "default"
                    }
                  >
                    {healthData?.dependencies.postgis.status || "CHECKING"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  {healthData?.dependencies.postgis.message ||
                    "Spatial queries, GIST index, ST_Covers zone containment."}
                </p>
                <div className="mt-3 text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                  SRID: 4326 (WGS84 Earth Ellipsoid)
                </div>
              </Card>

              <Card className="bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                    <Server size={18} className="text-red-500" /> Redis Ephemeral Cache
                  </div>
                  <Badge
                    variant={
                      healthData?.dependencies.redis.status === "healthy"
                        ? "success"
                        : "warning"
                    }
                  >
                    {healthData?.dependencies.redis.status || "CHECKING"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  {healthData?.dependencies.redis.message ||
                    "Sliding window rate limiters and session tokens."}
                </p>
                <div className="mt-3 text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                  Ephemeral state only; PostgreSQL remains authoritative
                </div>
              </Card>
            </div>

            {/* Sprint 2 RBAC Guidance */}
            <Card className="bg-white border-l-4 border-l-[#00BF62]">
              <div className="flex items-start gap-3">
                <ShieldAlert
                  size={22}
                  className="text-brand shrink-0 mt-0.5"
                />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Account access & permissions
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Unified identity model implemented across Customer, Merchant
                    Staff, Courier Riders, and Admin/Ops staff. Session
                    invalidation, rate limit guards, and audit logging are
                    active on every endpoint.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 2: USERS & RBAC MANAGEMENT */}
        {activeTab === "users" && (
          <Card className="bg-white">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users size={16} className="text-brand" /> User Identity &
                  Role Directory
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Central identity registry with role assignment and account
                  suspension controls
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchUsers}
                isLoading={isLoadingUsers}
                className="text-xs gap-1.5 cursor-pointer"
              >
                <RefreshCw size={13} /> Refresh Users
              </Button>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-wrap gap-3 mb-4 text-xs">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                />
              </div>
              <div className="w-40">
                <Select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                >
                  <option value="">All Roles</option>
                  <option value="CUSTOMER">Customer</option>
                  <option value="MERCHANT_OWNER">Merchant Owner</option>
                  <option value="MERCHANT_MANAGER">Merchant Manager</option>
                  <option value="MERCHANT_STAFF">Merchant Staff</option>
                  <option value="RIDER">Rider</option>
                  <option value="ADMIN">Admin</option>
                  <option value="OPS">Ops</option>
                </Select>
              </div>
              <div className="w-36">
                <Select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DISABLED">Disabled</option>
                </Select>
              </div>
            </div>

            {/* Users Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3">Roles</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {usersList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-6 text-center text-slate-500"
                      >
                        {isLoadingUsers
                          ? "Loading platform users..."
                          : "No users match the search criteria"}
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/60">
                        <td className="p-3">
                          <span className="font-bold text-slate-900 block">
                            {u.name || "Unnamed User"}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {u.id}
                          </span>
                        </td>
                        <td className="p-3">
                          <div>{u.email || "No email"}</div>
                          <div className="font-mono text-slate-500">
                            {u.phone_e164 || "No phone"}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {(u.roles || []).map((r: string) => (
                              <Badge
                                key={r}
                                variant="default"
                                className="text-[10px] bg-slate-100 text-slate-800"
                              >
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              u.status === "ACTIVE" ? "success" : "danger"
                            }
                            className="text-[10px]"
                          >
                            {u.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {u.status === "ACTIVE" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSuspendTargetUser(u)}
                              className="text-rose-600 border-rose-200 hover:bg-rose-50 text-[11px] py-1 cursor-pointer"
                            >
                              Suspend
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSuspendTargetUser(u);
                              }}
                              className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 text-[11px] py-1 cursor-pointer"
                            >
                              Reactivate
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* TAB: RIDER OPERATIONS & FLEET MANAGEMENT (Sprint 8) */}
        {activeTab === "riders" && (
          <Card className="bg-white">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Bike size={16} className="text-brand" /> Courier Fleet &
                  Operational eligibility
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Administrative onboarding approval, operational status,
                  suspension control, and live availability
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchRiders();
                  fetchRiderSummary();
                }}
                isLoading={isLoadingRiders}
                className="text-xs gap-1.5 cursor-pointer"
              >
                <RefreshCw size={13} /> Refresh Riders
              </Button>
            </div>

            {/* Fleet Availability Summary KPI Cards */}
            {riderAvailabilitySummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 font-medium block">
                    Total Registered
                  </span>
                  <span className="text-lg font-bold text-slate-900">
                    {riderAvailabilitySummary.totalRiders}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-emerald-700 font-medium block">
                    Online & Available
                  </span>
                  <span className="text-lg font-bold text-emerald-800">
                    {riderAvailabilitySummary.onlineAvailable}
                  </span>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-blue-700 font-medium block">
                    Approved Active
                  </span>
                  <span className="text-lg font-bold text-blue-800">
                    {riderAvailabilitySummary.activeOperational}
                  </span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-amber-700 font-medium block">
                    Pending Approval
                  </span>
                  <span className="text-lg font-bold text-amber-800">
                    {riderAvailabilitySummary.pendingReview}
                  </span>
                </div>
              </div>
            )}

            {/* Filters Bar */}
            <div className="flex flex-wrap gap-3 mb-4 text-xs">
              <div className="w-44">
                <Select
                  value={riderOnboardingFilter}
                  onChange={(e) => setRiderOnboardingFilter(e.target.value)}
                >
                  <option value="">All Onboarding</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING_REVIEW">Pending Review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </Select>
              </div>
              <div className="w-40">
                <Select
                  value={riderOperationalFilter}
                  onChange={(e) => setRiderOperationalFilter(e.target.value)}
                >
                  <option value="">All Ops Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DISABLED">Disabled</option>
                </Select>
              </div>
              <div className="w-44">
                <Select
                  value={riderWorkFilter}
                  onChange={(e) => setRiderWorkFilter(e.target.value)}
                >
                  <option value="">All Work States</option>
                  <option value="OFFLINE">Offline</option>
                  <option value="ONLINE_AVAILABLE">Online Available</option>
                  <option value="ONLINE_UNAVAILABLE">Online Unavailable</option>
                  <option value="BUSY">Busy</option>
                </Select>
              </div>
            </div>

            {/* Riders Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Courier Name</th>
                    <th className="p-3">Vehicle</th>
                    <th className="p-3">Onboarding</th>
                    <th className="p-3">Operational</th>
                    <th className="p-3">Availability</th>
                    <th className="p-3">Last Known GPS</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {ridersList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-6 text-center text-slate-500"
                      >
                        {isLoadingRiders
                          ? "Loading rider fleet..."
                          : "No couriers found matching filters"}
                      </td>
                    </tr>
                  ) : (
                    ridersList.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="p-3">
                          <span className="font-bold text-slate-900 block">
                            {r.firstName} {r.lastName}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {r.phone}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-medium text-slate-700 block">
                            {r.vehicleType || "None"}
                          </span>
                          <span className="font-mono text-[10px] text-slate-600">
                            {r.vehicleRegistration || "No Plate"}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              r.onboardingStatus === "APPROVED"
                                ? "success"
                                : r.onboardingStatus === "PENDING_REVIEW"
                                  ? "warning"
                                  : "default"
                            }
                            className="text-[10px]"
                          >
                            {r.onboardingStatus}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              r.operationalStatus === "ACTIVE"
                                ? "success"
                                : "danger"
                            }
                            className="text-[10px]"
                          >
                            {r.operationalStatus}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              r.workStatus === "ONLINE_AVAILABLE"
                                ? "success"
                                : r.workStatus === "BUSY"
                                  ? "warning"
                                  : "default"
                            }
                            className="text-[10px]"
                          >
                            {r.workStatus}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-600">
                          {r.lastKnownLatitude && r.lastKnownLongitude ? (
                            <span>
                              {Number(r.lastKnownLatitude).toFixed(4)},{" "}
                              {Number(r.lastKnownLongitude).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-slate-600">None</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Onboarding Actions */}
                            {r.onboardingStatus === "PENDING_REVIEW" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedRiderAction(r);
                                    setRiderActionModalType("approve");
                                  }}
                                  className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-[10px] py-0.5 px-2"
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedRiderAction(r);
                                    setRiderActionReason(
                                      "Documents or vehicle failed verification",
                                    );
                                    setRiderActionModalType("reject");
                                  }}
                                  className="text-rose-600 border-rose-300 hover:bg-rose-50 text-[10px] py-0.5 px-2"
                                >
                                  Reject
                                </Button>
                              </>
                            )}

                            {/* Operational Actions */}
                            {r.operationalStatus === "ACTIVE" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedRiderAction(r);
                                  setRiderActionReason(
                                    "Operational policy violation",
                                  );
                                  setRiderActionModalType("suspend");
                                }}
                                className="text-rose-600 border-rose-200 hover:bg-rose-50 text-[10px] py-0.5 px-2"
                              >
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedRiderAction(r);
                                  setRiderActionReason(
                                    "Administrative reactivation approved",
                                  );
                                  setRiderActionModalType("reactivate");
                                }}
                                className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-[10px] py-0.5 px-2"
                              >
                                Reactivate
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* TAB 3: AUDIT TRAIL */}
        {activeTab === "audit" && (
          <Card className="bg-white">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText size={16} className="text-brand" /> Platform
                  Security Audit Trail
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Immutable log of sensitive identity, authorization, and
                  administrative events with correlation IDs
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="text-xs py-1"
                >
                  <option value="">All Actions</option>
                  <option value="LOGIN_SUCCEEDED">LOGIN_SUCCEEDED</option>
                  <option value="LOGIN_FAILED">LOGIN_FAILED</option>
                  <option value="USER_REGISTERED">USER_REGISTERED</option>
                  <option value="USER_STATUS_UPDATED">
                    USER_STATUS_UPDATED
                  </option>
                  <option value="SESSIONS_REVOKED">SESSIONS_REVOKED</option>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchAuditLogs}
                  isLoading={isLoadingAudit}
                  className="text-xs gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} /> Refresh
                </Button>
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden font-mono text-xs">
              <table className="w-full text-left">
                <thead className="bg-canvas text-slate-300 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Resource</th>
                    <th className="p-3">Request ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-6 text-center text-slate-500 font-sans"
                      >
                        {isLoadingAudit
                          ? "Fetching audit logs..."
                          : "No audit entries found"}
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-500 text-[11px]">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-slate-800">
                            {log.actor_user_id || "system"}
                          </span>
                          {log.actor_role && (
                            <span className="text-[10px] text-slate-600 block">
                              {log.actor_role}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.action.includes("FAILED") ||
                              log.action.includes("SUSPEND")
                                ? "bg-rose-100 text-rose-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600">
                          {log.resource_type}: {log.resource_id}
                        </td>
                        <td className="p-3 text-slate-600 text-[11px]">
                          {log.request_id || "n/a"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Suspend / Reactivate User Modal */}
        <Modal
          isOpen={!!suspendTargetUser}
          onClose={() => setSuspendTargetUser(null)}
          title={
            suspendTargetUser?.status === "ACTIVE"
              ? `Suspend User: ${suspendTargetUser?.email}`
              : `Reactivate User: ${suspendTargetUser?.email}`
          }
        >
          <div className="space-y-4 text-xs">
            {suspendTargetUser?.status === "ACTIVE" ? (
              <p className="text-slate-600">
                Suspending this user will immediately invalidate all active
                sessions, prevent new logins, and log a security audit event
                with your admin identity.
              </p>
            ) : (
              <p className="text-slate-600">
                Reactivating this user will restore their ability to
                authenticate and access platform functions according to their
                assigned roles.
              </p>
            )}

            <FormField label="Reason for Status Change" required>
              <Input
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Reason required for audit trail"
                required
              />
            </FormField>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSuspendTargetUser(null)}
              >
                Cancel
              </Button>
              {suspendTargetUser?.status === "ACTIVE" ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleUpdateStatus(UserStatus.SUSPENDED)}
                  isLoading={isProcessingStatus}
                >
                  Confirm Suspension
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleUpdateStatus(UserStatus.ACTIVE)}
                  isLoading={isProcessingStatus}
                >
                  Confirm Reactivation
                </Button>
              )}
            </div>
          </div>
        </Modal>

        {/* Rider Operational Action Modal (Approve, Reject, Suspend, Reactivate) */}
        <Modal
          isOpen={!!selectedRiderAction && !!riderActionModalType}
          onClose={() => {
            setSelectedRiderAction(null);
            setRiderActionModalType(null);
          }}
          title={
            riderActionModalType === "approve"
              ? `Approve Onboarding: ${selectedRiderAction?.firstName} ${selectedRiderAction?.lastName}`
              : riderActionModalType === "reject"
                ? `Reject Onboarding: ${selectedRiderAction?.firstName} ${selectedRiderAction?.lastName}`
                : riderActionModalType === "suspend"
                  ? `Suspend Courier: ${selectedRiderAction?.firstName} ${selectedRiderAction?.lastName}`
                  : `Reactivate Courier: ${selectedRiderAction?.firstName} ${selectedRiderAction?.lastName}`
          }
        >
          <div className="space-y-4 text-xs">
            {riderActionModalType === "approve" ? (
              <p className="text-slate-600">
                Approving this courier transitions their onboarding status from{" "}
                <strong>PENDING_REVIEW</strong> to <strong>APPROVED</strong>.
                This authorizes the courier to toggle online and receive
                delivery shift sessions.
              </p>
            ) : riderActionModalType === "reject" ? (
              <p className="text-slate-600">
                Rejecting onboarding will mark the courier application as
                rejected. Please provide an audit reason below.
              </p>
            ) : riderActionModalType === "suspend" ? (
              <p className="text-slate-600">
                Suspending this courier immediately revokes active dispatch
                shifts, removes them from the Redis candidate index, and
                prevents them from going online.
              </p>
            ) : (
              <p className="text-slate-600">
                Reactivating this courier restores their operational status to{" "}
                <strong>ACTIVE</strong>, enabling them to resume shifts.
              </p>
            )}

            {riderActionModalType !== "approve" && (
              <FormField label="Reason for Operational Action" required>
                <Input
                  value={riderActionReason}
                  onChange={(e) => setRiderActionReason(e.target.value)}
                  placeholder="Required for immutable audit logging"
                  required
                />
              </FormField>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedRiderAction(null);
                  setRiderActionModalType(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={
                  riderActionModalType === "reject" ||
                  riderActionModalType === "suspend"
                    ? "danger"
                    : "primary"
                }
                size="sm"
                onClick={handleRiderAction}
                isLoading={isProcessingRiderAction}
              >
                {riderActionModalType === "approve"
                  ? "Confirm Approval"
                  : riderActionModalType === "reject"
                    ? "Confirm Rejection"
                    : riderActionModalType === "suspend"
                      ? "Confirm Suspension"
                      : "Confirm Reactivation"}
              </Button>
            </div>
          </div>
        </Modal>
      </OperationsLayout>
    </ErrorBoundary>
  );
}
