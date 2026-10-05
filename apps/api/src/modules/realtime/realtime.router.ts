import { Router } from "express";
import { generateRequestId } from "@deetoo/utils";
import { orderEventBroker } from "./event-broker";
import {
  AuthenticatedRequest,
  requireAuth,
  requireRole,
} from "../auth/auth.middleware";
import { branchScope, deny, hasAnyRole, merchantScope } from "../auth/scope";
import { orderService } from "../order/order.service";
import { AppError } from "../../middleware/error-handler";

export const realtimeRouter = Router();
realtimeRouter.use(requireAuth);

export async function authorizeChannels(
  req: AuthenticatedRequest,
  channels: string[],
) {
  if (!channels.length || channels.length > 20)
    throw new AppError(
      400,
      "CHANNEL_REQUIRED",
      "Specify 1–20 concrete channels",
    );
  const user = req.user!;
  for (const channel of channels) {
    const [kind, id, extra] = channel.split(":");
    if (!id || extra) deny();
    if (
      kind === "admin" &&
      ["orders", "dispatch", "operations"].includes(id) &&
      hasAnyRole(user, ["admin", "ops"])
    )
      continue;
    if (kind === "customer" && id === user.id && hasAnyRole(user, ["customer"]))
      continue;
    if (kind === "rider" && id === user.id && hasAnyRole(user, ["rider"]))
      continue;
    if (kind === "merchant-branch") {
      await branchScope(user, id);
      continue;
    }
    if (kind === "merchant") {
      await merchantScope(user, id);
      continue;
    }
    if (kind === "order") {
      const order = await orderService.getOrderById(id);
      if (hasAnyRole(user, ["admin", "ops"])) continue;
      if (hasAnyRole(user, ["customer"]) && order.customer_id === user.id)
        continue;
      // Merchants use their scoped branch channel; riders use their private user channel.
    }
    deny();
  }
}

// Events are invalidations. Authoritative data is fetched from scoped REST APIs;
// raw domain payloads can contain OTPs, payment references and private profiles.
export function publicEvent(event: any) {
  return {
    id: event.id,
    type: event.type,
    channel: event.channel,
    order_id: event.order_id || event.orderId,
    status: event.status,
    timestamp: event.timestamp,
  };
}

realtimeRouter.get("/stream", async (req: AuthenticatedRequest, res, next) => {
  try {
    const channels =
      typeof req.query.channels === "string"
        ? req.query.channels
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : [];
    await authorizeChannels(req, channels);
    const reauthorize = async () => {
      await new Promise<void>((resolve, reject) =>
        requireAuth(req, res, (err) => (err ? reject(err) : resolve())),
      );
      await authorizeChannels(req, channels);
    };
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const clientId = generateRequestId();
    orderEventBroker.registerClient(
      clientId,
      res,
      channels,
      req.user!.id,
      reauthorize,
      publicEvent,
    );
    res.on("close", () => orderEventBroker.removeClient(clientId));
  } catch (err) {
    next(err);
  }
});

realtimeRouter.get("/events", async (req: AuthenticatedRequest, res, next) => {
  try {
    const channel =
      typeof req.query.channel === "string" ? req.query.channel : "";
    await authorizeChannels(req, channel ? [channel] : []);
    const since =
      typeof req.query.since === "string" ? req.query.since : undefined;
    if (since && !Number.isFinite(Date.parse(since)))
      throw new AppError(400, "INVALID_SINCE", "Invalid event timestamp");
    res.json({
      success: true,
      data: (await orderEventBroker.readEvents(channel, since)).map(publicEvent),
    });
  } catch (err) {
    next(err);
  }
});
realtimeRouter.get("/health", requireRole("admin", "ops"), (_req, res) => {
  res.json({
    status: "ok",
    connectedClients: orderEventBroker.getConnectedClientsCount(),
    timestamp: new Date().toISOString(),
  });
});
