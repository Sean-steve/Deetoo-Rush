import { randomUUID } from "node:crypto";
import { config } from "@deetoo/config";
import { DeliveryStatus, RiderPerformanceMetrics } from "@deetoo/types";
import { AppError } from "../../middleware/error-handler";
import { getDbPool } from "../../db/client";
import { orderRepository } from "../order/order.repository";
import { deliveryRepository } from "../order/delivery.repository";
import { trustService } from "./trust.service";

type Rating = {
  id: string;
  order_id: string;
  delivery_id: string;
  rider_id: string;
  customer_id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
};

export class RiderPerformanceService {
  private ratings = new Map<string, Rating>();

  public clearInMemory(): void {
    this.ratings.clear();
  }

  public async rateDelivery(
    customerId: string,
    orderId: string,
    rating: number,
    comment?: string,
  ): Promise<Rating> {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError(400, "INVALID_RATING", "Rating must be an integer from 1 to 5");
    }
    const order = await orderRepository.findById(orderId);
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.customer_id !== customerId) {
      throw new AppError(403, "FORBIDDEN_RATING", "You can only rate your own completed delivery");
    }
    const delivery = await deliveryRepository.findByOrderId(orderId);
    if (!delivery || delivery.status !== DeliveryStatus.DELIVERED || !delivery.assigned_rider_id) {
      throw new AppError(409, "DELIVERY_NOT_RATABLE", "A delivery can only be rated after verified completion");
    }

    const now = new Date().toISOString();
    const item: Rating = {
      id: randomUUID(),
      order_id: orderId,
      delivery_id: delivery.id,
      rider_id: delivery.assigned_rider_id,
      customer_id: customerId,
      rating,
      comment: comment?.trim().slice(0, 1000) || null,
      created_at: now,
    };

    if (config.storage.mode === "postgres") {
      try {
        const result = await getDbPool().query(
          `INSERT INTO delivery_ratings
            (id,order_id,delivery_id,rider_id,customer_id,rating,comment,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [item.id, item.order_id, item.delivery_id, item.rider_id, item.customer_id, item.rating, item.comment, item.created_at],
        );
        return {
          ...result.rows[0],
          rating: Number(result.rows[0].rating),
          created_at: new Date(result.rows[0].created_at).toISOString(),
        };
      } catch (error: any) {
        if (String(error?.code) === "23505") {
          throw new AppError(409, "DELIVERY_ALREADY_RATED", "This order already has a customer delivery rating");
        }
        throw error;
      }
    }

    const existing = [...this.ratings.values()].find(
      (entry) => entry.order_id === orderId && entry.customer_id === customerId,
    );
    if (existing) throw new AppError(409, "DELIVERY_ALREADY_RATED", "This order already has a customer delivery rating");
    this.ratings.set(item.id, item);
    return item;
  }

  private async ratingsForRider(riderId: string): Promise<Rating[]> {
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query(
        "SELECT * FROM delivery_ratings WHERE rider_id=$1 ORDER BY created_at DESC",
        [riderId],
      );
      return result.rows.map((row: any) => ({
        ...row,
        rating: Number(row.rating),
        created_at: new Date(row.created_at).toISOString(),
      }));
    }
    return [...this.ratings.values()].filter((entry) => entry.rider_id === riderId);
  }

  private ratio(numerator: number, denominator: number): number | null {
    if (!denominator) return null;
    return Number((numerator / denominator).toFixed(4));
  }

  public async getMetrics(
    riderId: string,
    options?: { windowDays?: number },
  ): Promise<RiderPerformanceMetrics & { definitions: Record<string, string> }> {
    const windowDays = Math.max(1, Math.min(180, options?.windowDays || 30));
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const deliveries = (await deliveryRepository.findAll()).filter((delivery) => {
      const timestamp = delivery.created_at || delivery.assigned_at || delivery.updated_at;
      return (
        delivery.assigned_rider_id === riderId &&
        (!timestamp || new Date(timestamp).getTime() >= windowStart.getTime())
      );
    });
    const offers = (await deliveryRepository.getOffersByRiderId(riderId)).filter(
      (offer) => new Date(offer.offered_at).getTime() >= windowStart.getTime(),
    );
    const ratings = (await this.ratingsForRider(riderId)).filter(
      (entry) => new Date(entry.created_at).getTime() >= windowStart.getTime(),
    );
    const conductReports = (await trustService.listConductReports()).filter(
      (report) =>
        report.rider_id === riderId &&
        report.status === "SUBSTANTIATED" &&
        new Date(report.created_at).getTime() >= windowStart.getTime(),
    );

    const completed = deliveries.filter((delivery) => delivery.status === DeliveryStatus.DELIVERED);
    const terminal = deliveries.filter((delivery) =>
      [DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED].includes(delivery.status),
    );
    const cancelledOrFailed = terminal.filter((delivery) =>
      [DeliveryStatus.CANCELLED, DeliveryStatus.FAILED].includes(delivery.status),
    );

    const respondedOffers = offers.filter((offer) =>
      ["ACCEPTED", "REJECTED", "EXPIRED"].includes(String(offer.status)),
    );
    const acceptedOffers = respondedOffers.filter((offer) => String(offer.status) === "ACCEPTED");

    const pickupSamples = deliveries.filter(
      (delivery) => Boolean(delivery.estimated_ready_at && delivery.arrived_pickup_at),
    );
    const pickupPunctual = pickupSamples.filter((delivery) => {
      const deadline = new Date(delivery.estimated_ready_at!).getTime() + 10 * 60 * 1000;
      return new Date(delivery.arrived_pickup_at!).getTime() <= deadline;
    });

    const ratingAverage = ratings.length
      ? Number((ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.length).toFixed(2))
      : null;

    const metrics: RiderPerformanceMetrics & { definitions: Record<string, string> } = {
      rider_id: riderId,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      completion_rate: this.ratio(completed.length, terminal.length),
      offer_acceptance_rate: this.ratio(acceptedOffers.length, respondedOffers.length),
      pickup_punctuality_rate: this.ratio(pickupPunctual.length, pickupSamples.length),
      // DeeToo does not yet persist an authoritative promised delivery deadline per order.
      // Returning null is safer and more explainable than manufacturing an ETA-based score.
      delivery_punctuality_rate: null,
      customer_rating: ratingAverage,
      customer_rating_count: ratings.length,
      confirmed_conduct_incidents: conductReports.length,
      cancellation_rate: this.ratio(cancelledOrFailed.length, terminal.length),
      // Historical GPS heartbeat completeness is not yet durably sampled. Do not infer reliability
      // from one "last location" field.
      gps_reliability_rate: null,
      sample_sizes: {
        deliveries: deliveries.length,
        terminal_deliveries: terminal.length,
        offers: offers.length,
        responded_offers: respondedOffers.length,
        pickup_punctuality: pickupSamples.length,
        delivery_punctuality: 0,
        ratings: ratings.length,
        gps_reliability: 0,
        conduct_incidents: conductReports.length,
      },
      enforcement: {
        automatic_suspension: false,
        requires_human_review: true,
      },
      definitions: {
        completion_rate: "Verified delivered jobs divided by terminal assigned jobs in the selected window.",
        offer_acceptance_rate: "Accepted offers divided by offers with a Rider response/expiry in the selected window.",
        pickup_punctuality_rate: "Arrival at pickup no later than 10 minutes after the merchant estimated-ready timestamp.",
        delivery_punctuality_rate: "Not scored until an authoritative promised delivery deadline is durably stored.",
        customer_rating: "Arithmetic mean of verified post-delivery customer ratings; never an automatic suspension trigger.",
        confirmed_conduct_incidents: "Human-reviewed conduct cases marked substantiated in the selected window.",
        cancellation_rate: "Assigned jobs ending CANCELLED or FAILED divided by terminal assigned jobs.",
        gps_reliability_rate: "Not scored until durable GPS heartbeat history is available.",
      },
    };

    return metrics;
  }
}

export const riderPerformanceService = new RiderPerformanceService();
