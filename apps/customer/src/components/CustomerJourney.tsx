import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Select,
  Price,
  Countdown,
  InlineBanner,
  ProgressSteps,
  StickyActionBar,
} from "../../../../packages/ui/src/index";
import {
  LocationMap,
  type MapPoint,
} from "../../../../packages/ui/src/LocationMap";
import {
  errorMessage,
  PageHeading,
  PriceBreakdown,
  ResourceState,
  StatusBadge,
  Timeline,
  useResource,
} from "../../../../packages/ui/src/workflows";
import {
  CustomerAddress,
  EnrichedCart,
  CheckoutQuote,
  Order,
  Payment,
  PublicRestaurantBranch,
} from "@deetoo/types";
import { PaymentInitiateSchema } from "@deetoo/validation";
import {
  Bike,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Store,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";

const deliveryProgressSteps = [
  { id: "confirmed", label: "Confirmed", description: "Payment and kitchen confirmation" },
  { id: "preparing", label: "Preparing", description: "Your order is being prepared" },
  { id: "collecting", label: "Rider collecting", description: "Courier assigned or at the restaurant" },
  { id: "on_way", label: "On the way", description: "Your order is travelling to you" },
  { id: "delivered", label: "Delivered", description: "Handover complete" },
];

export function customerProgressStage(orderStatus?: string, deliveryStatus?: string): string {
  if (orderStatus === "COMPLETED" || deliveryStatus === "DELIVERED") return "delivered";
  if (["PICKED_UP", "EN_ROUTE", "ARRIVED_DROPOFF"].includes(deliveryStatus || "")) return "on_way";
  if (["ASSIGNED", "OFFERED", "ARRIVED_PICKUP"].includes(deliveryStatus || "")) return "collecting";
  if (["ACCEPTED", "PREPARING", "READY"].includes(orderStatus || "")) return "preparing";
  return "confirmed";
}

export function CustomerJourney({
  view,
  addresses,
  onBrowse,
  onAddress,
  onCartChange,
  suggestedRestaurants = [],
  onSelectRestaurant,
}: {
  view: "cart" | "orders";
  addresses: CustomerAddress[];
  onBrowse: () => void;
  onAddress: () => void;
  onCartChange: () => void;
  suggestedRestaurants?: PublicRestaurantBranch[];
  onSelectRestaurant?: (branchId: string) => void;
}) {
  const { apiClient, user } = useAuth();
  const cart = useResource<EnrichedCart>("/cart");
  const orders = useResource<Order[]>(
    view === "orders" ? "/customer/orders" : null,
    5000,
  );
  const [addressId, setAddressId] = useState("");
  const [promo, setPromo] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"MPESA" | "CARD">("MPESA");
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [orderFilter, setOrderFilter] = useState<"all" | "active" | "completed" | "cancelled">("all");
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const mutateCart = (fn: () => Promise<unknown>) =>
    action(async () => {
      setQuote(null);
      setQuoteExpired(false);
      key.current = null;
      await fn();
      await cart.refresh();
      onCartChange();
    });
  if (orderId)
    return (
      <CustomerOrder
        orderId={orderId}
        onBack={() => {
          setOrderId(null);
          void cart.refresh();
          void orders.refresh();
        }}
      />
    );
  if (view === "orders")
    return (
      <>
        <PageHeading
          title="Your orders"
          eyebrow="From kitchen to doorstep"
          action={
            <Button variant="outline" onClick={orders.refresh}>
              Refresh
            </Button>
          }
        />
        <div className="customer-order-filters" aria-label="Filter your orders">
          {(["all", "active", "completed", "cancelled"] as const).map((filter) => (
            <button key={filter} type="button" aria-pressed={orderFilter === filter} onClick={() => setOrderFilter(filter)}>
              {filter === "all" ? "All orders" : filter === "active" ? "Active" : filter === "completed" ? "Past orders" : "Cancelled"}
            </button>
          ))}
        </div>
        <ResourceState resource={orders}>
          <div className="customer-order-list">
            {orders.data?.filter((order) => {
              if (orderFilter === "all") return true;
              if (orderFilter === "completed") return order.status === "COMPLETED";
              if (orderFilter === "cancelled") return ["CANCELLED", "REJECTED"].includes(order.status);
              return !["COMPLETED", "CANCELLED", "REJECTED"].includes(order.status);
            }).map((order) => (
              <Card key={order.id} className="customer-order-card">
                <div className="customer-order-line">
                  <div>
                    <h2 className="font-bold">{order.order_number}</h2>
                    <p className="text-sm text-slate-500 mt-1">{order.branch_name}</p>
                    <div className="mt-2"><StatusBadge status={order.status} /></div>
                  </div>
                  <div className="text-right">
                    <strong className="block text-lg"><Price minor={order.total_minor} /></strong>
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => setOrderId(order.id)}
                    >
                      View details <ArrowRight size={15} className="ml-1" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {orders.data?.length === 0 && (
              <EmptyState
                title="No orders yet"
                description="Your orders and delivery updates will appear here."
                action={<Button onClick={onBrowse}>Explore kitchens</Button>}
              />
            )}
          </div>
        </ResourceState>
      </>
    );
  const expired = Boolean(
    quote &&
      (quoteExpired || new Date(quote.expires_at).getTime() <= Date.now()),
  );
  const selectedAddress = addresses.find((address) => address.id === addressId);

  const reviewCheckout = () =>
    action(async () => {
      const result = await apiClient.generateCheckoutQuote({
        address_id: addressId,
        notes,
        payment_method: paymentMethod,
      });
      setQuote(result.data);
      setQuoteExpired(false);
      key.current = crypto.randomUUID();
    });

  const placeOrder = () =>
    quote
      ? action(async () => {
          key.current ||= crypto.randomUUID();
          const result = await apiClient.createOrder(
            {
              quote_id: quote.quote_id,
              special_instructions: notes,
            },
            key.current,
          );
          setOrderId(result.data.id);
          setQuote(null);
          setQuoteExpired(false);
          onCartChange();
        })
      : Promise.resolve();

  return (
    <section className={`customer-cart-view ${quote ? "customer-cart-review" : ""}`}>
      <PageHeading title={quote ? "Checkout · Review & place order" : "Your bag"} eyebrow="Made for your cravings" />
      {error && <ErrorState message={error} />}
      <ResourceState resource={cart}>
        {!cart.error && !cart.loading && !cart.data?.items?.length ? (
          <div className="customer-empty-bag" role="status">
            <div className="customer-empty-bag-art"><ShoppingBag strokeWidth={1.4} aria-hidden="true" /></div>
            <h2>Your bag is empty</h2>
            <p>Looks like you haven't added any delicious items yet. Explore nearby restaurants to start your order.</p>
            <Button onClick={onBrowse}><ArrowRight size={17} className="mr-2"/> Explore restaurants</Button>
            {suggestedRestaurants.length > 0 && (
              <section className="customer-empty-suggestions" aria-label="Restaurants near your delivery area">
                <header><h3>Popular near you</h3><button type="button" onClick={onBrowse}>View all <ArrowRight size={14}/></button></header>
                <p>Restaurants currently available around your selected delivery location.</p>
                <div className="customer-empty-suggestion-grid">
                  {suggestedRestaurants.slice(0,4).map(restaurant => (
                    <button
                      key={restaurant.branch_id}
                      type="button"
                      onClick={() => onSelectRestaurant?.(restaurant.branch_id)}
                      className="customer-empty-suggestion"
                    >
                      <div className="customer-empty-suggestion-image">
                        {(restaurant.cover_url || restaurant.logo_url)
                          ? <img src={restaurant.cover_url || restaurant.logo_url} alt="" />
                          : <ShoppingBag size={33} strokeWidth={1.4}/>}
                        <span>{restaurant.is_open_now ? "Open" : "Closed"}</span>
                      </div>
                      <div><strong>{restaurant.merchant_name}</strong><small>{restaurant.categories.slice(0,3).join(" · ")}</small><small>{restaurant.branch_name}{restaurant.distance_km != null ? ` · ${restaurant.distance_km.toFixed(1)} km` : ""}</small></div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          cart.data && (
            <div className="workflow-grid">
              <section className="space-y-4 customer-cart-items">
                <h2 className="text-xl font-bold">
                  {cart.data.branch.merchant_name} · {cart.data.branch.name}
                </h2>
                {cart.data.items.map((item) => (
                  <Card key={item.id} className="customer-cart-item">
                    <div className="flex gap-4">
                      {item.item_image_url && (
                        <img
                          src={item.item_image_url}
                          alt=""
                          className="w-20 h-20 rounded-xl object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="font-bold">{item.item_name}</h3>
                        <p className="text-xs text-slate-500">
                          {item.modifiers.map((m) => m.option_name).join(", ")}
                        </p>
                        <Price minor={item.line_total_minor} />
                        <div className="flex gap-2 items-center mt-3">
                          <Button
                            aria-label={`Decrease ${item.item_name}`}
                            disabled={busy || item.quantity <= 1}
                            variant="outline"
                            onClick={() =>
                              mutateCart(() =>
                                apiClient.updateCartItem(item.id, {
                                  quantity: item.quantity - 1,
                                }),
                              )
                            }
                          >
                            −
                          </Button>
                          <span>{item.quantity}</span>
                          <Button
                            aria-label={`Increase ${item.item_name}`}
                            disabled={busy}
                            variant="outline"
                            onClick={() =>
                              mutateCart(() =>
                                apiClient.updateCartItem(item.id, {
                                  quantity: item.quantity + 1,
                                }),
                              )
                            }
                          >
                            +
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              mutateCart(() =>
                                apiClient.removeCartItem(item.id),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                <Button variant="outline" onClick={onBrowse} className="customer-continue-shopping">
                  <ArrowRight size={17} className="mr-2" /> Browse more items
                </Button>
                {cart.data.warnings.map((warning, i) => (
                  <p
                    role="status"
                    key={i}
                    className="p-3 rounded-xl bg-amber-50 text-amber-900"
                  >
                    {warning.message}
                  </p>
                ))}
                <Card>
                  <FormField label="Promotion code">
                    <Input
                      value={promo}
                      onChange={(e) => setPromo(e.target.value)}
                    />
                  </FormField>
                  <Button
                    className="mt-3"
                    disabled={busy || !promo.trim()}
                    onClick={() =>
                      mutateCart(() => apiClient.applyPromoCode(promo.trim()))
                    }
                  >
                    Apply code
                  </Button>
                  {cart.data.applied_promo && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        mutateCart(() => apiClient.removePromoCode())
                      }
                    >
                      Remove {cart.data.applied_promo.code}
                    </Button>
                  )}
                </Card>
              </section>
              <Card className="customer-checkout-card h-fit">
                <div className="customer-checkout-heading">
                  <div>
                    <p className="eyebrow">Checkout</p>
                    <h2>Confirm the important details</h2>
                  </div>
                  <ShieldCheck size={22} aria-hidden="true" />
                </div>

                <div className="customer-checkout-decisions">
                  <section className="customer-checkout-decision">
                    <div className="customer-checkout-decision-icon">
                      <MapPin size={18} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="customer-checkout-decision-title">
                        <strong>Delivery address</strong>
                        {selectedAddress && <CheckCircle2 size={16} aria-label="Confirmed" />}
                      </div>
                      <FormField label="Choose where to deliver">
                        <Select
                          value={addressId}
                          onChange={(event) => {
                            setAddressId(event.target.value);
                            setQuote(null);
                            setQuoteExpired(false);
                            key.current = null;
                          }}
                        >
                          <option value="">Choose an address</option>
                          {addresses.map((address) => (
                            <option key={address.id} value={address.id}>
                              {address.label}: {address.address_line1}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <Button variant="ghost" size="sm" onClick={onAddress}>
                        Add another address
                      </Button>
                    </div>
                  </section>

                  <section className="customer-checkout-decision">
                    <div className="customer-checkout-decision-icon">
                      <Store size={18} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="customer-checkout-decision-title">
                        <strong>Delivery instructions</strong>
                        {notes.trim() && <CheckCircle2 size={16} aria-label="Added" />}
                      </div>
                      <FormField label="Notes for the Rider">
                        <Input
                          value={notes}
                          placeholder="Gate, floor, landmark or handover note"
                          onChange={(event) => {
                            setNotes(event.target.value);
                            setQuote(null);
                            setQuoteExpired(false);
                            key.current = null;
                          }}
                        />
                      </FormField>
                    </div>
                  </section>

                  <section className="customer-checkout-decision">
                    <div className="customer-checkout-decision-icon">
                      <ShieldCheck size={18} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="customer-checkout-decision-title">
                        <strong>Payment method</strong>
                        <CheckCircle2 size={16} aria-label="Confirmed" />
                      </div>
                      <FormField label="How you want to pay">
                        <Select
                          value={paymentMethod}
                          disabled={busy}
                          onChange={(event) => {
                            setPaymentMethod(event.target.value as "MPESA" | "CARD");
                            setQuote(null);
                            setQuoteExpired(false);
                            key.current = null;
                          }}
                        >
                          <option value="MPESA">M-PESA</option>
                          <option value="CARD">Card</option>
                        </Select>
                      </FormField>
                    </div>
                  </section>
                </div>

                <section className="customer-checkout-summary">
                  <div className="customer-checkout-summary-heading">
                    <strong>{quote ? "Confirmed price" : "Estimated price"}</strong>
                    {quote && !expired && (
                      <span className="customer-quote-countdown">
                        Price confirmed for{" "}
                        <Countdown
                          expiresAt={quote.expires_at}
                          warningAtSeconds={60}
                          onExpire={() => setQuoteExpired(true)}
                        />
                      </span>
                    )}
                  </div>

                  {quote ? (
                    <>
                      <PriceBreakdown
                        rows={[
                          ["Subtotal", quote.gross_subtotal_minor],
                          ["Discount", -quote.discount_minor],
                          ["Delivery", quote.delivery_fee_minor],
                          [
                            "Service fee",
                            quote.service_fee_minor -
                              (quote.pricing_rule_snapshot?.rounding_adjustment_minor || 0),
                          ],
                          [
                            "M-PESA rounding",
                            quote.pricing_rule_snapshot?.rounding_adjustment_minor || 0,
                          ],
                          ["Tax", quote.tax_minor],
                          ["Total", quote.total_minor],
                        ]}
                      />
                      {expired && (
                        <InlineBanner kind="warning">
                          This confirmed price expired. Refresh it before placing the order.
                        </InlineBanner>
                      )}
                    </>
                  ) : (
                    <PriceBreakdown
                      rows={[
                        ["Subtotal", cart.data.pricing.subtotal_minor],
                        [
                          "Estimated delivery",
                          cart.data.pricing.estimated_delivery_fee_minor,
                        ],
                        [
                          "Estimated service fee",
                          cart.data.pricing.estimated_service_fee_minor,
                        ],
                        ["Discount", -cart.data.pricing.discount_minor],
                        ["Estimated total", cart.data.pricing.estimated_total_minor],
                      ]}
                    />
                  )}
                </section>

                <StickyActionBar
                  secondary={
                    quote && !expired ? (
                      <Button
                        variant="ghost"
                        disabled={busy || !addressId}
                        onClick={() => void reviewCheckout()}
                      >
                        Refresh price
                      </Button>
                    ) : undefined
                  }
                  primary={
                    quote && !expired ? (
                      <Button
                        fullWidth
                        isLoading={busy}
                        disabled={busy}
                        onClick={() => void placeOrder()}
                      >
                        Place order · <Price minor={quote.total_minor} />
                      </Button>
                    ) : (
                      <Button
                        fullWidth
                        isLoading={busy}
                        disabled={busy || !addressId}
                        onClick={() => void reviewCheckout()}
                      >
                        {quote ? "Refresh confirmed price" : "Review checkout"}
                      </Button>
                    )
                  }
                />
              </Card>
            </div>
          )
        )}
      </ResourceState>
    </section>
  );
}

export function CustomerOrder({
  orderId,
  onBack,
}: {
  orderId: string;
  onBack: () => void;
}) {
  const { apiClient } = useAuth();
  const order = useResource<Order>(
    `/orders/${encodeURIComponent(orderId)}`,
    5000,
    `order:${orderId}`,
  );
  const trackingMessage = order.data && ({
    PENDING_PAYMENT: "Delivery tracking starts after payment is confirmed and the kitchen accepts your order.",
    PAYMENT_PENDING: "Delivery tracking starts after payment is confirmed and the kitchen accepts your order.",
    PLACED: "Payment confirmed. Waiting for the kitchen to accept your order.",
    CANCELLED: "This order was cancelled. Live delivery tracking has stopped.",
    REJECTED: "The kitchen declined this order. Live delivery tracking has stopped.",
    COMPLETED: "This order is complete. Live delivery tracking has ended.",
  } as Record<string, string>)[order.data.status];
  // Rider GPS can change without an order-state event; keep location polling active.
  const tracking = useResource<any>(
    order.data && !trackingMessage ? `/orders/${encodeURIComponent(orderId)}/track` : null,
    5000,
  );
  const payments = useResource<Payment[]>(
    `/orders/${encodeURIComponent(orderId)}/payments`,
    5000,
  );
  const authoritativeAmount = useResource<any>(
    `/trust/orders/${encodeURIComponent(orderId)}/authoritative-amount`,
    5000,
  );
  const [localWorkflow, setLocalWorkflow] = useState(false);
  useEffect(() => { fetch("/health").then(r => r.json()).then(r => setLocalWorkflow(r.localWorkflow === true)).catch(() => {}); }, []);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [cancellationMessage, setCancellationMessage] = useState<string | null>(null);
  const [rating, setRating] = useState("5");
  const [ratingComment, setRatingComment] = useState("");
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const paymentKey = useRef(crypto.randomUUID());
  const method = order.data?.pricing_snapshot?.financial_snapshot?.payment_method === "CARD" ? "CARD" : "MPESA";
  const attemptedPayment = useRef<string | null>(null);
  useEffect(() => {
    const terminal = payments.data?.find(p => p.id === attemptedPayment.current && ["FAILED", "CANCELLED", "EXPIRED"].includes(p.status));
    if (terminal) { paymentKey.current = crypto.randomUUID(); attemptedPayment.current = null; }
  }, [payments.data]);
  const pay = async () => {
    const validation = PaymentInitiateSchema.safeParse({
      method,
      ...(method === "MPESA" ? { phone } : {}),
    });
    if (!validation.success) {
      setError(validation.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.request<Payment>(`/orders/${encodeURIComponent(orderId)}/pay`, {
        method: "POST",
        body: JSON.stringify(validation.data),
        idempotencyKey: paymentKey.current,
      });
      attemptedPayment.current = result.data.id;
      await payments.refresh();
      await order.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const progressStage = customerProgressStage(
    order.data?.status,
    tracking.data?.deliveryStatus,
  );
  const trackingPoints: MapPoint[] = tracking.data
    ? [
        tracking.data.restaurant?.location && {
          id: "restaurant",
          label: tracking.data.restaurant.name || "Restaurant",
          latitude:
            tracking.data.restaurant.location.latitude ??
            tracking.data.restaurant.location.lat,
          longitude:
            tracking.data.restaurant.location.longitude ??
            tracking.data.restaurant.location.lng,
          kind: "pickup" as const,
        },
        tracking.data.dropoff?.location && {
          id: "dropoff",
          label: tracking.data.dropoff.address || "Delivery address",
          latitude:
            tracking.data.dropoff.location.latitude ??
            tracking.data.dropoff.location.lat,
          longitude:
            tracking.data.dropoff.location.longitude ??
            tracking.data.dropoff.location.lng,
          kind: "dropoff" as const,
        },
        tracking.data.riderLiveLocation && {
          id: "rider",
          label: tracking.data.rider?.firstName
            ? `${tracking.data.rider.firstName}'s latest location`
            : "Rider's latest location",
          latitude: tracking.data.riderLiveLocation.latitude,
          longitude: tracking.data.riderLiveLocation.longitude,
          kind: "rider" as const,
        },
      ].filter(Boolean) as MapPoint[]
    : [];

  return (
    <>
      <Button variant="ghost" onClick={onBack}>
        ← Back
      </Button>
      <ResourceState resource={order}>
        {order.data && (
          <>
            <PageHeading
              title={order.data.order_number}
              eyebrow={order.data.branch_name}
              action={<StatusBadge status={order.data.status} />}
            />
            {error && <ErrorState message={error} />}
            {order.data.status === "COMPLETED" && (
              <div className="customer-order-success">
                <CheckCircle2 size={32} />
                <div><h2>Order delivered!</h2><p>Your food has arrived. Enjoy your meal!</p></div>
              </div>
            )}
            <div className="workflow-grid">
              <div className="space-y-5">
                <Card className="customer-tracking-hero">
                  <div className="customer-tracking-hero-head">
                    <div>
                      <p className="eyebrow">Live delivery</p>
                      {tracking.data?.estimatedArrivalAt ? (
                        <>
                          <h2>
                            Arriving around{" "}
                            {new Date(
                              tracking.data.estimatedArrivalAt,
                            ).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </h2>
                          <p>
                            About {tracking.data.estimatedEtaMinutes} minutes
                            away based on the latest provider route.
                          </p>
                        </>
                      ) : (
                        <>
                          <h2>
                            {tracking.data?.statusMessage ||
                              trackingMessage ||
                              "We’re preparing your order"}
                          </h2>
                          <p>
                            DeeToo only shows an ETA when live Rider GPS and the
                            routing provider can support one.
                          </p>
                        </>
                      )}
                    </div>
                    <StatusBadge
                      status={
                        tracking.data?.deliveryStatus || order.data.status
                      }
                    />
                  </div>

                  <ProgressSteps
                    steps={deliveryProgressSteps}
                    current={progressStage}
                  />

                  {trackingMessage ? (
                    <InlineBanner kind="info">{trackingMessage}</InlineBanner>
                  ) : (
                    <ResourceState resource={tracking} compact>
                      {tracking.data && (
                        <div className="space-y-4">
                          {trackingPoints.length > 0 && (
                            <LocationMap points={trackingPoints} />
                          )}

                          <div className="customer-tracking-cards">
                            <div className="customer-rider-card">
                              <div className="customer-rider-avatar">
                                <Bike size={22} aria-hidden="true" />
                              </div>
                              <div>
                                <span className="eyebrow">Your Rider</span>
                                <strong>
                                  {tracking.data.rider?.firstName ||
                                    "Rider assignment in progress"}
                                </strong>
                                {tracking.data.rider && (
                                  <p>
                                    {tracking.data.rider.vehicleType ||
                                      "Delivery vehicle"}
                                    {tracking.data.rider
                                      .vehicleRegistrationMasked
                                      ? ` · ${tracking.data.rider.vehicleRegistrationMasked}`
                                      : ""}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="customer-dropoff-card">
                              <MapPin size={18} aria-hidden="true" />
                              <div>
                                <span className="eyebrow">Delivering to</span>
                                <strong>
                                  {tracking.data.dropoff?.address ||
                                    "Your selected address"}
                                </strong>
                              </div>
                            </div>
                          </div>

                          {tracking.data.riderLiveLocation?.isStale && (
                            <InlineBanner kind="warning">
                              The Rider’s latest GPS update is overdue. The map
                              is showing the last known position.
                            </InlineBanner>
                          )}

                          {tracking.data.rider &&
                            !tracking.data.riderLiveLocation && (
                              <InlineBanner kind="info">
                                Waiting for the Rider’s device to send a live
                                GPS update.
                              </InlineBanner>
                            )}

                          {tracking.data.deliveryOtp && (
                            <div className="customer-delivery-pin">
                              <div>
                                <span className="eyebrow">Delivery PIN</span>
                                <strong>{tracking.data.deliveryOtp}</strong>
                              </div>
                              <p>
                                Share this only with the assigned Rider when you
                                receive the order.
                              </p>
                            </div>
                          )}

                          {tracking.updatedAt && (
                            <p className="customer-tracking-updated">
                              Last checked{" "}
                              {tracking.updatedAt.toLocaleTimeString()}
                            </p>
                          )}
                        </div>
                      )}
                    </ResourceState>
                  )}
                </Card>

                <details className="customer-order-activity">
                  <summary>Order details & activity</summary>
                  <div>
                    <Timeline entries={order.data.timeline || []} />
                    <p>
                      This order is separate from your bag. Removing bag items
                      does not cancel it.
                    </p>
                  </div>
                </details>
              </div>
              <div className="space-y-5">
                <Card>
                  <h2 className="text-xl font-bold mb-4">Payment</h2>
                  <Price minor={order.data.total_minor} />
                  <ResourceState resource={authoritativeAmount}>
                    {authoritativeAmount.data && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                          Authoritative amount payable at handover
                        </p>
                        <p className="mt-1 text-xl font-bold text-emerald-950">
                          KES {(Number(authoritativeAmount.data.amount_due_at_handover_minor || 0) / 100).toFixed(2)}
                        </p>
                        <p className="mt-1 text-xs text-emerald-800">
                          This is the DeeToo amount. Do not pay a Rider a different amount outside the app; report any extra-payment request from Support.
                        </p>
                      </div>
                    )}
                  </ResourceState>
                  <ResourceState resource={payments}>
                    {payments.data?.map((payment) => (
                      <div className="py-3 border-b" key={payment.id}>
                        <StatusBadge status={payment.status} />
                        <p className="text-sm mt-2">
                          {payment.method}{" "}
                          {payment.mpesa_receipt_number ||
                            payment.provider_reference}
                        </p>
                        {method === "CARD" && order.data.status === "PENDING_PAYMENT" &&
                          ["CREATED", "INITIATED", "PENDING"].includes(payment.status) &&
                          payment.checkout_url?.startsWith("https://checkout.stripe.com/") && (
                            <a className="inline-block mt-3 font-semibold underline" href={payment.checkout_url}>
                              Continue to secure card checkout
                            </a>
                          )}
                        {payment.failure_message && (
                          <p role="alert">{payment.failure_message}</p>
                        )}
                        {payment.refunded_minor > 0 && (
                          <p>
                            Refunded <Price minor={payment.refunded_minor} />
                          </p>
                        )}
                      </div>
                    ))}
                  </ResourceState>
                  {!["CANCELLED", "REJECTED", "COMPLETED"].includes(
                    order.data.status,
                  ) &&
                    !payments.data?.some((p) =>
                      [
                        "CREATED",
                        "INITIATED",
                        "PENDING",
                        "AUTHORIZED",
                        "CAPTURED",
                        "PARTIALLY_REFUNDED",
                        "REFUNDED",
                      ].includes(p.status),
                    ) && (
                      <div className="space-y-3 mt-4">
                        {method === "MPESA" && <FormField label="M-PESA phone number" required>
                          <Input
                            type="tel"
                            placeholder="+254…"
                            value={phone}
                            onChange={(e) => {
                              setPhone(e.target.value);
                              paymentKey.current = crypto.randomUUID();
                            }}
                          />
                        </FormField>}
                        <Button
                          className="w-full"
                          isLoading={busy}
                          disabled={payments.loading || Boolean(payments.error)}
                          onClick={pay}
                        >
                          {method === "MPESA" ? "Pay with M-PESA" : "Pay by card"}
                        </Button>
                        <p className="text-xs">
                          {localWorkflow ? "Local test: payment will complete automatically. No phone prompt, card charge or real money movement." : <>{method === "MPESA" ? "Approve the request on your phone." : "A secure Stripe checkout link will appear when ready."} Payment is confirmed only after provider verification.</>}
                        </p>
                      </div>
                    )}
                </Card>
                {!["CANCELLED", "REJECTED", "COMPLETED"].includes(
                  order.data.status,
                ) && (
                  <Card>
                    <h2 className="text-lg font-bold mb-2">
                      {["PLACED", "PAYMENT_PENDING", "PENDING_PAYMENT"].includes(order.data.status)
                        ? "Cancel order"
                        : "Request cancellation"}
                    </h2>
                    <p className="mb-3 text-sm text-slate-500">
                      {["PLACED", "PAYMENT_PENDING", "PENDING_PAYMENT"].includes(order.data.status)
                        ? "Before merchant acceptance, cancellation can be handled automatically."
                        : "Because fulfilment has started, DeeToo will calculate the stage and route any disputed financial consequences to Support for review."}
                    </p>
                    {cancellationMessage && (
                      <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        {cancellationMessage}
                      </div>
                    )}
                    <FormField label="Cancellation reason (optional)">
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </FormField>
                    <Button
                      variant="danger"
                      className="mt-3"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setCancellationMessage(null);
                        try {
                          await apiClient.cancelCustomerOrder(
                            orderId,
                            "CUSTOMER_CANCELLED",
                            reason.trim() || undefined,
                          );
                          await Promise.all([order.refresh(), payments.refresh(), authoritativeAmount.refresh()]);
                        } catch (e: any) {
                          const code = e?.error?.code || e?.code;
                          const assessment =
                            e?.error?.details?.cancellation_assessment ||
                            e?.details?.cancellation_assessment;
                          if (code === "CANCELLATION_REVIEW_REQUIRED" || assessment?.support_case_id) {
                            setCancellationMessage(
                              `Cancellation review opened with Support${assessment?.support_case_id ? ` (case ${assessment.support_case_id})` : ""}. No refund, merchant compensation or Rider compensation will be guessed before review.`,
                            );
                          } else {
                            setError(errorMessage(e));
                          }
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {["PLACED", "PAYMENT_PENDING", "PENDING_PAYMENT"].includes(order.data.status)
                        ? "Cancel order"
                        : "Request cancellation review"}
                    </Button>
                  </Card>
                )}
                {order.data.status === "COMPLETED" && (
                  <Card>
                    <h2 className="text-lg font-bold mb-2">Rate your delivery</h2>
                    <p className="mb-3 text-sm text-slate-500">
                      Your rating is one operational signal. It will never suspend a Rider automatically.
                    </p>
                    {ratingMessage && (
                      <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                        {ratingMessage}
                      </div>
                    )}
                    <FormField label="Rating" required>
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={rating}
                        onChange={(e) => setRating(e.target.value)}
                      >
                        <option value="5">5 — Excellent</option>
                        <option value="4">4 — Good</option>
                        <option value="3">3 — Okay</option>
                        <option value="2">2 — Poor</option>
                        <option value="1">1 — Very poor</option>
                      </select>
                    </FormField>
                    <FormField label="Comment (optional)">
                      <Input
                        value={ratingComment}
                        onChange={(e) => setRatingComment(e.target.value)}
                      />
                    </FormField>
                    <Button
                      className="mt-3"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          await apiClient.request("/trust/ratings", {
                            method: "POST",
                            body: JSON.stringify({
                              order_id: orderId,
                              rating: Number(rating),
                              comment: ratingComment.trim() || undefined,
                            }),
                          });
                          setRatingMessage("Delivery rating recorded.");
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Submit rating
                    </Button>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </ResourceState>
    </>
  );
}
