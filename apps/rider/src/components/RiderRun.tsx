import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  Countdown,
  EmptyState,
  ErrorState,
  FormField,
  InlineBanner,
  Input,
  Modal,
  Price,
  ProgressSteps,
  Select,
  StickyActionBar,
  Textarea,
} from "../../../../packages/ui/src/index";
import {
  LocationMap,
  type MapPoint,
} from "../../../../packages/ui/src/LocationMap";
import {
  errorMessage,
  MetricCard,
  PageHeading,
  ResourceState,
  StatusBadge,
  useResource,
} from "../../../../packages/ui/src/workflows";
import {
  RiderArrivePickupSchema,
  RiderArriveDropoffSchema,
  RiderCompleteDeliverySchema,
  RiderConfirmPickupSchema,
  RiderRejectOfferSchema,
  RiderFailDeliverySchema,
  RiderReleaseDeliverySchema,
} from "@deetoo/validation";
import {
  Bike,
  MapPin,
  Navigation,
  PackageCheck,
  Store,
  UserRound,
  WalletCards,
} from "lucide-react";

const runSteps = [
  {
    id: "restaurant",
    label: "Restaurant",
    description: "Travel to the pickup point",
  },
  {
    id: "pickup",
    label: "Pickup",
    description: "Verify and collect the order",
  },
  {
    id: "customer",
    label: "Customer",
    description: "Travel to the delivery address",
  },
  {
    id: "complete",
    label: "Complete",
    description: "Verify handover",
  },
];

function runStage(status?: string): string {
  if (status === "DELIVERED") return "complete";
  if (["PICKED_UP", "EN_ROUTE", "ARRIVED_DROPOFF"].includes(status || ""))
    return "customer";
  if (status === "ARRIVED_PICKUP") return "pickup";
  return "restaurant";
}

function instructionFor(status?: string): {
  eyebrow: string;
  title: string;
  detail: string;
} {
  switch (status) {
    case "ASSIGNED":
      return {
        eyebrow: "Next action",
        title: "Go to the restaurant",
        detail: "Navigate to the pickup point and confirm when you arrive.",
      };
    case "ARRIVED_PICKUP":
      return {
        eyebrow: "At the restaurant",
        title: "Verify and collect the order",
        detail: "Use the kitchen verification code before leaving with the order.",
      };
    case "PICKED_UP":
      return {
        eyebrow: "Order collected",
        title: "Start the trip",
        detail: "Confirm the trip when you are ready to leave the restaurant.",
      };
    case "EN_ROUTE":
      return {
        eyebrow: "Delivery in progress",
        title: "Go to the customer",
        detail: "Navigate to the dropoff address and confirm your arrival.",
      };
    case "ARRIVED_DROPOFF":
      return {
        eyebrow: "At the customer",
        title: "Complete the handover",
        detail: "Ask for the customer delivery PIN and complete the delivery.",
      };
    default:
      return {
        eyebrow: "Active delivery",
        title: "Follow the current delivery step",
        detail: "DeeToo will keep this screen synchronized with the delivery.",
      };
  }
}

function point(
  id: string,
  label: string,
  location: any,
  kind: MapPoint["kind"],
): MapPoint | null {
  const latitude = location?.latitude ?? location?.lat;
  const longitude = location?.longitude ?? location?.lng;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { id, label, latitude, longitude, kind };
}

export function RiderRun({
  coordinates,
  onChanged,
}: {
  coordinates: {
    latitude: number;
    longitude: number;
    accuracy_meters: number;
  } | null;
  onChanged: () => void;
}) {
  const { apiClient } = useAuth();
  const offer = useResource<any>("/rider/offers/active", 3000);
  const active = useResource<any>("/rider/deliveries/active", 3000);
  const detail = useResource<any>(
    active.data?.delivery?.id
      ? `/rider/deliveries/${encodeURIComponent(active.data.delivery.id)}`
      : null,
    3000,
  );
  const authoritativeAmount = useResource<any>(
    active.data?.order?.id
      ? `/trust/orders/${encodeURIComponent(active.data.order.id)}/authoritative-amount`
      : null,
    3000,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<"fail" | "release" | null>(null);
  const [problemReason, setProblemReason] = useState("OTHER");
  const [problemNote, setProblemNote] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("OTHER");
  const [offerExpired, setOfferExpired] = useState(false);

  async function act(path: string, body: any = {}) {
    setBusy(true);
    setError(null);
    try {
      await apiClient.request(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await Promise.all([
        offer.refresh(),
        active.refresh(),
        detail.refresh(),
        authoritativeAmount.refresh(),
      ]);
      onChanged();
      setCode("");
      setProblem(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const delivery = active.data?.delivery;
  const offerExpiry = offer.data?.offer?.expires_at;

  useEffect(() => {
    setOfferExpired(
      !offerExpiry || new Date(offerExpiry).getTime() <= Date.now(),
    );
  }, [offer.data?.offer?.id, offerExpiry]);

  const next: Record<string, [string, string]> = {
    ASSIGNED: ["arrive-pickup", "I’ve arrived"],
    ARRIVED_PICKUP: ["confirm-pickup", "Confirm pickup"],
    PICKED_UP: ["start-trip", "Start trip"],
    EN_ROUTE: ["arrive-dropoff", "I’ve arrived"],
    ARRIVED_DROPOFF: ["complete", "Complete delivery"],
  };

  async function advance() {
    if (!delivery || !next[delivery.status]) return;
    const action = next[delivery.status][0];
    let body: any = {};

    if (action === "arrive-pickup" || action === "arrive-dropoff") {
      if (!coordinates) {
        setError("Acquire a fresh GPS location before confirming arrival.");
        return;
      }
      body = coordinates;
    }
    if (action === "confirm-pickup") {
      body = { pickup_verification_code: code };
    }
    if (action === "complete") {
      body = { proof_type: "OTP", otp: code, ...coordinates };
    }

    const schema =
      action === "arrive-pickup"
        ? RiderArrivePickupSchema
        : action === "arrive-dropoff"
          ? RiderArriveDropoffSchema
          : action === "confirm-pickup"
            ? RiderConfirmPickupSchema
            : action === "complete"
              ? RiderCompleteDeliverySchema
              : null;

    if (schema) {
      const result = schema.safeParse(body);
      if (!result.success) {
        setError(result.error.issues.map((issue) => issue.message).join(" "));
        return;
      }
      body = result.data;
    }

    await act(
      `/rider/deliveries/${encodeURIComponent(delivery.id)}/${action}`,
      body,
    );
  }

  const instruction = instructionFor(delivery?.status);
  const activePoints = useMemo(
    () =>
      delivery
        ? ([
            point(
              "pickup",
              active.data?.order?.branch_name || "Restaurant",
              delivery.pickup_location,
              "pickup",
            ),
            point(
              "dropoff",
              active.data?.order?.customer_name || "Customer",
              delivery.dropoff_location,
              "dropoff",
            ),
            coordinates
              ? {
                  id: "rider",
                  label: "Your latest GPS position",
                  latitude: coordinates.latitude,
                  longitude: coordinates.longitude,
                  kind: "rider" as const,
                }
              : null,
          ].filter(Boolean) as MapPoint[])
        : [],
    [active.data?.order?.branch_name, active.data?.order?.customer_name, coordinates, delivery],
  );

  const offerPoints = useMemo(
    () =>
      offer.data
        ? ([
            point(
              "pickup",
              offer.data.restaurantName || "Restaurant",
              offer.data.pickupLocation,
              "pickup",
            ),
            point(
              "dropoff",
              "Customer",
              offer.data.dropoffLocation,
              "dropoff",
            ),
            coordinates
              ? {
                  id: "rider",
                  label: "Your latest GPS position",
                  latitude: coordinates.latitude,
                  longitude: coordinates.longitude,
                  kind: "rider" as const,
                }
              : null,
          ].filter(Boolean) as MapPoint[])
        : [],
    [coordinates, offer.data],
  );

  const navigationHref =
    detail.data?.navigation &&
    (["ASSIGNED", "ARRIVED_PICKUP"].includes(delivery?.status)
      ? detail.data.navigation.pickupMapsUrl
      : detail.data.navigation.dropoffMapsUrl);

  return (
    <div className="space-y-5">
      {error && <ErrorState message={error} onRetry={() => void active.refresh()} />}

      <ResourceState resource={active}>
        {delivery ? (
          <section className="rider-cockpit" aria-label="Active delivery">
            <header className="rider-cockpit-hero">
              <div>
                <p className="eyebrow">{instruction.eyebrow}</p>
                <h1>{instruction.title}</h1>
                <p>{instruction.detail}</p>
              </div>
              <StatusBadge status={delivery.status} />
            </header>

            <ProgressSteps
              steps={runSteps}
              current={runStage(delivery.status)}
              className="rider-run-progress"
            />

            <Card className="rider-cockpit-map">
              <LocationMap points={activePoints} />
            </Card>

            <div className="rider-current-stop">
              <div className="rider-current-stop-icon">
                {["ASSIGNED", "ARRIVED_PICKUP"].includes(delivery.status) ? (
                  <Store size={24} aria-hidden="true" />
                ) : (
                  <UserRound size={24} aria-hidden="true" />
                )}
              </div>
              <div>
                <span className="eyebrow">
                  {["ASSIGNED", "ARRIVED_PICKUP"].includes(delivery.status)
                    ? "Pickup"
                    : "Dropoff"}
                </span>
                <h2>
                  {["ASSIGNED", "ARRIVED_PICKUP"].includes(delivery.status)
                    ? active.data?.order?.branch_name || "Restaurant"
                    : active.data?.order?.customer_name || "Customer"}
                </h2>
                <p>
                  {["ASSIGNED", "ARRIVED_PICKUP"].includes(delivery.status)
                    ? delivery.pickup_address_text
                    : delivery.dropoff_address_text}
                </p>
                <span className="rider-order-number">{delivery.order_number}</span>
              </div>
            </div>

            {delivery.delivery_instructions && (
              <InlineBanner kind="info" title="Delivery instructions">
                {delivery.delivery_instructions}
              </InlineBanner>
            )}

            <ResourceState resource={authoritativeAmount} compact>
              {authoritativeAmount.data && (
                <InlineBanner
                  kind="success"
                  title="Amount payable at handover"
                >
                  <p className="rider-handover-amount">
                    KES{" "}
                    {(
                      Number(
                        authoritativeAmount.data
                          .amount_due_at_handover_minor || 0,
                      ) / 100
                    ).toFixed(2)}
                  </p>
                  Never request a different amount outside DeeToo.
                </InlineBanner>
              )}
            </ResourceState>

            {["ARRIVED_PICKUP", "ARRIVED_DROPOFF"].includes(
              delivery.status,
            ) && (
              <Card className="rider-verification-card">
                <div className="rider-verification-heading">
                  <PackageCheck size={22} aria-hidden="true" />
                  <div>
                    <h3>
                      {delivery.status === "ARRIVED_PICKUP"
                        ? "Kitchen verification"
                        : "Customer delivery PIN"}
                    </h3>
                    <p>
                      {delivery.status === "ARRIVED_PICKUP"
                        ? "Verify collection before leaving the restaurant."
                        : "Use the PIN only when the customer has received the order."}
                    </p>
                  </div>
                </div>
                <FormField
                  label={
                    delivery.status === "ARRIVED_PICKUP"
                      ? "Kitchen code"
                      : "Delivery PIN"
                  }
                  required
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    className="rider-code-input"
                  />
                </FormField>
              </Card>
            )}

            <div className="rider-problem-row">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setProblem(
                    ["ASSIGNED", "ARRIVED_PICKUP"].includes(delivery.status)
                      ? "release"
                      : "fail",
                  );
                  setProblemNote("");
                }}
              >
                Report a delivery problem
              </Button>
            </div>

            {next[delivery.status] && (
              <StickyActionBar
                secondary={
                  navigationHref ? (
                    <a
                      className="deetoo-button deetoo-button-outline rider-navigation-button"
                      href={navigationHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={17} aria-hidden="true" />
                      Navigate
                    </a>
                  ) : undefined
                }
                primary={
                  <Button
                    fullWidth
                    isLoading={busy}
                    disabled={
                      Boolean(active.error) ||
                      (["ARRIVED_PICKUP", "ARRIVED_DROPOFF"].includes(
                        delivery.status,
                      ) &&
                        code.length < 4)
                    }
                    onClick={() => void advance()}
                  >
                    {next[delivery.status][1]}
                  </Button>
                }
              />
            )}
          </section>
        ) : (
          <ResourceState resource={offer}>
            {offer.data?.offer ? (
              <section className="rider-offer-card">
                <div className="rider-offer-header">
                  <div>
                    <p className="eyebrow">New delivery offer</p>
                    <h1>{offer.data.restaurantName || "Restaurant pickup"}</h1>
                  </div>
                  <Countdown
                    expiresAt={offer.data.offer.expires_at}
                    warningAtSeconds={30}
                    onExpire={() => setOfferExpired(true)}
                    className="rider-offer-countdown"
                  />
                </div>

                <div className="rider-offer-metrics">
                  <div>
                    <Navigation size={18} aria-hidden="true" />
                    <span>Pickup</span>
                    <strong>
                      {offer.data.distanceToPickupMeters != null
                        ? `${(offer.data.distanceToPickupMeters / 1000).toFixed(1)} km`
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <Bike size={18} aria-hidden="true" />
                    <span>To pickup</span>
                    <strong>
                      {offer.data.estimatedPickupEtaSeconds != null
                        ? `~${Math.max(
                            1,
                            Math.ceil(
                              offer.data.estimatedPickupEtaSeconds / 60,
                            ),
                          )} min`
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <WalletCards size={18} aria-hidden="true" />
                    <span>Est. earnings</span>
                    <strong>
                      {offer.data.estimatedEarningsMinor != null ? (
                        <Price minor={offer.data.estimatedEarningsMinor} />
                      ) : (
                        "—"
                      )}
                    </strong>
                  </div>
                </div>

                {offerPoints.length > 0 && (
                  <Card className="rider-offer-map">
                    <LocationMap points={offerPoints} />
                  </Card>
                )}

                <div className="rider-offer-route">
                  <div>
                    <Store size={18} aria-hidden="true" />
                    <div>
                      <span>Pickup</span>
                      <strong>{offer.data.pickupAddress}</strong>
                    </div>
                  </div>
                  <div>
                    <MapPin size={18} aria-hidden="true" />
                    <div>
                      <span>Dropoff</span>
                      <strong>{offer.data.dropoffAddress}</strong>
                    </div>
                  </div>
                  <p>
                    {offer.data.itemCount || 1} item
                    {(offer.data.itemCount || 1) === 1 ? "" : "s"}
                    {offer.data.estimatedDeliveryDistanceMeters != null
                      ? ` · ${(
                          offer.data.estimatedDeliveryDistanceMeters / 1000
                        ).toFixed(1)} km pickup-to-dropoff`
                      : ""}
                  </p>
                </div>

                <FormField label="If you decline, tell DeeToo why">
                  <Select
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  >
                    {[
                      "OTHER",
                      "TOO_FAR",
                      "ENDING_SHIFT",
                      "VEHICLE_ISSUE",
                      "AREA_UNFAMILIAR",
                      "INSUFFICIENT_PAY",
                      "PERSONAL_EMERGENCY",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {value.toLowerCase().replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <StickyActionBar
                  secondary={
                    <Button
                      variant="ghost"
                      disabled={busy || offerExpired}
                      onClick={() =>
                        void act(
                          `/rider/offers/${encodeURIComponent(
                            offer.data.offer.id,
                          )}/reject`,
                          RiderRejectOfferSchema.parse({
                            reason_code: reason,
                          }),
                        )
                      }
                    >
                      Decline
                    </Button>
                  }
                  primary={
                    <Button
                      fullWidth
                      isLoading={busy}
                      disabled={
                        busy || offerExpired || Boolean(offer.error)
                      }
                      onClick={() =>
                        void act(
                          `/rider/offers/${encodeURIComponent(
                            offer.data.offer.id,
                          )}/accept`,
                        )
                      }
                    >
                      Accept delivery
                    </Button>
                  }
                />
              </section>
            ) : (
              !offer.loading &&
              !offer.error && (
                <EmptyState
                  title="Ready for your next delivery"
                  description="Stay online with a fresh GPS signal. Eligible delivery offers will appear here automatically."
                  icon={Bike}
                />
              )
            )}
          </ResourceState>
        )}
      </ResourceState>

      <Modal
        isOpen={Boolean(problem)}
        onClose={() => !busy && setProblem(null)}
        title={
          problem === "release" ? "Release delivery" : "Report failed delivery"
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!delivery || !problem) return;
            const parsed = (
              problem === "release"
                ? RiderReleaseDeliverySchema
                : RiderFailDeliverySchema
            ).safeParse({ reason_code: problemReason, note: problemNote });
            if (!parsed.success) {
              setError(
                parsed.error.issues.map((issue) => issue.message).join(" "),
              );
              return;
            }
            void act(
              `/rider/deliveries/${encodeURIComponent(
                delivery.id,
              )}/${problem}`,
              parsed.data,
            );
          }}
        >
          <FormField label="Reason">
            <Select
              value={problemReason}
              onChange={(event) => setProblemReason(event.target.value)}
            >
              {[
                "OTHER",
                "CUSTOMER_UNREACHABLE",
                "CUSTOMER_REFUSED",
                "INCORRECT_ADDRESS",
                "ACCESS_DENIED",
                "ACCIDENT_OR_EMERGENCY",
                "MERCHANT_CLOSED",
                "DAMAGED_IN_TRANSIT",
              ].map((value) => (
                <option key={value} value={value}>
                  {value.toLowerCase().replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="What happened?" required>
            <Textarea
              required
              minLength={3}
              maxLength={500}
              value={problemNote}
              onChange={(event) => setProblemNote(event.target.value)}
            />
          </FormField>
          {error && <ErrorState message={error} />}
          <Button type="submit" variant="danger" isLoading={busy}>
            Confirm report
          </Button>
        </form>
      </Modal>
    </div>
  );
}

export function RiderEarnings() {
  const earnings = useResource<any>("/finance/rider/earnings");
  return (
    <>
      <PageHeading
        title="Earnings & payouts"
        action={
          <Button onClick={earnings.refresh} variant="outline">
            Refresh
          </Button>
        }
      />
      <ResourceState resource={earnings}>
        {earnings.data && (
          <div className="space-y-4">
            <MetricCard
              label="Available balance"
              value={<Price minor={earnings.data.available_balance_minor} />}
            />
            <h2 className="text-xl font-bold">Earnings</h2>
            {earnings.data.earnings?.map((entry: any) => (
              <Card key={entry.id}>
                <StatusBadge status={entry.status} />
                <p>{entry.order_id}</p>
                <Price minor={entry.total_amount_minor} />
              </Card>
            ))}
            <h2 className="text-xl font-bold">Payouts</h2>
            {earnings.data.payouts?.map((entry: any) => (
              <Card key={entry.id}>
                <StatusBadge status={entry.status} />
                <p>
                  {entry.period_start} — {entry.period_end}
                </p>
                {entry.amount_minor != null && (
                  <Price minor={entry.amount_minor} />
                )}
              </Card>
            ))}
            {!earnings.data.earnings?.length &&
              !earnings.data.payouts?.length && (
                <EmptyState
                  title="No earnings yet"
                  description="Your completed deliveries and payouts will appear here."
                />
              )}
          </div>
        )}
      </ResourceState>
    </>
  );
}
