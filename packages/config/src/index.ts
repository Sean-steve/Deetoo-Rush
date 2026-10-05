/**
 * DEETOO - Central Configuration Layer
 * Typed access to settings with fail-fast validation
 * Based on Section 13 & 14
 */

export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DeetooConfig {
  localWorkflow: boolean;
  storage: { mode: "postgres" | "memory"; fixtures: boolean };
  environment: AppEnvironment;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  api: {
    baseUrl: string;
    versionPrefix: string;
  };
  database: {
    url: string;
    maxConnections: number;
    idleTimeoutMs: number;
  };
  redis: {
    url: string;
    reconnectIntervalMs: number;
  };
  logging: {
    level: LogLevel;
  };
  security: {
    jwtSecret: string;
    jwtAccessTtlSeconds: number;
  };
  rider: {
    locationStaleSeconds: number;
    maxAccuracyMeters: number;
    foregroundUpdateIntervalMs: number;
    locationTtlSeconds: number;
    maxSpeedMps: number;
  };
  dispatch: {
    initialSearchRadius: number;
    radiusExpansionSteps: number[];
    maxSearchRadius: number;
    offerTimeoutSeconds: number;
    maxOffersPerCycle: number;
    retryIntervalsSeconds: number[];
    pickupArrivalBufferSeconds: number;
    expectedRiderPickupTravelTimeSeconds: number;
    maxActiveDeliveriesPerRider: number;
    routingCandidateLimit: number;
    dispatchSlaSeconds: number;
  };
  payment: {
    mpesa: {
      consumerKey: string;
      consumerSecret: string;
      passkey: string;
      shortcode: string;
      callbackUrl: string;
      webhookSecret: string;
      timeoutSeconds: number;
      initiatorName: string;
      securityCredential: string;
      resultUrl: string;
      timeoutUrl: string;
    };
    card: {
      publishableKey: string;
      secretKey: string;
      webhookSecret: string;
    };
    unpaidOrderTtlMinutes: number;
    enforcePrepayment: boolean;
  };
}

const rawEnv = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
if (!['development', 'test', 'staging', 'production'].includes(rawEnv)) throw new Error('Invalid APP_ENV/NODE_ENV');
const environment = rawEnv as AppEnvironment;
const deployed = environment === 'production' || environment === 'staging' || process.env.NODE_ENV === 'production';
const storageMode = process.env.DEETOO_STORAGE_MODE || 'postgres';
if (!['postgres', 'memory'].includes(storageMode) || (deployed && storageMode !== 'postgres')) throw new Error('Deployed environments require PostgreSQL storage');
const fixtures = process.env.DEETOO_FIXTURES === 'true';
const localWorkflow = process.env.DEETOO_LOCAL_WORKFLOW === 'true';
if (localWorkflow) {
  if (deployed || !['development','test'].includes(environment) || storageMode !== 'postgres') throw new Error('Local workflow requires non-deployed PostgreSQL');
  const database = new URL(process.env.DATABASE_URL || '');
  if (!['localhost','127.0.0.1','[::1]'].includes(database.hostname)) throw new Error('Local workflow requires a loopback database');
}

if (fixtures && (deployed || storageMode !== 'memory')) throw new Error('Fixtures require explicit non-deployed memory storage');
function resolveEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (deployed && ['JWT_SECRET','DATABASE_URL','REDIS_URL'].includes(key) && (!value || value === defaultValue)) {
    throw new Error('Missing explicit production configuration: ' + key);
  }
  if (key === 'JWT_SECRET' && deployed && (value!.length < 32 || /^(deetoo_dev_|sample|change_in_production)/i.test(value!))) throw new Error('JWT_SECRET is not a production secret');
  // Optional external integrations stay unconfigured in deployed environments.
  return value || (deployed ? '' : defaultValue || '');
}

export const config: DeetooConfig = {
  localWorkflow,
  storage: { mode: storageMode as "postgres" | "memory", fixtures },
  environment,
  isProduction: deployed,
  isDevelopment: !deployed && environment === 'development',
  isTest: !deployed && environment === 'test',
  port: parseInt(process.env.PORT || '3000', 10),
  api: {
    baseUrl: resolveEnv('API_BASE_URL', 'http://localhost:3000/api/v1'),
    versionPrefix: '/api/v1',
  },
  database: {
    url: resolveEnv('DATABASE_URL', 'postgres://postgres:postgrespassword@localhost:5432/deetoo_dev'),
    maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMs: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
  },
  redis: {
    url: resolveEnv('REDIS_URL', 'redis://localhost:6379'),
    reconnectIntervalMs: 5000,
  },
  logging: {
    level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  },
  security: {
    jwtSecret: resolveEnv('JWT_SECRET', 'deetoo_dev_jwt_secret_change_in_production_min_32_chars'),
    jwtAccessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL_SECONDS || '900', 10),
  },
  rider: {
    locationStaleSeconds: parseInt(process.env.RIDER_LOCATION_STALE_SECONDS || '90', 10),
    maxAccuracyMeters: parseInt(process.env.RIDER_MAX_ACCURACY_METERS || '100', 10),
    foregroundUpdateIntervalMs: parseInt(process.env.RIDER_FOREGROUND_UPDATE_INTERVAL_MS || '15000', 10),
    locationTtlSeconds: parseInt(process.env.RIDER_LOCATION_TTL_SECONDS || '180', 10),
    maxSpeedMps: parseInt(process.env.RIDER_MAX_SPEED_MPS || '45', 10),
  },
  dispatch: {
    initialSearchRadius: parseInt(process.env.DISPATCH_INITIAL_SEARCH_RADIUS || '2000', 10),
    radiusExpansionSteps: [2000, 4000, 6000],
    maxSearchRadius: parseInt(process.env.DISPATCH_MAX_SEARCH_RADIUS || '8000', 10),
    offerTimeoutSeconds: parseInt(process.env.DISPATCH_OFFER_TIMEOUT_SECONDS || '30', 10),
    maxOffersPerCycle: parseInt(process.env.DISPATCH_MAX_OFFERS_PER_CYCLE || '5', 10),
    retryIntervalsSeconds: [30, 60, 120],
    pickupArrivalBufferSeconds: parseInt(process.env.DISPATCH_PICKUP_ARRIVAL_BUFFER_SECONDS || '120', 10),
    expectedRiderPickupTravelTimeSeconds: parseInt(process.env.DISPATCH_EXPECTED_RIDER_PICKUP_TRAVEL_TIME_SECONDS || '480', 10),
    maxActiveDeliveriesPerRider: 1,
    routingCandidateLimit: parseInt(process.env.DISPATCH_ROUTING_CANDIDATE_LIMIT || '10', 10),
    dispatchSlaSeconds: parseInt(process.env.DISPATCH_SLA_SECONDS || '480', 10),
  },
  payment: {
    mpesa: {
      consumerKey: resolveEnv('MPESA_CONSUMER_KEY', 'sandbox_consumer_key'),
      consumerSecret: resolveEnv('MPESA_CONSUMER_SECRET', 'sandbox_consumer_secret'),
      passkey: resolveEnv('MPESA_PASSKEY', 'sandbox_passkey'),
      shortcode: resolveEnv('MPESA_SHORTCODE', '174379'),
      callbackUrl: resolveEnv('MPESA_CALLBACK_URL', 'http://localhost:3000/api/v1/payments/providers/mpesa/callback'),
      webhookSecret: resolveEnv('MPESA_WEBHOOK_SECRET', 'mpesa_webhook_secret_dev'),
      timeoutSeconds: parseInt(process.env.MPESA_TIMEOUT_SECONDS || '60', 10),
      // Transaction Status Query / Reversal (Wave 2 authoritative evidence, ADR-007). Read directly
      // from process.env by the Daraja provider's own required() guard, not through this object;
      // listed here so `.env.example` and this config stay the single documented source of truth.
      initiatorName: resolveEnv('MPESA_INITIATOR_NAME', ''),
      securityCredential: resolveEnv('MPESA_SECURITY_CREDENTIAL', ''),
      resultUrl: resolveEnv('MPESA_RESULT_URL', 'http://localhost:3000/api/v1/payments/providers/mpesa/transaction-result'),
      timeoutUrl: resolveEnv('MPESA_TIMEOUT_URL', 'http://localhost:3000/api/v1/payments/providers/mpesa/transaction-timeout'),
    },
    card: {
      publishableKey: resolveEnv('CARD_PUBLISHABLE_KEY', 'pk_test_sample'),
      secretKey: resolveEnv('CARD_SECRET_KEY', 'sk_test_sample'),
      webhookSecret: resolveEnv('CARD_WEBHOOK_SECRET', 'card_webhook_secret_dev'),
    },
    unpaidOrderTtlMinutes: parseInt(process.env.UNPAID_ORDER_TTL_MINUTES || '15', 10),
    enforcePrepayment: true,
  },
};
