// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { DesktopLeaseGuard, verifyDesktopLease, type DesktopLease } from './offline-lease';

const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = 1800000000000;
const scope = { foydalanuvchiId: 2, kompaniyaId: 3, deviceId: 'synthetic-device' };
const payload: DesktopLease = { format: 'smeta-desktop-lease/1', foydalanuvchi_id: 2, kompaniya_id: 3,
  device_id: scope.deviceId, obyekt_idlar: [4], permissions: ['smeta.read', 'f2.read', 'narx.read'],
  berildi: now - 1000, tugaydi: now + 10000, versiya: 1 };
let pair: CryptoKeyPair, publicKey: Uint8Array;
beforeAll(async () => {
  pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
  publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
});
async function signed(p: unknown = payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  return { alg: 'Ed25519', kid: 'test', payload: encode(bytes),
    imzo: encode(new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, bytes))) };
}
describe('signed offline lease boundary', () => {
  it('accepts only the installed key and expected actor/company/device', async () => {
    const lease = await verifyDesktopLease(await signed(), scope, publicKey, 'test', now);
    expect(lease.obyekt_idlar).toEqual([4]);
    expect(Object.isFrozen(lease.obyekt_idlar)).toBe(true);
  });
  it('rejects tampering before parsing permission claims', async () => {
    const lease = await signed();
    lease.payload = encode(new TextEncoder().encode(JSON.stringify({ ...payload, kompaniya_id: 9 })));
    await expect(verifyDesktopLease(lease, scope, publicKey, 'test', now)).rejects.toThrow('SIGNATURE');
  });
  it.each([
    { tugaydi: now }, { berildi: now + 300001 }, { tugaydi: now + 73 * 3600_000 },
    { kompaniya_id: 9 }, { foydalanuvchi_id: 9 }, { device_id: 'other-device' },
    { obyekt_idlar: [] }, { obyekt_idlar: [4, 4] }, { permissions: ['smeta.read'] },
  ])('rejects expired, overlong or foreign scope %j', async patch => {
    await expect(verifyDesktopLease(await signed({ ...payload, ...patch }), scope, publicKey, 'test', now)).rejects.toThrow();
  });
  it('rejects unknown signing key id and missing build key', async () => {
    await expect(verifyDesktopLease(await signed(), scope, publicKey, 'other', now)).rejects.toThrow();
    await expect(verifyDesktopLease(await signed(), scope, new Uint8Array(), 'test', now)).rejects.toThrow('CONFIG');
  });
  it('tolerates up to five minutes of issuer clock skew without extending expiry', async () => {
    const e = await signed({ ...payload, berildi: now + 300000, tugaydi: now + 600000 });
    const lease = await verifyDesktopLease(e, scope, publicKey, 'test', now);
    expect(lease.berildi).toBe(now + 300000);
    expect(new DesktopLeaseGuard(lease, now, () => now, () => 0).allow(4)).toBe(now);
    await expect(verifyDesktopLease(e, scope, publicKey, 'test', now + 600000)).rejects.toThrow();
  });
  it('blocks unlisted object and never resurrects a revoked lease', () => {
    const guard = new DesktopLeaseGuard(payload, now, () => now, () => 0);
    expect(guard.allow(4)).toBe(now);
    guard.revoke();
    expect(() => guard.allow(4)).toThrow('DENIED');
    expect(() => new DesktopLeaseGuard(payload, now, () => now, () => 0).allow(5)).toThrow('DENIED');
  });
  it('blocks clock rollback, including restored persisted high-water mark', () => {
    const guard = new DesktopLeaseGuard(payload, now + 1, () => now, () => 0);
    expect(() => guard.allow(4)).toThrow('DENIED');
  });
  it('expires by monotonic clock even when wall clock is frozen', () => {
    let mono = 0;
    const guard = new DesktopLeaseGuard(payload, now, () => now, () => mono);
    mono = 10001;
    expect(() => guard.allow(4)).toThrow('DENIED');
  });
});
