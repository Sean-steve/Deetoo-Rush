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
} from "../../../../packages/ui/src/index";
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
} from "@deetoo/types";
import { PaymentInitiateSchema } from "@deetoo/validation";

export function CustomerJourney({
  view,
  addresses,
  onBrowse,
  onAddress,
  onCartChange,
}: {
  view: "cart" | "orders";
  addresses: CustomerAddress[];
  onBrowse: () => void;
  onAddress: () => void;
  onCartChange: () => void;
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
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
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
        <ResourceState resource={orders}>
          <div className="grid gap-4">
            {orders.data?.map((order) => (
              <Card key={order.id}>
                <div className="flex justify-between gap-4">
                  <div>
                    <h2 className="font-bold">{order.order_number}</h2>
                    <p>{order.branch_name}</p>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="text-right">
                    <Price minor={order.total_minor} />
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => setOrderId(order.id)}
                    >
                      View & track
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
  const expired = quote && new Date(quote.expires_at).getTime() <= now;
  return (
    <>
      <PageHeading title="Your bag" eyebrow="Made for your cravings" />
      {error && <ErrorState message={error} />}
      <ResourceState resource={cart}>
        {!cart.error && !cart.loading && !cart.data?.items?.length ? (
          <EmptyState
            title="Your bag is empty"
            description="Choose a kitchen and add something delicious."
            action={<Button onClick={onBrowse}>Explore kitchens</Button>}
          />
        ) : (
          cart.data && (
            <div className="workflow-grid">
              <section className="space-y-4">
                <h2 className="text-xl font-bold">
                  {cart.data.branch.merchant_name} · {cart.data.branch.name}
                </h2>
                {cart.data.items.map((item) => (
                  <Card key={item.id}>
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
              <Card className="h-fit space-y-4">
                <h2 className="text-xl font-bold">Delivery & checkout</h2>
                <FormField label="Delivery address">
                  <Select
                    value={addressId}
                    onChange={(e) => {
                      setAddressId(e.target.value);
                      setQuote(null);
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
                <Button variant="outline" onClick={onAddress}>
                  Add address
                </Button>
                <FormField label="Delivery notes">
                  <Input
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setQuote(null);
                      key.current = null;
                    }}
                  />
                </FormField>
                <FormField label="Payment method">
                  <Select value={paymentMethod} disabled={busy} onChange={(e) => {
                    setPaymentMethod(e.target.value as "MPESA" | "CARD");
                    setQuote(null);
                    key.current = null;
                  }}>
                    <option value="MPESA">M-PESA</option>
                    <option value="CARD">Card</option>
                  </Select>
                </FormField>
                {quote ? (
                  <>
                    <PriceBreakdown
                      rows={[
                        ["Subtotal", quote.gross_subtotal_minor],
                        ["Discount", -quote.discount_minor],
                        ["Delivery", quote.delivery_fee_minor],
                        ["Service fee", quote.service_fee_minor - (quote.pricing_rule_snapshot?.rounding_adjustment_minor || 0)],
                        ["M-PESA rounding", quote.pricing_rule_snapshot?.rounding_adjustment_minor || 0],
                        ["Tax", quote.tax_minor],
                        ["Total", quote.total_minor],
                      ]}
                    />
                    <p role="status" className="text-sm">
                      {expired
                        ? "This quote expired. Refresh it before ordering."
                        : `Quote valid until ${new Date(quote.expires_at).toLocaleTimeString()}`}
                    </p>
                    <Button
                      disabled={busy || Boolean(expired)}
                      className="w-full"
                      isLoading={busy}
                      onClick={() =>
                        action(async () => {
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
                          onCartChange();
                        })
                      }
                    >
                      Place order · <Price minor={quote.total_minor} />
                    </Button>
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
                      [
                        "Estimated total",
                        cart.data.pricing.estimated_total_minor,
                      ],
                    ]}
                  />
                )}
                <Button
                  variant={quote && !expired ? "outline" : "primary"}
                  className="w-full"
                  disabled={busy || !addressId}
                  onClick={() =>
                    action(async () => {
                      const result = await apiClient.generateCheckoutQuote({
                        address_id: addressId,
                        notes,
                        payment_method: paymentMethod,
                      });
                      setQuote(result.data);
                      key.current = crypto.randomUUID();
                    })
                  }
                >
                  {quote ? "Refresh checkout quote" : "Review checkout"}
                </Button>
              </Card>
            </div>
          )
        )}
      </ResourceState>
    </>
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
  const [localWorkflow, setLocalWorkflow] = useState(false);
  useEffect(() => { fetch("/health").then(r => r.json()).then(r => setLocalWorkflow(r.localWorkflow === true)).catch(() => {}); }, []);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
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
            <div className="workflow-grid">
              <div className="space-y-5">
                <Card>
                  <h2 className="text-xl font-bold mb-4">Order updates</h2>
                  <Timeline entries={order.data.timeline || []} />
                  <p className="text-sm mt-3">This order is separate from your bag. Removing bag items does not cancel it.</p>
                </Card>
                <Card>
                  <h2 className="text-xl font-bold mb-4">Delivery tracking</h2>
                  {trackingMessage ? (
                    <p role="status">{trackingMessage}</p>
                  ) : (
                    <ResourceState resource={tracking}>
                      {tracking.data && (
                        <div className="space-y-3">
                          <StatusBadge status={tracking.data.deliveryStatus} />
                          <p>{tracking.data.statusMessage}</p>
                          {tracking.data.rider && (
                            <p>Rider: {tracking.data.rider.firstName}</p>
                          )}
                          {tracking.data.estimatedEtaMinutes != null && (
                            <p>
                              Estimated arrival in{" "}
                              {tracking.data.estimatedEtaMinutes} minutes
                            </p>
                          )}
                          <p>{tracking.data.dropoff?.address}</p>
                          {tracking.data.riderLiveLocation && (
                            <p className="text-sm">
                              {tracking.data.riderLiveLocation.isStale ? "Last known rider position (GPS update overdue):" : "Latest rider position:"}{" "}
                              {tracking.data.riderLiveLocation.latitude},{" "}
                              {tracking.data.riderLiveLocation.longitude}
                            </p>
                          )}
                          {tracking.data.rider && !tracking.data.riderLiveLocation && (
                            <p role="status">Waiting for your courier’s GPS update. Location appears when their device sends it.</p>
                          )}
                          {tracking.updatedAt && <p className="text-xs">Last checked: {tracking.updatedAt.toLocaleTimeString()}</p>}
                          {tracking.data.deliveryOtp && (
                            <p>
                              Delivery code:{" "}
                              <strong>{tracking.data.deliveryOtp}</strong>
                            </p>
                          )}
                        </div>
                      )}
                    </ResourceState>
                  )}
                </Card>
              </div>
              <div className="space-y-5">
                <Card>
                  <h2 className="text-xl font-bold mb-4">Payment</h2>
                  <Price minor={order.data.total_minor} />
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
                {["PLACED", "PAYMENT_PENDING", "PENDING_PAYMENT"].includes(
                  order.data.status,
                ) && (
                  <Card>
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
                        try {
                          await apiClient.cancelCustomerOrder(
                            orderId,
                            "CUSTOMER_CANCELLED",
                            reason.trim() || undefined,
                          );
                          await order.refresh();
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Cancel order
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
