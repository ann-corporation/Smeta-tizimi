// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { signDesktopLease, type DesktopLeasePayload } from '../../functions/_shared/desktop-lease';
import { base64url } from '../../functions/_shared/desktop-device';
import { verifyDesktopLease } from './offline-lease';

describe('server issuer to installed client contract', () => {
  it('verifies actual server PKCS8 signature using only the installed raw public key', async () => {
    const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
    const now = Date.now();
    const p: DesktopLeasePayload = { format: 'smeta-desktop-lease/1', foydalanuvchi_id: 2, kompaniya_id: 3,
      device_id: '00000000-0000-4000-8000-000000000001', obyekt_idlar: [4],
      permissions: ['company.read', 'smeta.read', 'f2.read', 'narx.read'], berildi: now, tugaydi: now + 3600_000, versiya: 1 };
    const envelope = await signDesktopLease(p, {
      DESKTOP_LEASE_SK: base64url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey))),
      DESKTOP_LEASE_KID: 'test-ephemeral',
    });
    const pk = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
    const scope = { foydalanuvchiId: 2, kompaniyaId: 3, deviceId: p.device_id };
    expect((await verifyDesktopLease(envelope, scope, pk, 'test-ephemeral', now)).obyekt_idlar).toEqual([4]);
    await expect(verifyDesktopLease(envelope, { ...scope, kompaniyaId: 9 }, pk, 'test-ephemeral', now)).rejects.toThrow();
    await expect(verifyDesktopLease(envelope, scope, pk, 'test-ephemeral', p.tugaydi)).rejects.toThrow();
  });
  it('does not issue a development lease without server signing configuration', async () => {
    await expect(signDesktopLease({} as DesktopLeasePayload, {})).rejects.toThrow('CONFIG');
  });
});
