/**
 * DEETOO - Shared API Client
 * Centralized fetch wrapper with automatic token management, 401 retry, and auth methods (Section 53)
 */

import {
  ApiResponse,
  ApiErrorResponse,
  SystemHealthResponse,
  AuthUser,
  LoginResponse,
  AuditLogEntry,
  UserRole,
  Menu,
  MenuCategory,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  PublicRestaurantMenu,
  MenuItemBranchOverride,
  EnrichedCategoryWithItems,
  CustomerProfile,
  CustomerAddress,
  RestaurantCategory,
  PublicRestaurantBranch,
  PublicRestaurantDetail,
  RestaurantDiscoveryQuery,
  ServiceabilityCheckResult,
  GeocodeResult,
  AutocompletePrediction,
  Order,
  CreateOrderInput,
  OrderFilterParams,
  RealtimeOrderEvent,
  Cart,
  EnrichedCart,
  CheckoutQuote,
  AddToCartInput,
  UpdateCartItemInput,
  GenerateQuoteInput,
} from "@deetoo/types";
import { generateRequestId } from "@deetoo/utils";

export interface ApiClientConfig {
  baseUrl: string;
  clientApp: "customer" | "merchant" | "rider" | "admin";
  clientVersion?: string;
  timeoutMs?: number;
  initialToken?: string | null;
  onUnauthorized?: () => void;
  onTokenRefreshed?: (newToken: string) => void;
  authTransport?: "cookie" | "bearer";
}

export class DeetooApiClient {
  private baseUrl: string;
  private clientApp: string;
  private clientVersion: string;
  private timeoutMs: number;
  private accessToken: string | null = null;
  private authTransport: "cookie" | "bearer";
  private onUnauthorized?: () => void;
  private onTokenRefreshed?: (newToken: string) => void;

  // Refresh queue locking to avoid stampede on 401
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string | null) => void> = [];

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.clientApp = config.clientApp;
    this.clientVersion = config.clientVersion || "1.0.0";
    this.timeoutMs = config.timeoutMs || 10000;
    this.accessToken = config.initialToken || null;
    this.authTransport = config.authTransport || "bearer";
    this.onUnauthorized = config.onUnauthorized;
    this.onTokenRefreshed = config.onTokenRefreshed;
  }

  public setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  private onRefreshed(token: string | null) {
    this.refreshSubscribers.forEach((cb) => cb(token));
    this.refreshSubscribers = [];
  }

  private subscribeTokenRefresh(cb: (token: string | null) => void) {
    this.refreshSubscribers.push(cb);
  }

  private readBrowserCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const prefix = `${name}=`;
    const part = document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix));
    return part ? decodeURIComponent(part.slice(prefix.length)) : null;
  }

  public async request<T>(
    endpoint: string,
    options: RequestInit & { idempotencyKey?: string; _retry?: boolean } = {},
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    const requestId = generateRequestId();
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    headers.set("X-Request-Id", requestId);
    headers.set("X-Client-App", this.clientApp);
    headers.set("X-Client-Version", this.clientVersion);
    headers.set("X-Auth-Transport", this.authTransport);

    if (
      this.authTransport === "cookie" &&
      !["GET", "HEAD", "OPTIONS"].includes((options.method || "GET").toUpperCase())
    ) {
      const csrfToken = this.readBrowserCookie("deetoo_csrf");
      if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
    }

    if (options.idempotencyKey) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }

    if (
      !headers.has("Content-Type") &&
      options.body &&
      typeof options.body === "string"
    ) {
      headers.set("Content-Type", "application/json");
    }

    // Native/bearer clients attach the short-lived access token. Browser clients
    // authenticate with HttpOnly cookies and never expose that token to JavaScript.
    if (
      this.authTransport === "bearer" &&
      this.accessToken &&
      !headers.has("Authorization")
    ) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include", // Include HttpOnly cookies (for refresh token)
        signal: controller.signal,
      });

      const responseText = await response.text();
      let parsedBody: any;
      try {
        parsedBody = responseText ? JSON.parse(responseText) : {};
      } catch {
        parsedBody = { raw: responseText };
      }

      // Handle 401 Unauthorized with Automatic Refresh & Retry (Section 53)
      if (
        response.status === 401 &&
        !options._retry &&
        !endpoint.includes("/auth/login") &&
        !endpoint.includes("/auth/refresh") &&
        !endpoint.includes("/auth/register")
      ) {
        if (!this.isRefreshing) {
          this.isRefreshing = true;
          try {
            const refreshRes = await this.refreshToken();
            const newToken = refreshRes.data.accessToken;
            const refreshMarker =
              this.authTransport === "cookie" ? "__COOKIE_SESSION__" : newToken || null;
            if (this.authTransport === "bearer" && newToken) {
              this.setAccessToken(newToken);
              if (this.onTokenRefreshed) this.onTokenRefreshed(newToken);
            }
            this.isRefreshing = false;
            this.onRefreshed(refreshMarker);
            return this.request<T>(endpoint, { ...options, _retry: true });
          } catch (refreshErr) {
            this.isRefreshing = false;
            this.setAccessToken(null);
            this.onRefreshed(null);
            if (this.onUnauthorized) {
              this.onUnauthorized();
            }
            throw refreshErr;
          }
        } else {
          // Wait for ongoing refresh to complete
          return new Promise<ApiResponse<T>>((resolve, reject) => {
            this.subscribeTokenRefresh((newToken) => {
              if (newToken) {
                resolve(
                  this.request<T>(endpoint, { ...options, _retry: true }),
                );
              } else {
                reject({
                  error: {
                    code: "UNAUTHORIZED",
                    message: "Session expired. Please re-authenticate.",
                    request_id: requestId,
                  },
                });
              }
            });
          });
        }
      }

      if (!response.ok) {
        const errorDetail: ApiErrorResponse = parsedBody.error
          ? parsedBody
          : {
              error: {
                code: `HTTP_${response.status}`,
                message:
                  parsedBody.message ||
                  response.statusText ||
                  "API Request Failed",
                details: parsedBody,
                request_id: headers.get("X-Request-Id") || requestId,
              },
            };
        throw errorDetail;
      }

      // Return standard response structure
      if (parsedBody && parsedBody.data !== undefined) {
        return parsedBody as ApiResponse<T>;
      }

      return {
        data: parsedBody as T,
        requestId: response.headers.get("x-request-id") || requestId,
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw {
          error: {
            code: "TIMEOUT",
            message: `Request timed out after ${this.timeoutMs}ms`,
            request_id: requestId,
          },
        };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ==========================================
  // Authentication Platform Methods (Section 53)
  // ==========================================

  public async login(params: {
    identifier: string;
    password: string;
    device_info?: string;
    device_id?: string;
  }): Promise<ApiResponse<LoginResponse>> {
    const res = await this.request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(params),
    });
    if (this.authTransport === "bearer" && res.data?.accessToken) {
      this.setAccessToken(res.data.accessToken);
    }
    return res;
  }

  public async registerCustomer(params: {
    name: string;
    email?: string;
    phone_e164?: string;
    password: string;
  }): Promise<ApiResponse<LoginResponse>> {
    const res = await this.request<LoginResponse>("/auth/register/customer", {
      method: "POST",
      body: JSON.stringify(params),
    });
    if (this.authTransport === "bearer" && res.data?.accessToken) {
      this.setAccessToken(res.data.accessToken);
    }
    return res;
  }

  public async logout(): Promise<ApiResponse<{ message: string }>> {
    try {
      const res = await this.request<{ message: string }>("/auth/logout", {
        method: "POST",
      });
      return res;
    } finally {
      this.setAccessToken(null);
    }
  }

  public async getMe(): Promise<ApiResponse<AuthUser>> {
    return this.request<AuthUser>("/auth/me", {
      method: "GET",
    });
  }

  public async refreshToken(
    explicitRefreshToken?: string,
  ): Promise<ApiResponse<{ accessToken?: string; session: any }>> {
    const res = await this.request<{ accessToken?: string; session: any }>(
      "/auth/refresh",
      {
        method: "POST",
        body: explicitRefreshToken
          ? JSON.stringify({ refreshToken: explicitRefreshToken })
          : undefined,
      },
    );
    if (this.authTransport === "bearer" && res.data?.accessToken) {
      this.setAccessToken(res.data.accessToken);
    }
    return res;
  }

  public async forgotPassword(
    identifier: string,
  ): Promise<ApiResponse<{ message: string; dev_token?: string }>> {
    return this.request<{ message: string; dev_token?: string }>(
      "/auth/password/forgot",
      {
        method: "POST",
        body: JSON.stringify({ identifier }),
      },
    );
  }

  public async resetPassword(params: {
    token: string;
    new_password: string;
  }): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>("/auth/password/reset", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  public async requestOtp(
    phone_e164: string,
    purpose = "VERIFICATION",
  ): Promise<ApiResponse<{ message: string; dev_otp?: string }>> {
    return this.request<{ message: string; dev_otp?: string }>(
      "/auth/verify/otp-request",
      {
        method: "POST",
        body: JSON.stringify({ phone_e164, purpose }),
      },
    );
  }

  public async confirmOtp(
    phone_e164: string,
    code: string,
  ): Promise<ApiResponse<{ verified: boolean; message: string }>> {
    return this.request<{ verified: boolean; message: string }>(
      "/auth/verify/otp-confirm",
      {
        method: "POST",
        body: JSON.stringify({ phone_e164, code }),
      },
    );
  }

  public async listSessions(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>("/auth/sessions", {
      method: "GET",
    });
  }

  public async revokeSession(
    sessionId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(
      `/auth/sessions/${sessionId}/revoke`,
      {
        method: "POST",
      },
    );
  }

  public async revokeAllSessions(): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>("/auth/sessions/revoke-all", {
      method: "POST",
    });
  }

  // ==========================================
  // Admin Operations Methods
  // ==========================================

  public async listUsers(params?: {
    role?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<AuthUser[]>> {
    const query = new URLSearchParams();
    if (params?.role) query.set("role", params.role);
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));

    return this.request<AuthUser[]>(`/admin/users?${query.toString()}`, {
      method: "GET",
    });
  }

  public async getUser(
    id: string,
  ): Promise<ApiResponse<{ user: AuthUser; sessions: any[] }>> {
    return this.request<{ user: AuthUser; sessions: any[] }>(
      `/admin/users/${id}`,
      {
        method: "GET",
      },
    );
  }

  public async suspendUser(
    id: string,
    reason?: string,
  ): Promise<ApiResponse<{ message: string; status: string }>> {
    return this.request<{ message: string; status: string }>(
      `/admin/users/${id}/suspend`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    );
  }

  public async reactivateUser(
    id: string,
    reason?: string,
  ): Promise<ApiResponse<{ message: string; status: string }>> {
    return this.request<{ message: string; status: string }>(
      `/admin/users/${id}/reactivate`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    );
  }

  public async updateUserRoles(
    id: string,
    roles: UserRole[],
  ): Promise<ApiResponse<AuthUser>> {
    return this.request<AuthUser>(`/admin/users/${id}/roles`, {
      method: "POST",
      body: JSON.stringify({ roles }),
    });
  }

  public async getAuditLogs(params?: {
    limit?: number;
    offset?: number;
    action?: string;
    actor_user_id?: string;
  }): Promise<ApiResponse<AuditLogEntry[]>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    if (params?.action) query.set("action", params.action);
    if (params?.actor_user_id) query.set("actor_user_id", params.actor_user_id);

    return this.request<AuditLogEntry[]>(`/admin/audit?${query.toString()}`, {
      method: "GET",
    });
  }

  // ==========================================
  // Sprint 4: Catalogue & Menu Management
  // ==========================================

  public async listMenus(merchantId?: string): Promise<ApiResponse<Menu[]>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<Menu[]>(`/merchant/menus${q}`, { method: "GET" });
  }

  public async getMenu(
    menuId: string,
    merchantId?: string,
  ): Promise<ApiResponse<Menu>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<Menu>(`/merchant/menus/${menuId}${q}`, {
      method: "GET",
    });
  }

  public async createMenu(
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<Menu>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<Menu>(`/merchant/menus${q}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public async updateMenu(
    menuId: string,
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<Menu>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<Menu>(`/merchant/menus/${menuId}${q}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  public async deleteMenu(
    menuId: string,
    merchantId?: string,
  ): Promise<ApiResponse<{ success: boolean; id: string }>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<{ success: boolean; id: string }>(
      `/merchant/menus/${menuId}${q}`,
      {
        method: "DELETE",
      },
    );
  }

  public async assignMenuBranches(
    menuId: string,
    branchIds: string[],
    merchantId?: string,
  ): Promise<ApiResponse<Menu>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<Menu>(`/merchant/menus/${menuId}/branches${q}`, {
      method: "POST",
      body: JSON.stringify({ branch_ids: branchIds }),
    });
  }

  public async listCategories(
    menuId: string,
    merchantId?: string,
  ): Promise<ApiResponse<MenuCategory[]>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuCategory[]>(
      `/merchant/menus/${menuId}/categories${q}`,
      { method: "GET" },
    );
  }

  public async createCategory(
    menuId: string,
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<MenuCategory>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuCategory>(
      `/merchant/menus/${menuId}/categories${q}`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  public async updateCategory(
    categoryId: string,
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<MenuCategory>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuCategory>(
      `/merchant/categories/${categoryId}${q}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  public async reorderCategories(
    menuId: string,
    categoryIds: string[],
    merchantId?: string,
  ): Promise<ApiResponse<MenuCategory[]>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuCategory[]>(
      `/merchant/menus/${menuId}/categories/reorder${q}`,
      {
        method: "POST",
        body: JSON.stringify({ category_ids: categoryIds }),
      },
    );
  }

  public async deleteCategory(
    categoryId: string,
    merchantId?: string,
  ): Promise<ApiResponse<{ success: boolean; id: string }>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<{ success: boolean; id: string }>(
      `/merchant/categories/${categoryId}${q}`,
      {
        method: "DELETE",
      },
    );
  }

  public async listItems(
    menuId: string,
    categoryId?: string,
    merchantId?: string,
  ): Promise<ApiResponse<MenuItem[]>> {
    const params = new URLSearchParams();
    if (merchantId) params.set("merchant_id", merchantId);
    if (categoryId) params.set("category_id", categoryId);
    const q = params.toString() ? `?${params.toString()}` : "";
    return this.request<MenuItem[]>(`/merchant/menus/${menuId}/items${q}`, {
      method: "GET",
    });
  }

  public async getItem(
    itemId: string,
    merchantId?: string,
  ): Promise<ApiResponse<MenuItem>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuItem>(`/merchant/items/${itemId}${q}`, {
      method: "GET",
    });
  }

  public async createItem(
    menuId: string,
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<MenuItem>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuItem>(`/merchant/menus/${menuId}/items${q}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public async updateItem(
    itemId: string,
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<MenuItem>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuItem>(`/merchant/items/${itemId}${q}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  public async reorderItems(
    categoryId: string,
    itemIds: string[],
    merchantId?: string,
  ): Promise<ApiResponse<MenuItem[]>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuItem[]>(
      `/merchant/categories/${categoryId}/items/reorder${q}`,
      {
        method: "POST",
        body: JSON.stringify({ item_ids: itemIds }),
      },
    );
  }

  public async deleteItem(
    itemId: string,
    merchantId?: string,
  ): Promise<ApiResponse<{ success: boolean; id: string }>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<{ success: boolean; id: string }>(
      `/merchant/items/${itemId}${q}`,
      {
        method: "DELETE",
      },
    );
  }

  public async updateItemAvailability(
    itemId: string,
    isAvailable: boolean,
    branchId?: string,
    merchantId?: string,
  ): Promise<ApiResponse<any>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<any>(`/merchant/items/${itemId}/availability${q}`, {
      method: "PATCH",
      body: JSON.stringify({ is_available: isAvailable, branch_id: branchId }),
    });
  }

  public async listModifierGroups(
    merchantId?: string,
  ): Promise<ApiResponse<ModifierGroup[]>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<ModifierGroup[]>(`/merchant/modifier-groups${q}`, {
      method: "GET",
    });
  }

  public async createModifierGroup(
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<ModifierGroup>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<ModifierGroup>(`/merchant/modifier-groups${q}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public async updateModifierGroup(
    groupId: string,
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<ModifierGroup>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<ModifierGroup>(
      `/merchant/modifier-groups/${groupId}${q}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  public async deleteModifierGroup(
    groupId: string,
    merchantId?: string,
  ): Promise<ApiResponse<{ success: boolean; id: string }>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<{ success: boolean; id: string }>(
      `/merchant/modifier-groups/${groupId}${q}`,
      {
        method: "DELETE",
      },
    );
  }

  public async attachModifierGroups(
    itemId: string,
    modifierGroupIds: string[],
    merchantId?: string,
  ): Promise<ApiResponse<MenuItem>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuItem>(
      `/merchant/items/${itemId}/modifier-groups${q}`,
      {
        method: "POST",
        body: JSON.stringify({ modifier_group_ids: modifierGroupIds }),
      },
    );
  }

  public async createModifierOption(
    groupId: string,
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<ModifierOption>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<ModifierOption>(
      `/merchant/modifier-groups/${groupId}/options${q}`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  public async updateModifierOption(
    optionId: string,
    input: any,
    merchantId?: string,
  ): Promise<ApiResponse<ModifierOption>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<ModifierOption>(
      `/merchant/modifier-options/${optionId}${q}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  public async reorderModifierOptions(
    groupId: string,
    optionIds: string[],
    merchantId?: string,
  ): Promise<ApiResponse<ModifierOption[]>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<ModifierOption[]>(
      `/merchant/modifier-groups/${groupId}/options/reorder${q}`,
      {
        method: "POST",
        body: JSON.stringify({ option_ids: optionIds }),
      },
    );
  }

  public async deleteModifierOption(
    optionId: string,
    merchantId?: string,
  ): Promise<ApiResponse<{ success: boolean; id: string }>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<{ success: boolean; id: string }>(
      `/merchant/modifier-options/${optionId}${q}`,
      {
        method: "DELETE",
      },
    );
  }

  public async updateModifierOptionAvailability(
    optionId: string,
    isAvailable: boolean,
    branchId?: string,
    merchantId?: string,
  ): Promise<ApiResponse<any>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<any>(
      `/merchant/modifier-options/${optionId}/availability${q}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          is_available: isAvailable,
          branch_id: branchId,
        }),
      },
    );
  }

  public async getBranchCatalogue(
    branchId: string,
    merchantId?: string,
  ): Promise<
    ApiResponse<{ menu: Menu; categories: EnrichedCategoryWithItems[] }>
  > {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<{
      menu: Menu;
      categories: EnrichedCategoryWithItems[];
    }>(`/merchant/branches/${branchId}/catalogue${q}`, {
      method: "GET",
    });
  }

  public async updateBranchItemOverride(
    branchId: string,
    itemId: string,
    override: { is_available?: boolean; price_override_minor?: number | null },
    merchantId?: string,
  ): Promise<ApiResponse<MenuItemBranchOverride>> {
    const q = merchantId ? `?merchant_id=${merchantId}` : "";
    return this.request<MenuItemBranchOverride>(
      `/merchant/branches/${branchId}/items/${itemId}/override${q}`,
      {
        method: "PUT",
        body: JSON.stringify(override),
      },
    );
  }

  public async getPublicRestaurantMenu(
    branchId: string,
  ): Promise<ApiResponse<PublicRestaurantMenu>> {
    return this.request<PublicRestaurantMenu>(
      `/public/branches/${branchId}/menu`,
      {
        method: "GET",
      },
    );
  }

  public async uploadImage(data: {
    url?: string;
    filename?: string;
  }): Promise<ApiResponse<{ image_url: string; storage_key: string }>> {
    return this.request<{ image_url: string; storage_key: string }>(
      "/merchant/upload-image",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  }

  // ==========================================
  // Customer & Discovery Methods (Sprint 5)
  // ==========================================

  public async getCustomerProfile(): Promise<ApiResponse<CustomerProfile>> {
    return this.request<CustomerProfile>("/customer/profile", {
      method: "GET",
    });
  }

  public async updateCustomerProfile(
    data: Partial<CustomerProfile>,
  ): Promise<ApiResponse<CustomerProfile>> {
    return this.request<CustomerProfile>("/customer/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  public async getCustomerAddresses(): Promise<ApiResponse<CustomerAddress[]>> {
    return this.request<CustomerAddress[]>("/customer/addresses", {
      method: "GET",
    });
  }

  public async createCustomerAddress(
    data: any,
  ): Promise<ApiResponse<CustomerAddress>> {
    return this.request<CustomerAddress>("/customer/addresses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async updateCustomerAddress(
    id: string,
    data: any,
  ): Promise<ApiResponse<CustomerAddress>> {
    return this.request<CustomerAddress>(`/customer/addresses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  public async deleteCustomerAddress(
    id: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/customer/addresses/${id}`, {
      method: "DELETE",
    });
  }

  public async setDefaultCustomerAddress(
    id: string,
  ): Promise<ApiResponse<CustomerAddress>> {
    return this.request<CustomerAddress>(`/customer/addresses/${id}/default`, {
      method: "POST",
    });
  }

  public async discoverRestaurants(
    query: RestaurantDiscoveryQuery = {},
  ): Promise<ApiResponse<PublicRestaurantBranch[]>> {
    const params = new URLSearchParams();
    if (query.latitude !== undefined)
      params.set("latitude", query.latitude.toString());
    if (query.longitude !== undefined)
      params.set("longitude", query.longitude.toString());
    if (query.search) params.set("search", query.search);
    if (query.category) params.set("category", query.category);
    if (query.open_now !== undefined)
      params.set("open_now", query.open_now ? "true" : "false");
    if (query.sort) params.set("sort", query.sort);
    if (query.page) params.set("page", query.page.toString());
    if (query.limit) params.set("limit", query.limit.toString());

    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request<PublicRestaurantBranch[]>(`/restaurants${qs}`, {
      method: "GET",
    });
  }

  public async getRestaurantDetail(
    branchId: string,
    lat?: number,
    lng?: number,
  ): Promise<ApiResponse<PublicRestaurantDetail>> {
    const params = new URLSearchParams();
    if (lat !== undefined) params.set("lat", lat.toString());
    if (lng !== undefined) params.set("lng", lng.toString());
    const qs = params.toString() ? `?${params.toString()}` : "";

    return this.request<PublicRestaurantDetail>(
      `/restaurants/${branchId}${qs}`,
      {
        method: "GET",
      },
    );
  }

  public async getRestaurantCategories(): Promise<
    ApiResponse<RestaurantCategory[]>
  > {
    return this.request<RestaurantCategory[]>("/restaurant-categories", {
      method: "GET",
    });
  }

  public async checkServiceability(
    lat: number,
    lng: number,
  ): Promise<ApiResponse<ServiceabilityCheckResult>> {
    return this.request<ServiceabilityCheckResult>(
      `/serviceability?lat=${lat}&lng=${lng}`,
      {
        method: "GET",
      },
    );
  }

  public async geocodeAddress(
    address: string,
  ): Promise<ApiResponse<GeocodeResult[]>> {
    return this.request<GeocodeResult[]>(
      `/maps/geocode?address=${encodeURIComponent(address)}`,
      {
        method: "GET",
      },
    );
  }

  public async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<ApiResponse<GeocodeResult>> {
    return this.request<GeocodeResult>(
      `/maps/reverse-geocode?lat=${lat}&lng=${lng}`,
      {
        method: "GET",
      },
    );
  }

  public async autocompleteAddress(
    input: string,
  ): Promise<ApiResponse<AutocompletePrediction[]>> {
    return this.request<AutocompletePrediction[]>(
      `/maps/autocomplete?input=${encodeURIComponent(input)}`,
      {
        method: "GET",
      },
    );
  }

  // ==========================================
  // Cart & Checkout Preparation Methods (Sprint 6)
  // ==========================================

  public async getActiveCart(): Promise<ApiResponse<EnrichedCart | null>> {
    return this.request<EnrichedCart | null>("/cart", {
      method: "GET",
    });
  }

  public async addToCart(
    input: AddToCartInput,
  ): Promise<ApiResponse<EnrichedCart>> {
    return this.request<EnrichedCart>("/cart/items", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public async updateCartItem(
    cartItemId: string,
    input: UpdateCartItemInput,
  ): Promise<ApiResponse<EnrichedCart>> {
    return this.request<EnrichedCart>(`/cart/items/${cartItemId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  public async removeCartItem(
    cartItemId: string,
  ): Promise<ApiResponse<EnrichedCart>> {
    return this.request<EnrichedCart>(`/cart/items/${cartItemId}`, {
      method: "DELETE",
    });
  }

  public async clearCart(): Promise<ApiResponse<{ cleared: boolean }>> {
    return this.request<{ cleared: boolean }>("/cart", {
      method: "DELETE",
    });
  }

  public async applyPromoCode(
    code: string,
  ): Promise<ApiResponse<EnrichedCart>> {
    return this.request<EnrichedCart>("/cart/promo", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  public async removePromoCode(): Promise<ApiResponse<EnrichedCart>> {
    return this.request<EnrichedCart>("/cart/promo", {
      method: "DELETE",
    });
  }

  public async generateCheckoutQuote(
    input: GenerateQuoteInput,
  ): Promise<ApiResponse<CheckoutQuote>> {
    return this.request<CheckoutQuote>("/checkout/quote", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public async getCheckoutQuote(
    quoteId: string,
  ): Promise<ApiResponse<CheckoutQuote>> {
    return this.request<CheckoutQuote>(`/checkout/quote/${quoteId}`, {
      method: "GET",
    });
  }

  // ==========================================
  // Core Order Engine Methods (Sprint 7)
  // ==========================================

  public async createOrder(
    input: CreateOrderInput,
    idempotencyKey?: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>("/orders", {
      method: "POST",
      body: JSON.stringify(input),
      idempotencyKey,
    });
  }

  public async getOrder(orderId: string): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/orders/${orderId}`, {
      method: "GET",
    });
  }

  public async cancelCustomerOrder(
    orderId: string,
    reasonCode?: string,
    note?: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/customer/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason_code: reasonCode, note }),
    });
  }

  public async getCustomerOrders(params?: {
    status?: string;
    limit?: number;
  }): Promise<ApiResponse<Order[]>> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", params.limit.toString());
    const queryStr = qs.toString() ? `?${qs.toString()}` : "";

    return this.request<Order[]>(`/customer/orders${queryStr}`, {
      method: "GET",
    });
  }

  public async getCustomerOrderDetail(
    orderId: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/customer/orders/${orderId}`, {
      method: "GET",
    });
  }

  // ==========================================
  // Merchant Order Workflow Methods (Sprint 7)
  // ==========================================

  public async getMerchantOrders(params?: {
    branchId?: string;
    status?: string;
    limit?: number;
  }): Promise<ApiResponse<Order[]>> {
    const qs = new URLSearchParams();
    if (params?.branchId) qs.set("branch_id", params.branchId);
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", params.limit.toString());
    const queryStr = qs.toString() ? `?${qs.toString()}` : "";

    return this.request<Order[]>(`/merchant/orders${queryStr}`, {
      method: "GET",
    });
  }

  public async getMerchantOrderDetail(
    orderId: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/merchant/orders/${orderId}`, {
      method: "GET",
    });
  }

  public async acceptMerchantOrder(
    orderId: string,
    preparationMinutes: number = 20,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/merchant/orders/${orderId}/accept`, {
      method: "POST",
      body: JSON.stringify({ preparation_minutes: preparationMinutes }),
    });
  }

  public async rejectMerchantOrder(
    orderId: string,
    reasonCode: string = "KITCHEN_OVERLOAD",
    note?: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/merchant/orders/${orderId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason_code: reasonCode, note }),
    });
  }

  public async markMerchantOrderPreparing(
    orderId: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/merchant/orders/${orderId}/preparing`, {
      method: "POST",
    });
  }

  public async markMerchantOrderReady(
    orderId: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/merchant/orders/${orderId}/ready`, {
      method: "POST",
    });
  }

  public async cancelMerchantOrder(
    orderId: string,
    reasonCode: string = "MERCHANT_CANCELLED",
    note?: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/merchant/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason_code: reasonCode, note }),
    });
  }

  // ==========================================
  // Admin Orders Operations Methods (Sprint 7)
  // ==========================================

  public async getAdminOrders(
    filters?: OrderFilterParams,
  ): Promise<ApiResponse<Order[]>> {
    const qs = new URLSearchParams();
    if (filters?.status) qs.set("status", filters.status);
    if (filters?.branch_id || filters?.branchId)
      qs.set("branch_id", filters.branch_id || filters.branchId || "");
    if (filters?.customer_id || filters?.customerId)
      qs.set("customer_id", filters.customer_id || filters.customerId || "");
    if (filters?.search) qs.set("search", filters.search);
    if (filters?.limit) qs.set("limit", filters.limit.toString());
    if (filters?.page) qs.set("page", filters.page.toString());
    const queryStr = qs.toString() ? `?${qs.toString()}` : "";

    return this.request<Order[]>(`/admin/orders${queryStr}`, {
      method: "GET",
    });
  }

  public async getAdminOrderDetail(
    orderId: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/admin/orders/${orderId}`, {
      method: "GET",
    });
  }

  public async cancelAdminOrder(
    orderId: string,
    reasonCode: string = "ADMIN_INTERVENTION",
    note?: string,
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/admin/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason_code: reasonCode, note }),
    });
  }

  // ==========================================
  // Realtime Events Polling & Helper
  // ==========================================

  public async getRealtimeEvents(
    channel?: string,
    since?: string,
  ): Promise<ApiResponse<RealtimeOrderEvent[]>> {
    const qs = new URLSearchParams();
    if (channel) qs.set("channel", channel);
    if (since) qs.set("since", since);
    const queryStr = qs.toString() ? `?${qs.toString()}` : "";

    return this.request<RealtimeOrderEvent[]>(`/realtime/events${queryStr}`, {
      method: "GET",
    });
  }

  /** Authenticated SSE; tokens are sent only in Authorization, never in URLs. */
  public async subscribeRealtime(
    channels: string[],
    signal: AbortSignal,
    onEvent: () => void,
    onConnected: () => void,
  ): Promise<void> {
    const token = this.getAccessToken();
    if (!token) throw new Error("Authentication required");
    const response = await fetch(
      `${this.baseUrl}/realtime/stream?channels=${encodeURIComponent(channels.join(","))}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        signal,
      },
    );
    if (!response.ok || !response.body)
      throw new Error(`Realtime subscription denied (${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    onConnected();
    try {
      while (!signal.aborted) {
        const result = await reader.read();
        if (result.done) return;
        buffer += decoder.decode(result.value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (
            message.startsWith("event:") &&
            !message.startsWith("event: connected")
          )
            onEvent();
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  public async getHealth(): Promise<SystemHealthResponse> {
    const rootBase = this.baseUrl.replace(/\/api\/v1$/, "");
    const res = await fetch(`${rootBase}/health/ready`, {
      headers: {
        Accept: "application/json",
        "X-Client-App": this.clientApp,
      },
    });
    return (await res.json()) as SystemHealthResponse;
  }
}
