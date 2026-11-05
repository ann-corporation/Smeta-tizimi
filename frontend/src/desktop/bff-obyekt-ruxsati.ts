import { vaqtliOqish } from '../api/vaqtli-fetch';
import { PAKET_FORMAT } from '../ombor/paket';
import type { OmborDoira } from '../ombor/saqlash';

type ObyektDoira = OmborDoira & { obyektId: number };
type Ruxsat = { ok: true; doira: ObyektDoira } | { ok: false; status: number };

const rad = (status: number): Ruxsat => ({ ok: false, status });
const id = (value: number) => Number.isSafeInteger(value) && value > 0;
const options = { credentials: 'same-origin', cache: 'no-store', redirect: 'error' } as const;

/** PR237 ObyektRuxsatPort. The caller binds joriy to one auth generation. */
export function bffObyektRuxsati(joriy: () => boolean) {
  return async (expected: Readonly<ObyektDoira>): Promise<Ruxsat> => {
    const { obyektId, kompaniyaId, foydalanuvchiId } = expected;
    if (![obyektId, kompaniyaId, foydalanuvchiId].every(id)) return rad(0);

    async function sessiya(): Promise<{ status: number } | { expires: number }> {
      const response = await vaqtliOqish('/api/sessiya', options);
      if (response.status !== 200) return { status: response.ok || response.status === 403 ? 0 : response.status } as const;
      const body = await response.json();
      if (body?.ok !== true || body.zaxira_kalit !== false ||
        body.foydalanuvchi_id !== foydalanuvchiId ||
        !Number.isSafeInteger(body.tugaydi) || body.tugaydi <= Date.now()) return { status: 401 } as const;
      return { expires: body.tugaydi as number } as const;
    }

    try {
      if (!joriy()) return rad(0);
      const before = await sessiya();
      if (!joriy()) return rad(0);
      if ('status' in before) return rad(before.status);

      const response = await vaqtliOqish('/api/obyekt-paket?obyekt_id=' + obyektId, options);
      if (!joriy()) return rad(0);
      if (response.status !== 200) return rad(response.ok ? 0 : response.status);
      const packageScope = await response.json();
      if (packageScope?.format !== PAKET_FORMAT || packageScope.obyekt_id !== obyektId ||
        packageScope.kompaniya_id !== kompaniyaId || !joriy()) return rad(0);

      const after = await sessiya();
      if (!joriy()) return rad(0);
      if ('status' in after) return rad(after.status);
      if (after.expires !== before.expires) return rad(401);
      return { ok: true, doira: { obyektId, kompaniyaId, foydalanuvchiId } };
    } catch {
      return rad(0);
    }
  };
}
