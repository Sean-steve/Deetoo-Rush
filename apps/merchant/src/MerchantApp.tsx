import { BranchSettings } from "./components/BranchSettings";
import { MerchantAccount } from "./components/MerchantAccount";
import { AccountSupport } from "../../../packages/ui/src/AccountSupport";
import { KitchenOrders } from "./components/KitchenOrders";
import {
  OperationsLayout,
  Navigation,
  ResourceState,
  StatusBadge,
  useResource,
  errorMessage,
} from "../../../packages/ui/src/workflows";
import { MerchantFinance } from "./components/MerchantFinance";
/**
 * DEETOO - Merchant Application Shell
 * Restaurant operations console with authentication, branch scoping, and RBAC (Sprint 2)
 * Compliant with Section 29, 30 & DEE-PRD-001, DEE-SEC-001, DEE-STATE-001
 */

import React, { useState, useEffect } from "react";
import {
  DeetooLogo,
  Button,
  Card,
  Badge,
  Select,
  EmptyState,
  ErrorBoundary,
  Modal,
  FormField,
  Input,
} from "../../../packages/ui/src/index";
import { AuthProvider, useAuth } from "../../../packages/auth/src/react";
import {
  BranchOperationalStatus,
  UserRole,
} from "../../../packages/types/src/index";
import {
  Store,
  ChefHat,
  Bell,
  CheckCircle2,
  ShieldCheck,
  User,
  LogOut,
  Lock,
  AlertTriangle,
  History,
  Key,
  UtensilsCrossed,
} from "lucide-react";
import { CatalogueManager } from "./components/CatalogueManager";

type MerchantTab = "orders" | "catalogue" | "finance" | "account" | "branch" | "support" | "sessions";
const merchantTabPath:Record<MerchantTab,string>={
  orders:"/orders",
  catalogue:"/menu",
  finance:"/finance",
  account:"/business",
  branch:"/branch",
  support:"/support",
  sessions:"/security",
};
function merchantTabFromPath():MerchantTab{
  const path=window.location.pathname.replace(/^\/merchant/,"").replace(/\/+$/,"")||"/orders";
  if(path==="/menu"||path==="/catalogue")return "catalogue";
  if(path==="/finance")return "finance";
  if(path==="/business"||path==="/account")return "account";
  if(path==="/branch")return "branch";
  if(path==="/support")return "support";
  if(path==="/security"||path==="/sessions")return "sessions";
  return "orders";
}

export function MerchantApp() {
  return (
    <AuthProvider clientApp="merchant">
      <MerchantAppInner />
    </AuthProvider>
  );
}

function MerchantAppInner() {
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

  const [selectedBranch, setSelectedBranch] = useState("");
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [addBranchBusy, setAddBranchBusy] = useState(false);
  const [addBranchError, setAddBranchError] = useState<string | null>(null);
  const [newBranch, setNewBranch] = useState({
    name: "",
    address_line1: "",
    city: "Nairobi",
    region: "Nairobi",
    latitude: "",
    longitude: "",
  });
  const [storeStatus, setStoreStatus] = useState<BranchOperationalStatus>(
    BranchOperationalStatus.OPEN,
  );
  const [activeQueueTab, setActiveQueueTab] = useState<
    "PLACED" | "PREPARING" | "READY"
  >("PLACED");
  const [activeMainTab, setActiveMainTabState] = useState<MerchantTab>(()=>merchantTabFromPath());
  const setActiveMainTab=(tab:MerchantTab)=>{
    setActiveMainTabState(tab);
    const next=merchantTabPath[tab];
    if(window.location.pathname!==next)window.history.pushState({}, "", next);
  };
  useEffect(()=>{
    const sync=()=>setActiveMainTabState(merchantTabFromPath());
    window.addEventListener("popstate",sync);
    return()=>window.removeEventListener("popstate",sync);
  },[]);
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [prepMinutes, setPrepMinutes] = useState("20");

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sessions list
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const isMerchantAuthorized =
    hasRole(UserRole.MERCHANT_OWNER) ||
    hasRole(UserRole.MERCHANT_MANAGER) ||
    hasRole(UserRole.MERCHANT_STAFF) ||
    hasRole(UserRole.ADMIN);

  const canManageStoreStatus =
    hasRole(UserRole.MERCHANT_OWNER) ||
    hasRole(UserRole.MERCHANT_MANAGER) ||
    hasRole(UserRole.ADMIN) ||
    hasPermission("branch:status:update");

  // Branch creation is Owner-only on the backend (merchantScope(ownerOnly=true) in
  // merchant.router.ts) -- Manager/Staff correctly cannot create a branch, only edit one
  // they're already assigned to.
  const canCreateBranch = hasRole(UserRole.MERCHANT_OWNER) || hasRole(UserRole.ADMIN);

  const submitNewBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranch.name || !newBranch.address_line1 || !newBranch.latitude || !newBranch.longitude) {
      setAddBranchError("Name, address, latitude, and longitude are required");
      return;
    }
    const lat = parseFloat(newBranch.latitude);
    const lng = parseFloat(newBranch.longitude);
    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
      setAddBranchError("Latitude must be between -90 and 90, longitude between -180 and 180");
      return;
    }
    setAddBranchBusy(true);
    setAddBranchError(null);
    try {
      const res = await apiClient.request("/merchant/branches", {
        method: "POST",
        body: JSON.stringify({
          name: newBranch.name,
          address_line1: newBranch.address_line1,
          city: newBranch.city,
          region: newBranch.region,
          latitude: lat,
          longitude: lng,
        }),
      });
      setAddBranchOpen(false);
      setNewBranch({ name: "", address_line1: "", city: "Nairobi", region: "Nairobi", latitude: "", longitude: "" });
      await branches.refresh();
      const created = (res as any)?.data;
      if (created?.id) setSelectedBranch(created.id);
    } catch (err: any) {
      setAddBranchError(err?.message || "Failed to create branch");
    } finally {
      setAddBranchBusy(false);
    }
  };

  const branches = useResource<any[]>(
    isAuthenticated && isMerchantAuthorized ? "/merchant/branches" : null,
  );
  const branch = branches.data?.find((b) => b.id === selectedBranch);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  useEffect(() => {
    if (
      branches.data?.length &&
      !branches.data.some((b) => b.id === selectedBranch)
    )
      setSelectedBranch(branches.data[0].id);
  }, [branches.data, selectedBranch]);
  const updateStatus = async (status: string) => {
    setSavingStatus(true);
    setBranchError(null);
    try {
      await apiClient.request(
        `/merchant/branches/${encodeURIComponent(selectedBranch)}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            operational_status: status,
            reason: "Merchant kitchen status update",
          }),
        },
      );
      await branches.refresh();
    } catch (e) {
      setBranchError(errorMessage(e));
    } finally {
      setSavingStatus(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await login(loginIdentifier, loginPassword);
    } catch (err: any) {
      setAuthError(err.message || "Login failed");
    } finally {
      setIsSubmitting(false);
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

  const getStatusBadge = (status: BranchOperationalStatus) => {
    switch (status) {
      case BranchOperationalStatus.OPEN:
        return <Badge variant="success">STORE OPEN</Badge>;
      case BranchOperationalStatus.PAUSED:
        return <Badge variant="warning">PAUSED</Badge>;
      case BranchOperationalStatus.CLOSED:
        return <Badge variant="danger">CLOSED</Badge>;
      default:
        return <Badge>UNKNOWN</Badge>;
    }
  };

  // 1. UNFAUTHENTICATED STATE: Clean Merchant Login Portal
  if (!isAuthenticated) {
    return (
      <div className="portal-login-shell min-h-screen bg-canvas flex flex-col justify-center items-center p-4 font-sans text-ink">
        <div className="portal-login-wrap max-w-md w-full">
          <div className="text-center mb-8">
            <DeetooLogo className="h-10 mx-auto  mb-3" />
            <h1 className="text-xl font-bold text-ink tracking-tight">
              DeeToo for Restaurants
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Orders, menu, branches, finance and your restaurant team — in one workspace.
            </p>
          </div>

          <Card className="portal-login-card bg-white border-stone-200 p-6 text-ink shadow-2xl">
            <form onSubmit={handleLogin} className="space-y-4">
              {authError && (
                <div className="p-3 bg-rose-950/80 border border-rose-800 rounded text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle size={15} /> {authError}
                </div>
              )}

              <FormField label="Staff Email or Phone" required>
                <Input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="merchant.owner@deetoo.ke"
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
                Sign In to Restaurant Console
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // 2. FORBIDDEN ROLE STATE: User logged in without merchant permissions (e.g. customer)
  if (!isMerchantAuthorized) {
    return (
      <div className="portal-login-shell min-h-screen bg-canvas flex flex-col justify-center items-center p-4 font-sans text-ink">
        <Card className="max-w-md w-full bg-white border-stone-200 p-6 text-center">
          <Lock size={36} className="mx-auto text-rose-500 mb-3" />
          <h2 className="text-base font-bold text-ink">
            403 Forbidden: Insufficient Permissions
          </h2>
          <p className="text-xs text-slate-600 mt-2 mb-4 leading-relaxed">
            Your current account (
            <span className="font-mono text-ink">{user?.email}</span>) has
            roles: [
            <span className="text-amber-400 font-mono">
              {user?.roles.join(", ")}
            </span>
            ]. Access to the Merchant Operations Console requires an active
            Merchant role.
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

  // 3. AUTHENTICATED & AUTHORIZED OPERATIONAL CONSOLE
  return (
    <ErrorBoundary fallbackTitle="Merchant operations">
      <OperationsLayout
        title="Kitchen operations"
        userName={user?.name || user?.email}
        onLogout={logout}
        navigation={
          <Navigation
            active={activeMainTab}
            onChange={(id) => {
              setActiveMainTab(id as typeof activeMainTab);
              if (id === "sessions") void loadSessions();
            }}
            items={[
              { id: "orders", label: "Kitchen display" },
              { id: "catalogue", label: "Menu & availability" },
              { id: "finance", label: "Finance & settlements" },
              { id: "account", label: "Business & team" },
              { id: "branch", label: "Branch settings" },
              { id: "sessions", label: "Security & sessions" },
              { id: "support", label: "Support" },
            ]}
          />
        }
      >
        <ResourceState resource={branches}>
          <Card className="mb-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-48">
                <FormField label="Kitchen branch">
                  <Select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    <option value="">Select branch</option>
                    {branches.data?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              {canCreateBranch && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddBranchError(null);
                    setAddBranchOpen(true);
                  }}
                >
                  Add branch
                </Button>
              )}
              {branch && (
                <>
                  <StatusBadge status={branch.operational_status} />
                  <div className="flex gap-2">
                    {["OPEN", "PAUSED", "CLOSED"].map((status) => (
                      <Button
                        key={status}
                        variant="outline"
                        disabled={
                          !canManageStoreStatus ||
                          savingStatus ||
                          Boolean(branches.error)
                        }
                        onClick={() => updateStatus(status)}
                      >
                        {status.toLowerCase()}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {branchError && (
              <p role="alert" className="text-rose-700 mt-3">
                {branchError}
              </p>
            )}
          </Card>
        </ResourceState>
        {canCreateBranch && (
          <Modal
            isOpen={addBranchOpen}
            onClose={() => setAddBranchOpen(false)}
            title="Add branch"
          >
            <form onSubmit={submitNewBranch} className="space-y-4">
              <FormField label="Branch name" required>
                <Input
                  value={newBranch.name}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  placeholder="e.g., Mombasa Nyali Branch"
                  required
                />
              </FormField>
              <FormField label="Street address" required>
                <Input
                  value={newBranch.address_line1}
                  onChange={(e) => setNewBranch({ ...newBranch, address_line1: e.target.value })}
                  placeholder="e.g., Links Road, Nyali"
                  required
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="City">
                  <Input
                    value={newBranch.city}
                    onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                  />
                </FormField>
                <FormField label="Region">
                  <Input
                    value={newBranch.region}
                    onChange={(e) => setNewBranch({ ...newBranch, region: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Latitude" required>
                  <Input
                    type="number"
                    step="any"
                    value={newBranch.latitude}
                    onChange={(e) => setNewBranch({ ...newBranch, latitude: e.target.value })}
                    placeholder="e.g., -4.0435"
                    required
                  />
                </FormField>
                <FormField label="Longitude" required>
                  <Input
                    type="number"
                    step="any"
                    value={newBranch.longitude}
                    onChange={(e) => setNewBranch({ ...newBranch, longitude: e.target.value })}
                    placeholder="e.g., 39.6682"
                    required
                  />
                </FormField>
              </div>
              {addBranchError && (
                <p role="alert" className="text-rose-700">
                  {addBranchError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddBranchOpen(false)}
                  disabled={addBranchBusy}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addBranchBusy}>
                  {addBranchBusy ? "Creating..." : "Create branch"}
                </Button>
              </div>
            </form>
          </Modal>
        )}
        {selectedBranch && activeMainTab === "orders" && (
          <KitchenOrders key={selectedBranch} branchId={selectedBranch} />
        )}
        {selectedBranch && activeMainTab === "catalogue" && (
          <CatalogueManager
            key={selectedBranch}
            currentBranchId={selectedBranch}
            branches={branches.data || []}
          />
        )}
        {branch && activeMainTab === "branch" && (
          <BranchSettings
            key={branch.id}
            branchId={branch.id}
            canManage={canManageStoreStatus}
            onChanged={branches.refresh}
          />
        )}
        {branch && activeMainTab === "account" && (
          <MerchantAccount
            key={branch.merchant_id}
            merchantId={branch.merchant_id}
            branches={branches.data || []}
            canManage={canManageStoreStatus}
          />
        )}
        {activeMainTab === "support" && <AccountSupport />}
        {branch && activeMainTab === "finance" && (
          <MerchantFinance merchantId={branch.merchant_id} />
        )}
        {activeMainTab === "sessions" && (
          <Card className="bg-white">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <History size={16} className="text-brand" /> Merchant Staff
              Active Sessions
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Active login tokens for staff member {user?.email}. Revoking
              sessions invalidates all refresh tokens and active API tokens.
            </p>
            <div className="divide-y divide-slate-100 text-xs">
              {sessions.map((s) => (
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
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      IP: {s.ip_address || "127.0.0.1"} | Device:{" "}
                      {s.device_info || "Console"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </OperationsLayout>
    </ErrorBoundary>
  );
}
