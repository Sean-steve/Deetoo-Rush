import React, { useEffect, useMemo, useRef, useState } from "react";
import { Order } from "@deetoo/types";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  ChoiceChip,
  EmptyState,
  ErrorState,
  FormField,
  InlineBanner,
  Input,
  Modal,
  Price,
} from "../../../../packages/ui/src/index";
import {
  errorMessage,
  MetricCard,
  PageHeading,
  ResourceState,
  StatusBadge,
  useResource,
} from "../../../../packages/ui/src/workflows";
import {
  BellRing,
  ChefHat,
  Clock3,
  PackageCheck,
  TimerReset,
  UtensilsCrossed,
} from "lucide-react";

type KitchenTiming = {
  label: string;
  detail: string;
  tone: "normal" | "warning" | "overdue";
  minutes: number;
};

function minutesSince(value?: string | null, now = Date.now()): number {
  if (!value) return 0;
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
}

export function kitchenTiming(order: Order, now = Date.now()): KitchenTiming {
  if (order.status === "PLACED") {
    const minutes = minutesSince(order.placed_at || order.created_at, now);
    return {
      label: `Waiting ${minutes}m`,
      detail: "Response age",
      tone: minutes >= 5 ? "overdue" : minutes >= 3 ? "warning" : "normal",
      minutes,
    };
  }

  if (
    ["ACCEPTED", "PREPARING"].includes(order.status) &&
    order.estimated_ready_at
  ) {
    const target = new Date(order.estimated_ready_at).getTime();
    const deltaMinutes = Math.ceil((target - now) / 60000);
    if (deltaMinutes < 0) {
      return {
        label: `${Math.abs(deltaMinutes)}m past target`,
        detail: "Prep target",
        tone: "overdue",
        minutes: Math.abs(deltaMinutes),
      };
    }
    return {
      label: deltaMinutes === 0 ? "Due now" : `${deltaMinutes}m to target`,
      detail: "Prep target",
      tone: deltaMinutes <= 5 ? "warning" : "normal",
      minutes: deltaMinutes,
    };
  }

  if (order.status === "READY") {
    const minutes = minutesSince(order.ready_at || order.updated_at, now);
    return {
      label: minutes ? `Ready ${minutes}m` : "Ready now",
      detail: "Pickup waiting",
      tone: minutes >= 5 ? "warning" : "normal",
      minutes,
    };
  }

  return {
    label: "Live",
    detail: "Order state",
    tone: "normal",
    minutes: 0,
  };
}

export function KitchenOrders({ branchId }: { branchId: string }) {
  const { apiClient } = useAuth();
  const orders = useResource<Order[]>(
    branchId
      ? `/merchant/orders?branch_id=${encodeURIComponent(branchId)}`
      : null,
    5000,
  );
  const [target, setTarget] = useState<{
    order: Order;
    action: "accept" | "reject";
  } | null>(null);
  const [minutes, setMinutes] = useState("20");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [stageFilter, setStageFilter] = useState("all");
  const [now, setNow] = useState(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousPlacedCountRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  function playIncomingOrderSound() {
    if (!soundEnabled || !audioContextRef.current) return;
    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.28);
  }

  function enableSound() {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      setError("This browser does not support kitchen audio alerts.");
      return;
    }
    const ctx = audioContextRef.current || new AudioContextCtor();
    audioContextRef.current = ctx;
    void ctx.resume();
    setSoundEnabled(true);
  }

  useEffect(() => {
    if (!branchId) return;
    const source = new EventSource(
      `/api/v1/realtime/stream?channels=${encodeURIComponent(
        `merchant-branch:${branchId}`,
      )}`,
      { withCredentials: true },
    );
    const refresh = () => void orders.refresh();
    const eventTypes = [
      "order.placed",
      "order.cancelled",
      "order.rejected",
      "delivery.assigned",
      "delivery.arrived_pickup",
      "delivery.picked_up",
      "delivery.delivered",
    ];
    eventTypes.forEach((type) => source.addEventListener(type, refresh));
    source.onerror = () => {
      // Polling remains the authoritative fallback when realtime disconnects.
    };
    return () => {
      eventTypes.forEach((type) => source.removeEventListener(type, refresh));
      source.close();
    };
  }, [branchId, orders.refresh]);

  useEffect(() => {
    if (!orders.data) return;
    const placedCount = orders.data.filter(
      (order) => order.status === "PLACED",
    ).length;
    const previous = previousPlacedCountRef.current;
    if (previous !== null && placedCount > previous) playIncomingOrderSound();
    previousPlacedCountRef.current = placedCount;
  }, [orders.data, soundEnabled]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setTarget(null);
      await orders.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const liveOrders = orders.data || [];
  const summary = useMemo(() => {
    const newOrders = liveOrders.filter((order) => order.status === "PLACED");
    const preparing = liveOrders.filter((order) =>
      ["ACCEPTED", "PREPARING"].includes(order.status),
    );
    const ready = liveOrders.filter((order) => order.status === "READY");
    const completed = liveOrders.filter((order) => ["PICKED_UP", "DELIVERED", "COMPLETED"].includes(order.status));
    const pastTarget = preparing.filter(
      (order) =>
        order.estimated_ready_at &&
        new Date(order.estimated_ready_at).getTime() < now,
    );
    const prepValues = preparing
      .map((order) => Number(order.estimated_prep_minutes || 0))
      .filter((value) => value > 0);
    const averagePrep =
      prepValues.length > 0
        ? Math.round(
            prepValues.reduce((total, value) => total + value, 0) /
              prepValues.length,
          )
        : null;
    return {
      newOrders,
      preparing,
      ready,
      completed,
      pastTarget,
      averagePrep,
    };
  }, [liveOrders, now]);

  const columns = [
    {
      id: "new",
      title: "New orders",
      subtitle: "Respond first",
      icon: BellRing,
      states: ["PLACED"],
    },
    {
      id: "preparing",
      title: "Preparing",
      subtitle: "Protect ready targets",
      icon: ChefHat,
      states: ["ACCEPTED", "PREPARING"],
    },
    {
      id: "ready",
      title: "Ready for pickup",
      subtitle: "Waiting for Rider",
      icon: PackageCheck,
      states: ["READY"],
    },
    {
      id: "completed",
      title: "Completed",
      subtitle: "Picked up & delivered",
      icon: PackageCheck,
      states: ["PICKED_UP", "DELIVERED", "COMPLETED"],
    },
  ];

  return (
    <>
      <PageHeading
        title="Kitchen orders"
        eyebrow="Live service"
        subtitle="Prepare and manage incoming orders in real time. Oldest orders appear first."
        action={
          <div className="flex flex-wrap gap-2">
            {!soundEnabled ? (
              <Button variant="outline" onClick={enableSound}>
                <BellRing size={15} aria-hidden="true" />
                Enable new-order sound
              </Button>
            ) : (
              <span className="merchant-sound-enabled" role="status">
                <BellRing size={14} aria-hidden="true" />
                Sound on
              </span>
            )}
            <Button
              variant="outline"
              onClick={orders.refresh}
              isLoading={orders.loading}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {error && <ErrorState message={error} />}

      <ResourceState resource={orders}>
        <div className="merchant-kitchen-summary">
          <MetricCard
            label="New"
            value={summary.newOrders.length}
            detail={
              summary.newOrders.length
                ? "Waiting for acceptance or decline"
                : "No response needed"
            }
            status={
              summary.newOrders.length ? (
                <StatusBadge status="ACTION_REQUIRED" tone="warning" />
              ) : undefined
            }
          />
          <MetricCard
            label="Preparing"
            value={summary.preparing.length}
            detail={
              summary.averagePrep != null
                ? `Average target ${summary.averagePrep} min`
                : "Kitchen work in progress"
            }
          />
          <MetricCard
            label="Ready"
            value={summary.ready.length}
            detail="Waiting for Rider pickup"
          />
          <MetricCard
            label="Avg. prep time"
            value={summary.averagePrep == null ? "—" : `${summary.averagePrep} min`}
            detail="Based on current preparation targets"
          />
        </div>

        <div className="merchant-v2-filter-bar">
          <div className="merchant-v2-tabs" aria-label="Filter kitchen orders">
            {[
              ["all", "All", liveOrders.length],
              ["new", "New", summary.newOrders.length],
              ["preparing", "Preparing", summary.preparing.length],
              ["ready", "Ready", summary.ready.length],
              ["completed", "Completed", summary.completed.length],
            ].map(([value, label, count]) => (
              <button key={value} type="button" aria-pressed={stageFilter === value} onClick={() => setStageFilter(String(value))}>
                {label} ({count})
              </button>
            ))}
          </div>
          <div className="merchant-v2-filter-meta" role="status">{summary.pastTarget.length ? `${summary.pastTarget.length} past preparation target` : "Preparation targets healthy"} · Oldest first</div>
        </div>
        <div className="kitchen-board merchant-kitchen-board">
          {columns.filter((column) => stageFilter === "all" || column.id === stageFilter).map((column) => {
            const rows = liveOrders
              .filter((order) => column.states.includes(order.status))
              .sort((a, b) => {
                const aTiming = kitchenTiming(a, now);
                const bTiming = kitchenTiming(b, now);
                const priority = { overdue: 2, warning: 1, normal: 0 };
                const toneDiff =
                  priority[bTiming.tone] - priority[aTiming.tone];
                if (toneDiff) return toneDiff;
                return (
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime()
                );
              });
            const Icon = column.icon;
            return (
              <section
                className="kitchen-column merchant-kitchen-column"
                data-stage={column.id}
                key={column.id}
              >
                <header className="merchant-kitchen-column-head">
                  <div>
                    <span className="merchant-kitchen-column-icon">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>{column.title}</h2>
                      <p>{column.subtitle}</p>
                    </div>
                  </div>
                  <strong>{rows.length}</strong>
                </header>

                {rows.map((order) => {
                  const timing = kitchenTiming(order, now);
                  return (
                    <article
                      key={order.id}
                      className="order-card merchant-order-ticket"
                      data-urgency={timing.tone}
                    >
                      <div className="merchant-order-ticket-head">
                        <div>
                          <span className="eyebrow">Order</span>
                          <h3>#{order.order_number}</h3>
                        </div>
                        <div className="merchant-order-time" data-tone={timing.tone}>
                          <Clock3 size={15} aria-hidden="true" />
                          <div>
                            <strong>{timing.label}</strong>
                            <span>{timing.detail}</span>
                          </div>
                        </div>
                      </div>

                      <div className="merchant-order-meta">
                        <span>{order.customer_name || "Customer"}</span>
                        <span>
                          {new Date(
                            order.placed_at || order.created_at,
                          ).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        <Price minor={order.total_minor} />
                      </div>

                      <div className="merchant-order-items">
                        {order.items.map((item) => (
                          <div key={item.id}>
                            <strong>
                              {item.quantity} × {item.item_name}
                            </strong>
                            {item.modifiers?.length ? (
                              <p>
                                {item.modifiers
                                  .map((modifier) => modifier.option_name)
                                  .join(", ")}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      {order.special_instructions && (
                        <InlineBanner kind="warning" title="Kitchen note">
                          {order.special_instructions}
                        </InlineBanner>
                      )}

                      {order.estimated_ready_at && (
                        <div className="merchant-ready-target">
                          <TimerReset size={15} aria-hidden="true" />
                          <span>Ready target</span>
                          <strong>
                            {new Date(
                              order.estimated_ready_at,
                            ).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </strong>
                        </div>
                      )}

                      <div className="merchant-order-action">
                        {order.status === "PLACED" && (
                          <>
                            <Button
                              fullWidth
                              disabled={busy || Boolean(orders.error)}
                              onClick={() => {
                                setTarget({ order, action: "accept" });
                                setMinutes("20");
                              }}
                            >
                              Accept · set prep time
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                setTarget({ order, action: "reject" });
                                setReason("");
                              }}
                            >
                              Decline
                            </Button>
                          </>
                        )}

                        {order.status === "ACCEPTED" && (
                          <Button
                            fullWidth
                            disabled={busy || Boolean(orders.error)}
                            onClick={() =>
                              void act(() =>
                                apiClient.markMerchantOrderPreparing(order.id),
                              )
                            }
                          >
                            Start preparing
                          </Button>
                        )}

                        {order.status === "PREPARING" && (
                          <Button
                            fullWidth
                            disabled={busy || Boolean(orders.error)}
                            onClick={() =>
                              void act(() =>
                                apiClient.markMerchantOrderReady(order.id),
                              )
                            }
                          >
                            Mark ready
                          </Button>
                        )}

                        {order.status === "READY" && (
                          <PickupStatus
                            orderId={order.id}
                            branchId={branchId}
                          />
                        )}
                      </div>
                    </article>
                  );
                })}

                {orders.data && !rows.length && (
                  <EmptyState
                    title={column.id === "completed" ? "No completed orders yet" : "Queue clear"}
                    description={column.id === "completed" ? "Orders will appear here after pickup." : "Orders in this stage will appear here."}
                    icon={UtensilsCrossed}
                  />
                )}
              </section>
            );
          })}
        </div>
      </ResourceState>

      <Modal
        isOpen={Boolean(target)}
        onClose={() => !busy && setTarget(null)}
        title={target?.action === "accept" ? "Accept order" : "Decline order"}
      >
        {target && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act(() =>
                target.action === "accept"
                  ? apiClient.acceptMerchantOrder(
                      target.order.id,
                      Number(minutes),
                    )
                  : apiClient.rejectMerchantOrder(
                      target.order.id,
                      "KITCHEN_OVERLOAD",
                      reason,
                    ),
              );
            }}
            className="space-y-4"
          >
            {target.action === "accept" ? (
              <>
                <InlineBanner kind="info">
                  Set a realistic preparation target. Riders and customers use
                  this operational promise downstream.
                </InlineBanner>
                <FormField label="Preparation time" required>
                  <div className="merchant-prep-choices">
                    {[10, 15, 20, 30, 45].map((value) => (
                      <ChoiceChip
                        key={value}
                        selected={minutes === String(value)}
                        onClick={() => setMinutes(String(value))}
                      >
                        {value} min
                      </ChoiceChip>
                    ))}
                  </div>
                  <Input
                    required
                    type="number"
                    min="1"
                    max="180"
                    value={minutes}
                    onChange={(event) => setMinutes(event.target.value)}
                    className="mt-3"
                  />
                </FormField>
              </>
            ) : (
              <FormField label="Reason" required>
                <Input
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain why the kitchen cannot fulfil this order"
                />
              </FormField>
            )}
            {error && <ErrorState message={error} />}
            <Button
              fullWidth
              type="submit"
              variant={target.action === "reject" ? "danger" : "primary"}
              isLoading={busy}
            >
              {target.action === "accept"
                ? `Accept · ${minutes} min prep`
                : "Decline order"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}

function PickupStatus({
  orderId,
  branchId,
}: {
  orderId: string;
  branchId: string;
}) {
  const pickup = useResource<any>(
    `/merchant/orders/${encodeURIComponent(
      orderId,
    )}/pickup-status?branch_id=${encodeURIComponent(branchId)}`,
    5000,
  );

  return (
    <ResourceState resource={pickup} compact>
      {pickup.data && (
        <div className="merchant-pickup-status">
          <div>
            <StatusBadge status={pickup.data.deliveryStatus} />
            <strong>
              {pickup.data.rider?.firstName || "Waiting for assigned Rider"}
            </strong>
          </div>
          {pickup.data.pickupVerificationCode && (
            <div className="merchant-handover-code">
              <span>Handover code</span>
              <strong>{pickup.data.pickupVerificationCode}</strong>
            </div>
          )}
        </div>
      )}
    </ResourceState>
  );
}
