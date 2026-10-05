import { config } from '@deetoo/config';
import { enqueueEvent, readChannelEvents } from './outbox';
/**
 * DEETOO - Realtime Event Broker & Outbox Dispatcher
 * Multi-channel publish-subscribe mechanism for Customer, Merchant & Admin updates (Section 29, 142)
 * Supports SSE streaming, channel filtering, in-memory buffering, and PostgreSQL outbox persistence.
 */

import { Response } from "express";
import { RealtimeOrderEvent } from "@deetoo/types";
import { logger } from "@deetoo/utils";
import { getDbPool } from "../../db/client";

export interface SSEClient {
  id: string;
  userId?: string;
  channels: Set<string>;
  res: Response;
  createdAt: number;
  authorize?: () => Promise<void>;
  serialize?: (event: RealtimeOrderEvent) => unknown;
}

export class OrderEventBroker {
  private clients = new Map<string, SSEClient>();
  private eventHistory: RealtimeOrderEvent[] = [];
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Keep connection alive with periodic SSE comments every 15 seconds
    this.pingInterval = setInterval(() => {
      this.broadcastPing();
    }, 15000);
    if (this.pingInterval.unref) {
      this.pingInterval.unref();
    }
  }

  /**
   * Register a new SSE subscriber client
   */
  public registerClient(
    id: string,
    res: Response,
    channels: string[],
    userId?: string,
    authorize?: () => Promise<void>,
    serialize?: (event: RealtimeOrderEvent) => unknown,
  ): SSEClient {
    const client: SSEClient = {
      id,
      userId,
      authorize,
      serialize,
      channels: new Set(channels),
      res,
      createdAt: Date.now(),
    };

    this.clients.set(id, client);

    logger.info("Realtime client connected", {
      service: "realtime",
      metadata: { clientId: id, channels, totalClients: this.clients.size },
    });

    // Send initial connected handshake event
    this.sendEventToClient(client, {
      type: "connected" as any,
      channel: "system",
      order_id: "",
      order_number: "",
      status: "PLACED" as any,
      timestamp: new Date().toISOString(),
      data: { clientId: id, channels: Array.from(client.channels) },
    });

    return client;
  }

  /**
   * Remove a disconnected client
   */
  public removeClient(id: string) {
    if (this.clients.has(id)) {
      this.clients.delete(id);
      logger.info("Realtime client disconnected", {
        service: "realtime",
        metadata: { clientId: id, remainingClients: this.clients.size },
      });
    }
  }

  /**
   * Add channels to an existing client
   */
  public subscribeChannels(clientId: string, channels: string[]) {
    const client = this.clients.get(clientId);
    if (client) {
      channels.forEach((c) => client.channels.add(c));
    }
  }

  /**
   * Publish an order event to target channels, outbox table, and history buffer
   */
  public async publish(
    channel: string,
    event: RealtimeOrderEvent,
  ): Promise<void> {
    if (config.storage.mode === 'postgres') { await enqueueEvent(channel,event); return; }
    await this.deliver({ ...event, channel });
  }

  public async deliver(event: RealtimeOrderEvent): Promise<void> {
    const channel = event.channel;
    // 1. Add to rolling history buffer (keep last 100 events)
    this.eventHistory.push(event);
    if (this.eventHistory.length > 100) {
      this.eventHistory.shift();
    }

    // 2. Deliver to active SSE subscribers matching channel or wildcard
    let deliveredCount = 0;
    for (const client of this.clients.values()) {
      if (client.channels.has(channel)) {
        try {
          await client.authorize?.();
        } catch {
          client.res.end();
          this.removeClient(client.id);
          continue;
        }
        this.sendEventToClient(client, event);
        deliveredCount++;
      }
    }

    logger.info(`Realtime event published to channel [${channel}]`, {
      service: "realtime",
      metadata: {
        channel,
        type: event.type,
        orderId: event.order_id,
        orderNumber: event.order_number,
        status: event.status,
        deliveredCount,
      },
    });

  }

  public async readEvents(channel:string,since?:string) {
    return config.storage.mode === "postgres" ? readChannelEvents(channel,since) : this.getRecentEvents(channel,since);
  }

  /**
   * Formats and writes an SSE event
   */
  private sendEventToClient(client: SSEClient, event: RealtimeOrderEvent) {
    try {
      const dataStr = JSON.stringify(
        client.serialize ? client.serialize(event) : event,
      );
      if ((event as any).id) client.res.write(`id: ${(event as any).id}\n`);
      client.res.write(`event: ${event.type}\n`);
      client.res.write(`data: ${dataStr}\n\n`);
    } catch (err: any) {
      logger.warn("Failed to write SSE event to client, pruning", {
        service: "realtime",
        metadata: { clientId: client.id, error: err.message },
      });
      this.removeClient(client.id);
    }
  }

  /**
   * Broadcast periodic ping comment to prevent reverse proxies and browsers from timing out
   */
  private async broadcastPing() {
    const timestamp = Date.now();
    for (const client of this.clients.values()) {
      try {
        await client.authorize?.();
        client.res.write(`:ping ${timestamp}\n\n`);
      } catch {
        client.res.end();
        this.removeClient(client.id);
      }
    }
  }

  /**
   * Retrieve recent events for polling fallback
   */
  public getRecentEvents(
    channel?: string,
    sinceTimestamp?: string,
  ): RealtimeOrderEvent[] {
    let filtered = this.eventHistory;
    if (channel) {
      filtered = filtered.filter((e) => e.channel === channel);
    }
    if (sinceTimestamp) {
      const since = new Date(sinceTimestamp).getTime();
      filtered = filtered.filter(
        (e) => new Date(e.timestamp).getTime() > since,
      );
    }
    return filtered;
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }
}

export const orderEventBroker = new OrderEventBroker();
