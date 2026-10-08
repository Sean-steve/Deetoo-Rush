/**
 * Phase B1 adapter boundary; no UI consumes these endpoints yet.
 * Reuse DeeToo's cookie/CSRF/refresh-aware shared API client.
 * Unverified response shapes remain unknown until screen-specific mapping.
 */
import type { ApiResponse, CustomerProfile, CustomerAddress, Order, PublicRestaurantBranch, PublicRestaurantDetail, PublicRestaurantMenu, RestaurantCategory, RestaurantDiscoveryQuery, ServiceabilityCheckResult, EnrichedCart, CheckoutQuote, GenerateQuoteInput, CreateOrderInput, AddToCartInput, UpdateCartItemInput, AuthUser, Payment } from "@deetoo/types";
import type { DeetooApiClient } from "@deetoo/api-client";

export class ContractMismatchError extends Error {
  constructor(route:string) {super("Unexpected response from DeeToo API: "+route);this.name="ContractMismatchError";}
}
export class IntegrationUnavailableError extends Error {
  constructor(feature:string){super(feature+" has no verified customer API contract yet.");this.name="IntegrationUnavailableError";}
}
export function safeResourceId(value:string):string {
  if(typeof value!=="string"||!/^[a-zA-Z0-9_-]{1,128}$/.test(value))throw new TypeError("Invalid API resource identifier");
  return encodeURIComponent(value);
}
export async function responseData<T>(promise:Promise<ApiResponse<T>>,route:string):Promise<T> {
  const result=await promise;
  if(!result||!Object.prototype.hasOwnProperty.call(result,"data")||(result as {success?:boolean}).success===false)
    throw new ContractMismatchError(route);
  return result.data;
}
export type CustomerDeviceSession={id:string;current:boolean;ip_address?:string|null;device_info?:string|null;last_used_at?:string|null;created_at?:string|null;is_active:boolean};
export type CustomerSupportCategory="ORDER_ISSUE"|"PAYMENT_ISSUE"|"ACCOUNT_ISSUE"|"MERCHANT_ISSUE"|"RIDER_ISSUE"|"OTHER";
export type SupportRequest={category:CustomerSupportCategory;subject:string;description:string;order_id?:string;delivery_id?:string;payment_id?:string};
export type SupportMessageInput={body:string;media_ids?:string[]};
export type ResolutionDecision="ACCEPTED"|"DISPUTED";

/** A backend adapter never manufactures successful responses, prices, GPS or payment state. */
export function createCustomerGateway(client:DeetooApiClient){
  const request=<T>(route:string,options?:RequestInit&{idempotencyKey?:string}):Promise<T>=>
    responseData(client.request<T>(route,options),route);
  return {
    auth:{
      me:():Promise<AuthUser>=>responseData(client.getMe(),"/auth/me"),
      sessions:():Promise<CustomerDeviceSession[]>=>request("/auth/sessions"),
      revokeSession:(id:string)=>request<{message:string}>("/auth/sessions/"+safeResourceId(id)+"/revoke",{method:"POST"}),
      revokeAllSessions:()=>request<{message:string}>("/auth/sessions/revoke-all",{method:"POST"}),
    },
    discovery:{
      restaurants:(query:RestaurantDiscoveryQuery):Promise<PublicRestaurantBranch[]>=>responseData(client.discoverRestaurants(query),"/restaurants"),
      restaurant:(id:string,lat?:number,lng?:number):Promise<PublicRestaurantDetail>=>
        responseData(client.getRestaurantDetail(safeResourceId(id),lat,lng),"/restaurants/:id"),
      menu:(id:string):Promise<PublicRestaurantMenu>=>responseData(client.getPublicRestaurantMenu(safeResourceId(id)),"/public/branches/:id/menu"),
      categories:():Promise<RestaurantCategory[]>=>responseData(client.getRestaurantCategories(),"/restaurant-categories"),
      serviceability:(lat:number,lng:number):Promise<ServiceabilityCheckResult>=>
        responseData(client.checkServiceability(lat,lng),"/serviceability"),
    },
    cart:{
      read:():Promise<EnrichedCart|null>=>responseData(client.getActiveCart(),"/cart"),
      add:(input:AddToCartInput):Promise<EnrichedCart>=>responseData(client.addToCart(input),"/cart/items"),
      update:(id:string,input:UpdateCartItemInput):Promise<EnrichedCart>=>
        responseData(client.updateCartItem(safeResourceId(id),input),"/cart/items/:id"),
      remove:(id:string):Promise<EnrichedCart>=>responseData(client.removeCartItem(safeResourceId(id)),"/cart/items/:id"),
      clear:()=>responseData(client.clearCart(),"/cart"),
      promo:(code:string):Promise<EnrichedCart>=>responseData(client.applyPromoCode(code),"/cart/promo"),
      removePromo:():Promise<EnrichedCart>=>responseData(client.removePromoCode(),"/cart/promo"),
      quote:(input:GenerateQuoteInput):Promise<CheckoutQuote>=>responseData(client.generateCheckoutQuote(input),"/checkout/quote"),
      quoteById:(id:string):Promise<CheckoutQuote>=>responseData(client.getCheckoutQuote(safeResourceId(id)),"/checkout/quote/:id"),
    },
    orders:{
      create:(input:CreateOrderInput,key:string):Promise<Order>=>{
        if(!key||key.length<12)throw new TypeError("Order placement requires an idempotency key");
        return responseData(client.createOrder(input,key),"/orders");
      },
      list:(params?:{status?:string;limit?:number}):Promise<Order[]>=>responseData(client.getCustomerOrders(params),"/customer/orders"),
      detail:(id:string):Promise<Order>=>responseData(client.getCustomerOrderDetail(safeResourceId(id)),"/customer/orders/:id"),
      tracking:(id:string):Promise<unknown>=>request("/customer/orders/"+safeResourceId(id)+"/track"),
      delivery:(id:string):Promise<unknown|null>=>request("/customer/orders/"+safeResourceId(id)+"/delivery"),
      cancel:(id:string,reason:string,note?:string):Promise<Order>=>
        responseData(client.cancelCustomerOrder(safeResourceId(id),reason,note),"/customer/orders/:id/cancel"),
    },
    payments:{
      initiate:(orderId:string,method:"MPESA"|"CARD",key:string,phone?:string,paymentMethodToken?:string):Promise<Payment>=>{
        if(!key||key.length<12)throw new TypeError("Payment initiation requires an idempotency key");
        return request("/payments/initiate",{method:"POST",idempotencyKey:key,body:JSON.stringify({
          order_id:safeResourceId(orderId),method,...(phone?{phone}:{}),...(paymentMethodToken?{payment_method_token:paymentMethodToken}:{})
        })});
      },
      forOrder:(orderId:string):Promise<Payment[]>=>request("/payments/order/"+safeResourceId(orderId)),
    },
    account:{
      profile:():Promise<CustomerProfile>=>responseData(client.getCustomerProfile(),"/customer/profile"),
      updateProfile:(data:Partial<CustomerProfile>):Promise<CustomerProfile>=>responseData(client.updateCustomerProfile(data),"/customer/profile"),
      addresses:():Promise<CustomerAddress[]>=>responseData(client.getCustomerAddresses(),"/customer/addresses"),
      addAddress:(data:Parameters<DeetooApiClient["createCustomerAddress"]>[0]):Promise<CustomerAddress>=>
        responseData(client.createCustomerAddress(data),"/customer/addresses"),
      updateAddress:(id:string,data:Parameters<DeetooApiClient["updateCustomerAddress"]>[1]):Promise<CustomerAddress>=>
        responseData(client.updateCustomerAddress(safeResourceId(id),data),"/customer/addresses/:id"),
      removeAddress:(id:string)=>responseData(client.deleteCustomerAddress(safeResourceId(id)),"/customer/addresses/:id"),
      makeDefault:(id:string):Promise<CustomerAddress>=>
        responseData(client.setDefaultCustomerAddress(safeResourceId(id)),"/customer/addresses/:id/default"),
    },
    notifications:{
      list:():Promise<unknown>=>request("/customer/support/notifications"),
      markRead:(id:string):Promise<unknown>=>request("/customer/support/notifications/"+safeResourceId(id)+"/read",{method:"POST"}),
      preferences:():never=>{throw new IntegrationUnavailableError("Notification preferences");},
      markAllRead:():never=>{throw new IntegrationUnavailableError("Bulk notification read");},
    },
    support:{
      list:():Promise<unknown>=>request("/customer/support/cases"),
      detail:(id:string):Promise<unknown>=>request("/customer/support/cases/"+safeResourceId(id)),
      create:(input:SupportRequest):Promise<unknown>=>
        request("/customer/support/cases",{method:"POST",body:JSON.stringify(input)}),
      message:(id:string,input:SupportMessageInput):Promise<unknown>=>
        request("/customer/support/cases/"+safeResourceId(id)+"/notes",{method:"POST",body:JSON.stringify(input)}),
      resolutionResponse:(id:string,decision:ResolutionDecision,comment?:string):Promise<unknown>=>
        request("/customer/support/cases/"+safeResourceId(id)+"/resolution-response",
          {method:"POST",body:JSON.stringify({decision,comment})}),
      attachmentUrl:(id:string,mediaId:string):Promise<{url:string}>=>
        request("/customer/support/cases/"+safeResourceId(id)+"/attachments/"+safeResourceId(mediaId)+"/read-url"),
    }
  };
}
export type CustomerGateway=ReturnType<typeof createCustomerGateway>;
