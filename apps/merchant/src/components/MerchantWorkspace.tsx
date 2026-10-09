import React, { useEffect, useMemo, useState } from "react";
import { Bell, ChevronDown, ChevronsLeft, Clock3, LayoutDashboard, LifeBuoy, LogOut, Menu, Search, Settings2, ShieldCheck, Store, UserRound, UsersRound, Utensils, WalletCards, X, ChefHat } from "lucide-react";
import { DeetooLogo } from "../../../../packages/ui/src/index";
import { useResource } from "../../../../packages/ui/src/workflows";

type MerchantBranch = {
  id: string;
  name: string;
  address_line1?: string | null;
  address_text?: string | null;
  city?: string | null;
  operational_status?: string | null;
};
type MerchantWorkspaceProps = {
  active: string;
  onNavigate: (tab: string) => void;
  userName?: string;
  onLogout: () => void;
  branches: MerchantBranch[];
  branchId: string;
  onBranchChange: (id: string) => void;
  canManageStatus: boolean;
  statusBusy: boolean;
  onStatusChange: (status: string) => void;
  canCreateBranch: boolean;
  onAddBranch: () => void;
  children: React.ReactNode;
};

const links = [
  { id: "orders", label: "Kitchen orders", icon: ChefHat, group: "Operations" },
  { id: "catalogue", label: "Menu & availability", icon: Utensils, group: "Operations" },
  { id: "finance", label: "Finance & settlements", icon: WalletCards, group: "Business" },
  { id: "account", label: "Business & team", icon: UsersRound, group: "Business" },
  { id: "branch", label: "Branch settings", icon: Store, group: "Business" },
  { id: "sessions", label: "Security & sessions", icon: ShieldCheck, group: "Account" },
  { id: "notifications", label: "Notifications", icon: Bell, group: "Account" },
  { id: "support", label: "Support", icon: LifeBuoy, group: "Account" },
] as const;

export function MerchantWorkspace({
  active, onNavigate, userName, onLogout, branches, branchId, onBranchChange,
  canManageStatus, statusBusy, onStatusChange, canCreateBranch, onAddBranch, children,
}: MerchantWorkspaceProps) {
  const branch = branches.find((item) => item.id === branchId);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [storeMenu, setStoreMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const notifications = useResource<any>("/support/notifications", 30000);
  const unread = (notifications.data?.notifications || []).filter((item: any) => !item.read_at).length;
  const initials = (userName || "Merchant").split(/[\s@._-]+/).filter(Boolean).slice(0,2).map((word) => word[0].toUpperCase()).join("");
  const branchLocation = branch?.address_text || [branch?.address_line1, branch?.city].filter(Boolean).join(", ") || "Select a branch";
  const activeLabel = links.find((item) => item.id === active)?.label || "Kitchen orders";
  const results = useMemo(() => links.filter((item) => item.label.toLowerCase().includes(search.toLowerCase())), [search]);
  useEffect(() => { setMobileOpen(false); setStoreMenu(false); setUserMenu(false); }, [active]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("merchant-workspace-search")?.focus();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  return (
    <div className="merchant-v2">
      <aside className={`merchant-v2-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="merchant-v2-brand">
          <DeetooLogo className="h-11 w-auto" />
          <span>Merchant</span>
          <button type="button" className="merchant-v2-collapse" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><ChevronsLeft size={20} /></button>
        </div>
        <div className="merchant-v2-branch-picker">
          <span className="merchant-v2-branch-icon"><Store size={22}/></span>
          <label>
            <span className="sr-only">Operating branch</span>
            <select aria-label="Operating branch" value={branchId} onChange={(event) => onBranchChange(event.target.value)}>
              {!branchId && <option value="">Select branch</option>}
              {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <small title={branchLocation}>{branchLocation}</small>
          </label>
          <ChevronDown size={15} />
        </div>
        <nav className="merchant-v2-nav" aria-label="Merchant navigation">
          <button type="button" className="merchant-v2-overview" onClick={() => onNavigate("orders")}>
            <LayoutDashboard size={19} /><span>Overview</span>
          </button>
          {links.map((item, index) => {
            const Icon = item.icon;
            return <React.Fragment key={item.id}>
              {(index === 0 || links[index - 1]?.group !== item.group) && <span className="merchant-v2-group">{item.group}</span>}
              <button type="button" className={active === item.id ? "is-active" : ""} aria-current={active === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>
                <Icon size={19} /><span>{item.label}</span>
                {item.id === "notifications" && unread > 0 && <strong className="merchant-v2-unread">{unread > 99 ? "99+" : unread}</strong>}
              </button>
            </React.Fragment>;
          })}
        </nav>
        <div className="merchant-v2-account-card">
          <span className="merchant-v2-avatar">{initials}</span>
          <span className="merchant-v2-account-text"><strong title={userName}>{userName || "Merchant account"}</strong><small>Merchant workspace</small></span>
          <ChevronDown size={16}/>
        </div>
      </aside>
      {mobileOpen && <button type="button" className="merchant-v2-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <div className="merchant-v2-content">
        <header className="merchant-v2-topbar">
          <button type="button" className="merchant-v2-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={23}/></button>
          <div className="merchant-v2-global-search">
            <Search size={20} />
            <input id="merchant-workspace-search" autoComplete="off" value={search}
              onFocus={() => setSearchOpen(true)} onChange={(event) => {setSearch(event.target.value);setSearchOpen(true);}}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0]) { onNavigate(results[0].id); setSearch(""); setSearchOpen(false); }
              }}
              placeholder="Search pages, settings or tools..." aria-label="Search merchant pages"/>
            <kbd>Ctrl K</kbd>
            {searchOpen && search.length > 0 && <div className="merchant-v2-search-results" role="listbox">
              {results.length ? results.map((item) => <button key={item.id} type="button" onClick={() => { onNavigate(item.id);setSearch("");setSearchOpen(false); }}>{item.label}</button>) : <p>No matching pages</p>}
            </div>}
          </div>
          <div className="merchant-v2-top-actions">
            <div className="merchant-v2-dropdown">
              <button type="button" className="merchant-v2-store-pill" onClick={() => setStoreMenu(!storeMenu)} aria-expanded={storeMenu}>
                <i className={branch?.operational_status === "OPEN" ? "is-open" : "is-off"} />Store {branch?.operational_status?.toLowerCase() || "unknown"} <ChevronDown size={16}/>
              </button>
              {storeMenu && <div className="merchant-v2-menu" role="group" aria-label="Store status">
                {["OPEN","PAUSED","CLOSED"].map((status) => <button key={status} type="button" disabled={!canManageStatus || statusBusy || !branchId} aria-pressed={branch?.operational_status === status} onClick={() => { onStatusChange(status);setStoreMenu(false); }}>{status.charAt(0) + status.slice(1).toLowerCase()}</button>)}
                <button type="button" onClick={() => {onNavigate("branch");setStoreMenu(false);}}><Clock3 size={15}/>Branch settings & hours</button>
              </div>}
            </div>
            <button type="button" className="merchant-v2-bell" onClick={() => onNavigate("notifications")} aria-label={`Notifications (${unread} unread)`}><Bell size={20}/>{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</button>
            <div className="merchant-v2-dropdown">
              <button type="button" className="merchant-v2-user-menu-trigger" onClick={() => setUserMenu(!userMenu)} aria-expanded={userMenu}><span className="merchant-v2-avatar">{initials}</span><span>{userName || "Merchant"}</span><ChevronDown size={16}/></button>
              {userMenu && <div className="merchant-v2-menu is-right">
                <button type="button" onClick={() => onNavigate("account")}><UserRound size={15}/>Business & team</button>
                <button type="button" onClick={() => onNavigate("sessions")}><ShieldCheck size={15}/>Security & sessions</button>
                <button type="button" onClick={onLogout}><LogOut size={15}/>Sign out</button>
              </div>}
            </div>
          </div>
        </header>
        <main className="merchant-v2-main" data-merchant-page={active}>
          {branch && !["finance","notifications","support"].includes(active) && <div className="merchant-v2-branch-card" aria-label="Selected branch">
            <div className="merchant-v2-branch-art"><Store size={24}/></div>
            <div className="merchant-v2-branch-card-text"><strong>{branch.name}</strong><small>{branchLocation}</small></div>
            <span className={`merchant-v2-state ${branch.operational_status === "OPEN" ? "is-active" : ""}`}>{branch.operational_status || "Unknown"}</span>
            <button type="button" className="merchant-v2-branch-action" onClick={() => onNavigate("branch")}><Clock3 size={15}/>{active === "branch" ? "Branch details" : "Adjust hours"}</button>
          </div>}
          {children}
          {canCreateBranch && active === "branch" && <button type="button" className="merchant-v2-add-branch" onClick={onAddBranch}>+ Add another branch</button>}
        </main>
      </div>
    </div>
  );
}
