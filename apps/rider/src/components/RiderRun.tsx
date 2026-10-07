import React, { useEffect, useState } from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Price,
  Select,
  Modal,
  Textarea,
  Countdown,
  InlineBanner,
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
  RiderArrivePickupSchema,
  RiderArriveDropoffSchema,
  RiderCompleteDeliverySchema,
  RiderConfirmPickupSchema,
  RiderRejectOfferSchema,
  RiderFailDeliverySchema,
  RiderReleaseDeliverySchema,
} from "@deetoo/validation";
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
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const delivery = active.data?.delivery;
  const offerExpiry = offer.data?.offer?.expires_at;
  const [offerExpired, setOfferExpired] = useState(false);
  useEffect(() => {
    setOfferExpired(
      !offerExpiry || new Date(offerExpiry).getTime() <= Date.now(),
    );
  }, [offer.data?.offer?.id, offerExpiry]);
  const next: Record<string, [string, string]> = {
    ASSIGNED: ["arrive-pickup", "Arrived at kitchen"],
    ARRIVED_PICKUP: ["confirm-pickup", "Confirm pickup"],
    PICKED_UP: ["start-trip", "Start trip"],
    EN_ROUTE: ["arrive-dropoff", "Arrived at customer"],
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
    if (action === "confirm-pickup") body = { pickup_verification_code: code };
    if (action === "complete")
      body = { proof_type: "OTP", otp: code, ...coordinates };
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
        setError(result.error.issues.map((i) => i.message).join(" "));
        return;
      }
      body = result.data;
    }
    await act(
      `/rider/deliveries/${encodeURIComponent(delivery.id)}/${action}`,
      body,
    );
  }
  return (
    <div className="space-y-5">
      <PageHeading
        title="Your delivery run"
        eyebrow="Offers & active delivery"
      />
      {error && <ErrorState message={error} />}
      <ResourceState resource={active}>
        {delivery ? (
          <Card className="space-y-4">
            <StatusBadge status={delivery.status} />
            <h2 className="text-2xl font-bold">{delivery.order_number}</h2>
            <div className="delivery-stops">
              <div>
                <p className="eyebrow">Pickup point</p>
                <h3>{active.data?.order?.branch_name || "Kitchen"}</h3>
                <p>{delivery.pickup_address_text}</p>
              </div>
              <div>
                <p className="eyebrow">Dropoff destination</p>
                <h3>{active.data?.order?.customer_name || "Customer"}</h3>
                <p>{delivery.dropoff_address_text}</p>
              </div>
            </div>
            <ResourceState resource={authoritativeAmount}>
              {authoritativeAmount.data && (
                <InlineBanner
                  kind="success"
                  title="Authoritative amount payable at handover"
                >
                  <p className="text-2xl font-bold">
                    KES {(Number(authoritativeAmount.data.amount_due_at_handover_minor || 0) / 100).toFixed(2)}
                  </p>
                  <p className="mt-1">
                    Never request a different amount outside DeeToo. Digital-paid orders normally show KES 0.00 here.
                  </p>
                </InlineBanner>
              )}
            </ResourceState>
            {delivery.delivery_instructions && (
              <p>{delivery.delivery_instructions}</p>
            )}
            <ResourceState resource={detail}>
              {detail.data?.navigation && (
                <a
                  className="deetoo-button deetoo-button-outline flex justify-center p-3"
                  href={
                    ["ASSIGNED", "ARRIVED_PICKUP"].includes(delivery.status)
                      ? detail.data.navigation.pickupMapsUrl
                      : detail.data.navigation.dropoffMapsUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Open navigation
                </a>
              )}
            </ResourceState>
            {["ARRIVED_PICKUP", "ARRIVED_DROPOFF"].includes(
              delivery.status,
            ) && (
              <FormField
                label={
                  delivery.status === "ARRIVED_PICKUP"
                    ? "Kitchen verification code"
                    : "Customer delivery code"
                }
                required
              >
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </FormField>
            )}
            <Button
              variant="outline"
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
            {next[delivery.status] && (
              <Button
                className="w-full"
                isLoading={busy}
                disabled={
                  Boolean(active.error) ||
                  (["ARRIVED_PICKUP", "ARRIVED_DROPOFF"].includes(
                    delivery.status,
                  ) &&
                    code.length < 4)
                }
                onClick={advance}
              >
                {next[delivery.status][1]}
              </Button>
            )}
          </Card>
        ) : (
          <ResourceState resource={offer}>
            {offer.data?.offer ? (
              <Card className="space-y-5">
                <div className="flex justify-between">
                  <StatusBadge status={offer.data.offer.status} />
                  <Countdown
                    expiresAt={offer.data.offer.expires_at}
                    warningAtSeconds={30}
                    onExpire={() => setOfferExpired(true)}
                    className="text-2xl text-brand"
                  />
                </div>
                <h2 className="text-xl font-bold">New delivery offer</h2>
                <div className="delivery-stops">
                  <div>
                    <p className="eyebrow">Pickup point</p>
                    <h3>{offer.data.restaurantName}</h3>
                    <p>{offer.data.pickupAddress}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Dropoff destination</p>
                    <p>{offer.data.dropoffAddress}</p>
                  </div>
                </div>
                {offer.data.distanceToPickupMeters != null && (
                  <p>
                    {(offer.data.distanceToPickupMeters / 1000).toFixed(1)} km
                    to pickup
                  </p>
                )}
                {offer.data.estimatedPickupEtaSeconds != null && (
                  <p>
                    Estimated{" "}
                    {Math.ceil(offer.data.estimatedPickupEtaSeconds / 60)}{" "}
                    minutes to pickup
                  </p>
                )}
                <Button
                  className="w-full"
                  disabled={busy || offerExpired || Boolean(offer.error)}
                  onClick={() =>
                    act(
                      `/rider/offers/${encodeURIComponent(offer.data.offer.id)}/accept`,
                    )
                  }
                >
                  Accept offer
                </Button>
                <FormField label="Decline reason">
                  <Select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    {[
                      "OTHER",
                      "TOO_FAR",
                      "ENDING_SHIFT",
                      "VEHICLE_ISSUE",
                      "AREA_UNFAMILIAR",
                      "INSUFFICIENT_PAY",
                      "PERSONAL_EMERGENCY",
                    ].map((r) => (
                      <option key={r} value={r}>
                        {r.toLowerCase().replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <Button
                  variant="ghost"
                  disabled={busy || offerExpired}
                  onClick={() =>
                    act(
                      `/rider/offers/${encodeURIComponent(offer.data.offer.id)}/reject`,
                      RiderRejectOfferSchema.parse({ reason_code: reason }),
                    )
                  }
                >
                  Decline offer
                </Button>
              </Card>
            ) : (
              !offer.loading &&
              !offer.error && (
                <EmptyState
                  title="No active offer"
                  description="Go online with a fresh GPS signal to receive eligible delivery offers."
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
          onSubmit={(e) => {
            e.preventDefault();
            if (!delivery || !problem) return;
            const parsed = (
              problem === "release"
                ? RiderReleaseDeliverySchema
                : RiderFailDeliverySchema
            ).safeParse({ reason_code: problemReason, note: problemNote });
            if (!parsed.success) {
              setError(parsed.error.issues.map((i) => i.message).join(" "));
              return;
            }
            void act(
              `/rider/deliveries/${encodeURIComponent(delivery.id)}/${problem}`,
              parsed.data,
            );
          }}
        >
          <FormField label="Reason">
            <Select
              value={problemReason}
              onChange={(e) => setProblemReason(e.target.value)}
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
              onChange={(e) => setProblemNote(e.target.value)}
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
