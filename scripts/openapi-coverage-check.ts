/**
 * OpenAPI coverage check.
 *
 * DEE-API-001 §18 requires the OpenAPI contract to be "source-controlled and executable" and to
 * prevent frontend/backend type drift. A hand-maintained spec is only as trustworthy as the last
 * time someone remembered to update it alongside a route change -- so this script re-derives the
 * real route list directly from the Express router source (the same regex-based extraction used
 * to originally generate openapi/openapi.yaml) and fails the build if the two ever disagree in
 * either direction: a route added to a router with no matching openapi.yaml entry, or an
 * openapi.yaml entry for a route that no longer exists in code.
 *
 * This does not check that a route's request/response schema is accurate to its handler -- only
 * that the route exists in both places with matching method, path, and (for path-param names)
 * shape. Many operations in openapi.yaml are intentionally marked `STUB` in their summary because
 * their bodies have not been individually verified; this script does not police that, only drift.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';

interface RouterConfig {
  file: string;
  varName: string;
  prefix: string;
}

// Mirrors the mount configuration in apps/api/src/app.ts. Kept explicit (not auto-discovered)
// because the prefix a router is mounted under is a deployment decision, not something safely
// inferable from the router file itself.
const ROUTERS: RouterConfig[] = [
  { file: 'apps/api/src/modules/admin/admin.router.ts', varName: 'adminRouter', prefix: '/admin' },
  { file: 'apps/api/src/modules/auth/auth.router.ts', varName: 'authRouter', prefix: '/auth' },
  { file: 'apps/api/src/modules/cart/cart.router.ts', varName: 'cartRouter', prefix: '/cart' },
  { file: 'apps/api/src/modules/cart/cart.router.ts', varName: 'checkoutRouter', prefix: '/checkout' },
  { file: 'apps/api/src/modules/customer/customer.router.ts', varName: 'customerRouter', prefix: '/customer' },
  { file: 'apps/api/src/modules/finance/finance.router.ts', varName: 'financeRouter', prefix: '/finance' },
  { file: 'apps/api/src/modules/finance/finance-ops.router.ts', varName: 'financeOpsRouter', prefix: '/finance/ops' },
  { file: 'apps/api/src/modules/finance/disbursement.router.ts', varName: 'disbursementRouter', prefix: '/finance/disbursements' },
  { file: 'apps/api/src/modules/geography/geography.router.ts', varName: 'geographyRouter', prefix: '/admin/geography' },
  { file: 'apps/api/src/modules/health/health.router.ts', varName: 'healthRouter', prefix: '' },
  { file: 'apps/api/src/modules/merchant/catalogue.router.ts', varName: 'catalogueRouter', prefix: '/merchant' },
  { file: 'apps/api/src/modules/merchant/merchant-orders.router.ts', varName: 'merchantOrderRouter', prefix: '/merchant' },
  { file: 'apps/api/src/modules/merchant/merchant.router.ts', varName: 'merchantRouter', prefix: '/merchant' },
  { file: 'apps/api/src/modules/operations/operations.router.ts', varName: 'operationsRouter', prefix: '/admin' },
  { file: 'apps/api/src/modules/operations/device.router.ts', varName: 'deviceRouter', prefix: '/devices' },
  { file: 'apps/api/src/modules/media/media.router.ts', varName: 'mediaRouter', prefix: '/media' },
  { file: 'apps/api/src/modules/operations/operations.router.ts', varName: 'customerSupportRouter', prefix: '/support' },
  { file: 'apps/api/src/modules/order/order.router.ts', varName: 'orderRouter', prefix: '/orders' },
  { file: 'apps/api/src/modules/payment/payment.router.ts', varName: 'paymentRouter', prefix: '/payments' },
  { file: 'apps/api/src/modules/public/public.router.ts', varName: 'publicRouter', prefix: '/public' },
  { file: 'apps/api/src/modules/realtime/realtime.router.ts', varName: 'realtimeRouter', prefix: '/realtime' },
  { file: 'apps/api/src/modules/rider/rider.router.ts', varName: 'riderRouter', prefix: '/rider' },
];

interface Route {
  method: string;
  path: string;
}

function toOpenApiPath(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}').replace(/\/$/, '') || '/';
}

function extractRoutes(): Route[] {
  const routes: Route[] = [];
  const fileCache = new Map<string, string>();
  for (const { file, varName, prefix } of ROUTERS) {
    if (!fileCache.has(file)) {
      fileCache.set(file, readFileSync(file, 'utf8'));
    }
    const content = fileCache.get(file)!;
    const pattern = new RegExp(`${varName}\\.(get|post|put|patch|delete)\\(\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`, 'g');
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const method = m[1].toUpperCase();
      const rawPath = m[2].slice(1, -1);
      routes.push({ method, path: toOpenApiPath(prefix + rawPath) });
    }
  }
  return routes;
}

function main(): void {
  const routes = extractRoutes();
  const routeSet = new Set(routes.map((r) => `${r.method} ${r.path}`));

  const specText = readFileSync('openapi/openapi.yaml', 'utf8');
  const spec = loadYaml(specText) as { paths?: Record<string, Record<string, unknown>> };
  const specPaths = spec.paths || {};
  const specSet = new Set<string>();
  for (const [path, methods] of Object.entries(specPaths)) {
    for (const method of Object.keys(methods)) {
      specSet.add(`${method.toUpperCase()} ${path}`);
    }
  }

  const missingFromSpec = [...routeSet].filter((r) => !specSet.has(r)).sort();
  const staleInSpec = [...specSet].filter((r) => !routeSet.has(r)).sort();

  if (missingFromSpec.length === 0 && staleInSpec.length === 0) {
    console.log(`openapi-coverage-check: OK -- ${routeSet.size} routes match openapi/openapi.yaml exactly.`);
    return;
  }

  if (missingFromSpec.length > 0) {
    console.error(`\nRoutes in code with no openapi/openapi.yaml entry (${missingFromSpec.length}):`);
    for (const r of missingFromSpec) console.error(`  + ${r}`);
  }
  if (staleInSpec.length > 0) {
    console.error(`\nopenapi/openapi.yaml entries with no matching route in code (${staleInSpec.length}):`);
    for (const r of staleInSpec) console.error(`  - ${r}`);
  }
  console.error('\nopenapi-coverage-check: FAILED -- see drift above.');
  process.exit(1);
}

main();
