/**
 * DEETOO - Modular Monolith Domain Index
 * Implements architectural boundaries for future service extraction (DEE-ARC-001)
 */

import { Router, Request, Response } from 'express';
import { ApiResponse } from '@deetoo/types';
import { DEMO_SERVICE_ZONE, SYSTEM_ROLES, LEDGER_SYSTEM_ACCOUNTS } from '../../../../scripts/db-seed';
import { AppError } from '../middleware/error-handler';
import { authRouter } from './auth/auth.router';
import { adminRouter } from './admin/admin.router';
import { merchantRouter } from './merchant/merchant.router';
import { publicRouter } from './public/public.router';
import { customerRouter } from './customer/customer.router';
import { cartRouter, checkoutRouter } from './cart/cart.router';
import { orderRouter } from './order/order.router';
import { riderRouter } from './rider/rider.router';
import { realtimeRouter } from './realtime/realtime.router';
import { paymentRouter } from './payment/payment.router';
import { financeRouter } from './finance/finance.router';
import { disbursementRouter } from './finance/disbursement.router';
import { operationsRouter, customerSupportRouter } from './operations/operations.router';
import { deviceRouter } from './operations/device.router';
import { mediaRouter } from './media/media.router';
import { discoveryService } from './discovery/discovery.service';
import { serviceabilityService } from './serviceability/serviceability.service';
import { mapsProvider } from './maps/maps.provider';

export const v1Router = Router();

// Domain Sub-routers
v1Router.use('/auth', authRouter);
v1Router.use('/admin', adminRouter);
v1Router.use('/admin/operations', operationsRouter);
v1Router.use('/operations', operationsRouter);
v1Router.use('/customer/support', customerSupportRouter);
v1Router.use('/merchant', merchantRouter);
v1Router.use('/public', publicRouter);
v1Router.use('/customer', customerRouter);
v1Router.use('/cart', cartRouter);
v1Router.use('/checkout', checkoutRouter);
v1Router.use('/orders', orderRouter);
v1Router.use('/payments', paymentRouter);
v1Router.use('/finance/disbursements', disbursementRouter);
v1Router.use('/finance', financeRouter);
v1Router.use('/rider', riderRouter);
v1Router.use('/realtime', realtimeRouter);
v1Router.use('/devices', deviceRouter);
v1Router.use('/media', mediaRouter);

// ==========================================
// Public Customer Discovery Endpoints (Sprint 5)
// ==========================================

/**
 * GET /api/v1/restaurants
 * Primary customer restaurant discovery feed with location, category & search
 */
v1Router.get('/restaurants', async (req: Request, res: Response, next) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : req.query.latitude ? parseFloat(req.query.latitude as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : req.query.longitude ? parseFloat(req.query.longitude as string) : undefined;
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const openNow = req.query.open_now === 'true';
    const sort = req.query.sort as 'recommended' | 'distance' | 'open_now' | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await discoveryService.discoverRestaurants({
      latitude: lat,
      longitude: lng,
      search,
      category,
      open_now: openNow,
      sort,
      page,
      limit,
    });

    res.json({
      data: result.restaurants,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        serviceability: result.serviceability,
      },
      requestId: (req as any).requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/restaurants/:id
 * Customer restaurant branch detail & operational info
 */
v1Router.get('/restaurants/:id', async (req: Request, res: Response, next) => {
  try {
    const branchId = req.params.id;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;

    const detail = await discoveryService.getRestaurantDetail(branchId, lat, lng);
    res.json({
      data: detail,
      requestId: (req as any).requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/restaurant-categories
 * List active cuisine and restaurant categories
 */
v1Router.get('/restaurant-categories', async (req: Request, res: Response, next) => {
  try {
    const categories = await discoveryService.listCategories();
    res.json({
      data: categories,
      requestId: (req as any).requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/serviceability
 * Check location serviceability using PostGIS polygons and active branch counts
 */
v1Router.get('/serviceability', async (req: Request, res: Response, next) => {
  try {
    const lat = parseFloat((req.query.lat || req.query.latitude) as string);
    const lng = parseFloat((req.query.lng || req.query.longitude) as string);

    const result = await serviceabilityService.checkServiceability(lat, lng);
    res.json({
      data: result,
      requestId: (req as any).requestId,
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// Maps & Geocoding Endpoints (Sprint 5)
// ==========================================

v1Router.get('/maps/geocode', async (req: Request, res: Response, next) => {
  try {
    const address = (req.query.address as string) || '';
    const results = await mapsProvider.geocode(address);
    res.json({
      data: results,
      requestId: (req as any).requestId,
    });
  } catch (err) {
    next(err);
  }
});

v1Router.get('/maps/reverse-geocode', async (req: Request, res: Response, next) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const result = await mapsProvider.reverseGeocode(lat, lng);
    res.json({
      data: result,
      requestId: (req as any).requestId,
    });
  } catch (err) {
    next(err);
  }
});

v1Router.get('/maps/autocomplete', async (req: Request, res: Response, next) => {
  try {
    const input = (req.query.input as string) || '';
    const results = await mapsProvider.autocomplete(input);
    res.json({
      data: results,
      requestId: (req as any).requestId,
    });
  } catch (err) {
    next(err);
  }
});

// Test error endpoint to verify centralized error envelope formatting
v1Router.get('/test/error', (req: Request, res: Response, next) => {
  next(
    new AppError(409, 'ORDER_INVALID_STATE', 'Order cannot be accepted from its current state', {
      current_state: 'CANCELLED',
    })
  );
});

// Platform Baseline Spec & Info
v1Router.get('/system/info', (req: Request, res: Response) => {
  const response: ApiResponse<{
    name: string;
    version: string;
    sprint: string;
    architecture: string;
    systemZones: typeof DEMO_SERVICE_ZONE[];
    systemRoles: typeof SYSTEM_ROLES;
    chartOfAccounts: typeof LEDGER_SYSTEM_ACCOUNTS;
  }> = {
    data: {
      name: 'Deetoo Platform Central API',
      version: '1.0.0',
      sprint: 'Sprint 5 - Customer Profiles, Addresses, Restaurant Discovery & Serviceability',
      architecture: 'Modular Monolith with PostgreSQL/PostGIS, Redis, Double-Entry Ledger, 4 App Shells',
      systemZones: [DEMO_SERVICE_ZONE],
      systemRoles: SYSTEM_ROLES,
      chartOfAccounts: LEDGER_SYSTEM_ACCOUNTS,
    },
    requestId: (req as any).requestId,
  };
  res.json(response);
});

// Orders endpoint baseline stub (DEE-API-001 Section 9)
v1Router.get('/orders', (req: Request, res: Response) => {
  res.json({
    data: [],
    meta: { has_more: false },
    requestId: (req as any).requestId,
  });
});
