import React, { useEffect, useRef, useState } from "react";
import { Order } from "@deetoo/types";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Modal,
  Price,
} from "../../../../packages/ui/src/index";
import {
  errorMessage,
  PageHeading,
  ResourceState,
  StatusBadge,
  useResource,
} from "../../../../packages/ui/src/workflows";
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
    action: "accept" | "reject" | "cancel";
  } | null>(null);
  const [minutes, setMinutes] = useState("20");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousPlacedCountRef = useRef<number | null>(null);

  function playIncomingOrderSound() {
    if (!soundEnabled || !audioContextRef.current) return;
    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.45);
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
      `/api/v1/realtime/stream?channels=${encodeURIComponent(`merchant-branch:${branchId}`)}`,
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
    const placedCount = orders.data.filter((order) => order.status === "PLACED").length;
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
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const columns = [
    { title: "Action required", states: ["PLACED"] },
    { title: "Cooking / prep", states: ["ACCEPTED", "PREPARING"] },
    { title: "Ready for pickup", states: ["READY"] },
  ];
  return (
    <>
      <PageHeading
        title="Kitchen display"
        eyebrow="Live orders · realtime with 5-second polling fallback"
        action={
          <div className="flex gap-2">
            {!soundEnabled && (
              <Button variant="outline" onClick={enableSound}>
                Enable order sound
              </Button>
            )}
            <Button
              variant="outline"
              onClick={orders.refresh}
              isLoading={orders.loading}
            >
              Refresh orders
            </Button>
          </div>
        }
      />
      {error && <ErrorState message={error} />}
      <ResourceState resource={orders}>
        <div className="kitchen-board">
          {columns.map((column) => {
            const rows = (orders.data || []).filter((order) =>
              column.states.includes(order.status),
            );
            return (
              <section className="kitchen-column" key={column.title}>
                <div className="flex justify-between items-center">
                  <h2>{column.title}</h2>
                  {orders.data && (
                    <span className="rounded-full bg-white px-3 py-1 text-sm">
                      {rows.length}
                    </span>
                  )}
                </div>
                {rows.map((order) => (
                  <article key={order.id} className="order-card space-y-4">
                    <div className="flex justify-between gap-2">
                      <h3 className="text-2xl font-extrabold break-all">
                        #{order.order_number}
                      </h3>
                      <div className="text-right">
                        <StatusBadge status={order.status} />
                        {order.payment_status && (
                          <StatusBadge status={order.payment_status} />
                        )}
                        <div className="mt-2">
                          <Price minor={order.total_minor} />
                        </div>
                      </div>
                    </div>
                    <p className="text-sm">
                      {order.customer_name || "Customer"} ·{" "}
                      {new Date(order.created_at).toLocaleTimeString()}
                    </p>
                    <ul className="p-3 rounded-xl bg-stone-50 space-y-2">
                      {order.items.map((item) => (
                        <li key={item.id} className="text-sm">
                          <strong>
                            {item.quantity} × {item.item_name}
                          </strong>
                          <p className="text-xs">
                            {item.modifiers
                              ?.map((mod) => mod.option_name)
                              .join(", ")}
                          </p>
                        </li>
                      ))}
                    </ul>
                    {order.special_instructions && (
                      <p className="bg-amber-50 p-3 rounded-xl text-sm">
                        Kitchen note: {order.special_instructions}
                      </p>
                    )}
                    {order.estimated_ready_at && (
                      <p className="text-sm">
                        Prep target:{" "}
                        {new Date(
                          order.estimated_ready_at,
                        ).toLocaleTimeString()}
                      </p>
                    )}
                    <div className="grid gap-2">
                      {order.status === "PLACED" && (
                        <>
                          <Button
                            disabled={busy || Boolean(orders.error)}
                            onClick={() => {
                              setTarget({ order, action: "accept" });
                              setMinutes("20");
                            }}
                          >
                            Accept & set prep time
                          </Button>
                          <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() => {
                              setTarget({ order, action: "reject" });
                              setReason("");
                            }}
                          >
                            Decline order
                          </Button>
                        </>
                      )}
                      {order.status === "ACCEPTED" && (
                        <Button
                          disabled={busy || Boolean(orders.error)}
                          onClick={() =>
                            act(() =>
                              apiClient.markMerchantOrderPreparing(order.id),
                            )
                          }
                        >
                          Start preparing
                        </Button>
                      )}
                      {order.status === "PREPARING" && (
                        <Button
                          disabled={busy || Boolean(orders.error)}
                          onClick={() =>
                            act(() =>
                              apiClient.markMerchantOrderReady(order.id),
                            )
                          }
                        >
                          Mark ready for pickup
                        </Button>
                      )}
                      {order.status === "READY" && (
                        <PickupStatus orderId={order.id} branchId={branchId} />
                      )}
                    </div>
                  </article>
                ))}
                {orders.data && !rows.length && (
                  <EmptyState
                    title="Queue clear"
                    description="Orders in this stage will appear here."
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
            onSubmit={(e) => {
              e.preventDefault();
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
              <FormField label="Preparation minutes" required>
                <Input
                  required
                  type="number"
                  min="1"
                  max="180"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </FormField>
            ) : (
              <FormField label="Reason" required>
                <Input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </FormField>
            )}
            {error && <p role="alert">{error}</p>}
            <Button type="submit" isLoading={busy}>
              Confirm {target.action}
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
    `/merchant/orders/${encodeURIComponent(orderId)}/pickup-status?branch_id=${encodeURIComponent(branchId)}`,
    5000,
  );
  return (
    <ResourceState resource={pickup}>
      {pickup.data && (
        <div className="p-3 bg-stone-50 rounded-xl">
          <StatusBadge status={pickup.data.deliveryStatus} />
          <p className="text-sm mt-2">
            {pickup.data.rider?.firstName || "Waiting for assigned rider"}
          </p>
          {pickup.data.pickupVerificationCode && (
            <p>
              Handover code:{" "}
              <strong>{pickup.data.pickupVerificationCode}</strong>
            </p>
          )}
        </div>
      )}
    </ResourceState>
  );
}
