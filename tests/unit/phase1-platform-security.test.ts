import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  applyAuthTransport,
} from '../../apps/api/src/modules/auth/auth.transport';
import { securityHeadersMiddleware } from '../../apps/api/src/middleware/security';
import { DispatchService } from '../../apps/api/src/modules/order/dispatch.service';

function mockRequest(overrides: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    ...(overrides.headers as Record<string, string> | undefined),
  };
  return {
    method: 'GET',
    path: '/api/v1/test',
    headers,
    body: {},
    header(name: string) {
      return headers[name.toLowerCase()] || headers[name] || undefined;
    },
    ...overrides,
  } as any;
}

function mockResponse() {
  const state: any = { headers: {}, cookies: [], statusCode: 200, body: undefined };
  const response: any = {
    setHeader(name: string, value: unknown) {
      state.headers[name] = value;
      return response;
    },
    cookie(name: string, value: string, options: unknown) {
      state.cookies.push({ name, value, options });
      return response;
    },
    clearCookie() {
      return response;
    },
    status(code: number) {
      state.statusCode = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
    sendStatus(code: number) {
      state.statusCode = code;
      return response;
    },
  };
  return { response, state };
}

test('cookie auth transport keeps access and refresh credentials out of response JSON', () => {
  const req = mockRequest({
    headers: { 'X-Auth-Transport': 'cookie' },
  });
  const { response, state } = mockResponse();
  const output: any = applyAuthTransport(req, response, {
    user: { id: 'user-1' },
    session: { id: 'session-1' },
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
  });

  assert.equal(output.accessToken, undefined);
  assert.equal(output.refreshToken, undefined);
  assert.deepEqual(
    state.cookies.map((cookie: any) => cookie.name).sort(),
    [ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME].sort(),
  );
  const access = state.cookies.find((cookie: any) => cookie.name === ACCESS_COOKIE_NAME);
  const refresh = state.cookies.find((cookie: any) => cookie.name === REFRESH_COOKIE_NAME);
  assert.equal(access.options.httpOnly, true);
  assert.equal(refresh.options.httpOnly, true);
});

test('cookie-authenticated unsafe requests require matching CSRF token', () => {
  const req = mockRequest({
    method: 'POST',
    path: '/api/v1/customer/profile',
    headers: {
      cookie: `${ACCESS_COOKIE_NAME}=access; ${CSRF_COOKIE_NAME}=csrf-cookie`,
      origin: 'http://localhost:5173',
    },
  });
  const { response, state } = mockResponse();
  let nextCalled = false;
  securityHeadersMiddleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 403);
  assert.equal(state.body.error.code, 'CSRF_VALIDATION_FAILED');
});

test('bearer/native unsafe requests are not subject to browser CSRF', () => {
  const req = mockRequest({
    method: 'POST',
    path: '/api/v1/rider/location',
    headers: {
      authorization: 'Bearer native-token',
      'X-Auth-Transport': 'bearer',
    },
  });
  const { response, state } = mockResponse();
  let nextCalled = false;
  securityHeadersMiddleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(state.statusCode, 200);
  assert.equal(nextCalled, true);
});

test('dispatch refuses missing pickup coordinates instead of falling back to Nairobi', async () => {
  const service = new DispatchService();
  await assert.rejects(
    () => service.findAndRankCandidates({}, 2000),
    (error: any) => error?.code === 'DISPATCH_PICKUP_LOCATION_REQUIRED',
  );
});
