import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { config } from "@deetoo/config";
import { UserRole } from "@deetoo/types";
import { getDbPool } from "../../db/client";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import { AppError } from "../../middleware/error-handler";

export const KENYA_COUNTIES = [
  ["001","Mombasa"],["002","Kwale"],["003","Kilifi"],["004","Tana River"],["005","Lamu"],
  ["006","Taita-Taveta"],["007","Garissa"],["008","Wajir"],["009","Mandera"],["010","Marsabit"],
  ["011","Isiolo"],["012","Meru"],["013","Tharaka-Nithi"],["014","Embu"],["015","Kitui"],
  ["016","Machakos"],["017","Makueni"],["018","Nyandarua"],["019","Nyeri"],["020","Kirinyaga"],
  ["021","Murang'a"],["022","Kiambu"],["023","Turkana"],["024","West Pokot"],["025","Samburu"],
  ["026","Trans Nzoia"],["027","Uasin Gishu"],["028","Elgeyo-Marakwet"],["029","Nandi"],["030","Baringo"],
  ["031","Laikipia"],["032","Nakuru"],["033","Narok"],["034","Kajiado"],["035","Kericho"],
  ["036","Bomet"],["037","Kakamega"],["038","Vihiga"],["039","Bungoma"],["040","Busia"],
  ["041","Siaya"],["042","Kisumu"],["043","Homa Bay"],["044","Migori"],["045","Kisii"],
  ["046","Nyamira"],["047","Nairobi"],
] as const;

const countyUpdateSchema = z.object({ enabled: z.boolean() });
const marketCreateSchema = z.object({
  county_code: z.string().regex(/^\d{3}$/),
  name: z.string().trim().min(2).max(120),
  enabled: z.boolean().optional().default(true),
});

export const geographyRouter = Router();
geographyRouter.use(requireAuth);

geographyRouter.get(
  "/counties",
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") {
        return res.json({
          data: KENYA_COUNTIES.map(([code, name]) => ({
            code,
            name,
            country_code: "KE",
            enabled: code === "047",
            market_count: 0,
            zone_count: 0,
          })),
        });
      }

      const result = await getDbPool().query(`
        SELECT
          c.code,
          c.name,
          c.country_code,
          c.enabled,
          c.enabled_at,
          COUNT(DISTINCT m.id)::int AS market_count,
          COUNT(DISTINCT z.id)::int AS zone_count,
          COUNT(DISTINCT z.id) FILTER (WHERE z.status='ACTIVE' AND z.boundary IS NOT NULL)::int AS active_polygon_zone_count
        FROM operating_counties c
        LEFT JOIN service_markets m ON m.county_code=c.code
        LEFT JOIN service_zones z ON z.county_code=c.code
        GROUP BY c.code,c.name,c.country_code,c.enabled,c.enabled_at
        ORDER BY c.code
      `);
      return res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  },
);

geographyRouter.patch(
  "/counties/:code",
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") {
        throw new AppError(409, "POSTGRES_REQUIRED", "County operating scope is durable PostgreSQL configuration");
      }
      const { enabled } = countyUpdateSchema.parse(req.body);
      const result = await getDbPool().query(
        `UPDATE operating_counties
         SET enabled=$2,
             enabled_at=CASE WHEN $2 THEN NOW() ELSE NULL END,
             enabled_by=$3,
             updated_at=NOW()
         WHERE code=$1
         RETURNING *`,
        [req.params.code, enabled, req.user!.id],
      );
      if (!result.rows[0]) {
        throw new AppError(404, "COUNTY_NOT_FOUND", "Kenyan county not found");
      }
      return res.json({
        data: {
          ...result.rows[0],
          serviceability_note:
            "County enablement permits DeeToo operations; actual delivery reach remains limited by active PostGIS service-zone polygons.",
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

geographyRouter.get(
  "/markets",
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") return res.json({ data: [] });
      const params: unknown[] = [];
      let where = "";
      if (req.query.county_code) {
        params.push(String(req.query.county_code));
        where = "WHERE m.county_code=$1";
      }
      const result = await getDbPool().query(
        `SELECT
           m.id,m.county_code,c.name AS county_name,m.name,m.enabled,m.created_at,m.updated_at,
           COUNT(z.id)::int AS zone_count
         FROM service_markets m
         JOIN operating_counties c ON c.code=m.county_code
         LEFT JOIN service_zones z ON z.market_id=m.id
         ${where}
         GROUP BY m.id,m.county_code,c.name,m.name,m.enabled,m.created_at,m.updated_at
         ORDER BY c.name,m.name`,
        params,
      );
      return res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  },
);

geographyRouter.post(
  "/markets",
  requireRole(UserRole.ADMIN, UserRole.OPS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") {
        throw new AppError(409, "POSTGRES_REQUIRED", "Markets require durable PostgreSQL configuration");
      }
      const input = marketCreateSchema.parse(req.body);
      const county = await getDbPool().query(
        "SELECT code FROM operating_counties WHERE code=$1",
        [input.county_code],
      );
      if (!county.rows[0]) {
        throw new AppError(404, "COUNTY_NOT_FOUND", "Kenyan county not found");
      }
      const result = await getDbPool().query(
        `INSERT INTO service_markets(county_code,name,enabled)
         VALUES($1,$2,$3)
         ON CONFLICT(county_code,name)
         DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=NOW()
         RETURNING *`,
        [input.county_code, input.name, input.enabled],
      );
      return res.status(201).json({ data: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },
);

geographyRouter.get(
  "/zones",
  requireRole(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") return res.json({ data: [] });
      const params: unknown[] = [];
      const clauses: string[] = [];
      if (req.query.county_code) {
        params.push(String(req.query.county_code));
        clauses.push(`z.county_code=$${params.length}`);
      }
      if (req.query.market_id) {
        params.push(String(req.query.market_id));
        clauses.push(`z.market_id=$${params.length}::uuid`);
      }
      const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
      const result = await getDbPool().query(
        `SELECT
           z.id,z.name,z.status,z.city_id,z.county_code,c.name AS county_name,
           z.market_id,m.name AS market_name,
           (z.boundary IS NOT NULL) AS has_polygon,
           CASE WHEN z.boundary IS NOT NULL THEN ST_Area(z.boundary) ELSE NULL END AS polygon_area_square_meters,
           COUNT(DISTINCT bsz.branch_id)::int AS branch_count,
           COUNT(DISTINCT rsz.rider_id)::int AS rider_count
         FROM service_zones z
         LEFT JOIN operating_counties c ON c.code=z.county_code
         LEFT JOIN service_markets m ON m.id=z.market_id
         LEFT JOIN branch_service_zones bsz ON bsz.service_zone_id=z.id AND bsz.status='ACTIVE'
         LEFT JOIN rider_service_zones rsz ON rsz.zone_id=z.id
         ${where}
         GROUP BY z.id,z.name,z.status,z.city_id,z.county_code,c.name,z.market_id,m.name,z.boundary
         ORDER BY c.name NULLS LAST,m.name NULLS LAST,z.name`,
        params,
      );
      return res.json({
        data: result.rows,
        meta: {
          serviceability_model: "POSTGIS_POLYGON",
          hierarchy: ["Kenya", "County", "Market / town", "Service zone polygon"],
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
