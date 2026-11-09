import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { EmailOtpRequestSchema, EmailOtpConfirmSchema, ResetPasswordSchema } from '@deetoo/validation';
import { authRepository } from '../../apps/api/src/modules/auth/auth.repository';
import { authRouter } from '../../apps/api/src/modules/auth/auth.router';
import { hashToken } from '../../packages/auth/src/crypto';

test('email verification requires a valid email and exactly six digits', () => {
  assert.equal(EmailOtpRequestSchema.safeParse({email: 'person@example.com'}).success, true);
  assert.equal(EmailOtpRequestSchema.safeParse({email: 'not-an-email'}).success, false);
  assert.equal(EmailOtpConfirmSchema.safeParse({email: 'person@example.com',code: '839124'}).success, true);
  for (const code of ['1234','1234567','12AB56']) {
    assert.equal(EmailOtpConfirmSchema.safeParse({email: 'person@example.com',code}).success, false);
  }
});

test('password reset rejects weak or excessive passwords', () => {
  const token = randomUUID();
  assert.equal(ResetPasswordSchema.safeParse({token,new_password:'a'.repeat(8)}).success, true);
  assert.equal(ResetPasswordSchema.safeParse({token,new_password:'short'}).success, false);
  assert.equal(ResetPasswordSchema.safeParse({token,new_password:'a'.repeat(129)}).success, false);
});

test('authentication router exposes email OTP and both password recovery routes', () => {
  const routes = authRouter.stack.flatMap((layer: any) =>
    layer.route ? Object.keys(layer.route.methods).map(method => method.toUpperCase() + ' ' + layer.route.path) : []);
  for (const route of [
    'POST /password/forgot','POST /password/reset',
    'POST /verify/otp-request','POST /verify/otp-confirm',
    'POST /verify/email-otp-request','POST /verify/email-otp-confirm',
    'POST /mfa/enroll','POST /mfa/verify',
  ]) assert.ok(routes.includes(route), route);
});

test('using one reset token invalidates other outstanding tokens for same account', async () => {
  const userId = randomUUID();
  const one = {id:randomUUID(),user_id:userId,token_hash:hashToken(randomUUID()),expires_at:new Date(Date.now()+3600000)};
  const two = {...one,id:randomUUID(),token_hash:hashToken(randomUUID())};
  await authRepository.createPasswordResetToken(one);
  await authRepository.createPasswordResetToken(two);
  await authRepository.markPasswordResetTokenUsed(one.id);
  assert.ok((await authRepository.findPasswordResetToken(one.token_hash))?.used_at);
  assert.ok((await authRepository.findPasswordResetToken(two.token_hash))?.used_at);
});
