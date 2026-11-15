/**
 * /api/qulf amallari (PIN, passkey, qurilma kaliti, siyosat, tasdiq berish). Saqlash `QulfStore` orqali (Supabase: qulf-store.ts; testda xotira).
 * PIN va xesh javobga/logga HECH QACHON chiqmaydi. Hujjat: docs/architecture/QULF_VA_TASDIQ_V1.md
 */
import { base64url, unbase64url } from './desktop-device';
import {
  chaqiriqTekshir, chaqiriqYarat, ecImzoTekshir, ecSpkiImport, kredensialIdDan, pinHolat, pinKalitBoshqa, pinUzunlikOl, BLOK_XATO, pinTekshir, pinXesh, PIN_RE, qabulUsullar, qurilmaXabar,
  rejimYaroqli, sha256, tasdiqTekshir, tasdiqYarat, yangiKirishmi, zaifPin, CHAQIRIQ_MS, type ChaqiriqMaqsad, type QulfQator, type Rejim, type Talab, type TasdiqYuk,
} from './qulf';
import { kirishTekshir, regTekshir } from './qulf-webauthn';

export type KalitQator = {
  id: number; foydalanuvchi_id: number; tur: 'webauthn' | 'android'; kredensial_id: string; ochiq_kalit: string; alg: number; hisob: number;
  transports: string[]; qurilma_nomi: string | null; yaratildi: string; oxirgi_ishlatildi: string | null;
};
export interface QulfStore {
  holat(uid: number): Promise<QulfQator | null>;
  pinYoz(uid: number, hash: string): Promise<void>;
  pinOchir(uid: number): Promise<void>;
  vaqtYoz(uid: number, daq: number): Promise<void>;
  urinish(uid: number, ok: boolean): Promise<{ code?: string }>;
  chaqiriqIshlat(jti: string, uid: number, tugaydi: Date): Promise<boolean>;
  kalitlar(uid: number): Promise<KalitQator[]>;
  kalitQosh(uid: number, k: Omit<KalitQator, 'id' | 'foydalanuvchi_id' | 'yaratildi' | 'oxirgi_ishlatildi'>): Promise<void>;
  kalitHisob(id: number, hisob: number): Promise<void>;
  kalitOchir(uid: number, id: number): Promise<boolean>;
  siyosatOl(kompaniyaId: number): Promise<Rejim | null>;
  siyosatYoz(kompaniyaId: number, rejim: Rejim, yangilagan: number): Promise<void>;
  talab(uid: number, kompaniyaId: number | null): Promise<Talab>;
}

export type Kontekst = {
  store: QulfStore; uid: number; jti: string; iat: number; kanal: 'web' | 'mobil'; kalit: string; hozir: number;
  rpId: string; origins: string[]; tasdiq: string | null;
  /** siyosat o'zgartirish ruxsati (control.company.write yoki superadmin) -- endpoint vakolatdan hisoblaydi */
  siyosatRuxsat: (kompaniyaId: number) => boolean;
  /** foydalanuvchi a'zo kompaniyalar (siyosat ko'rsatish uchun) */
  kompaniyalar: number[];
};
export type Javob = { status: number; body: Record<string, unknown>; tasdiq?: string };
const ok = (body: Record<string, unknown> = {}, extra: Partial<Javob> = {}): Javob => ({ status: 200, body: { ok: true, ...body }, ...extra });
const xato = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): Javob => ({ status, body: { ok: false, code, error, ...extra } });
const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
const sessJ = (k: Kontekst) => k.kanal === 'mobil' ? 'm' : k.jti;
const bosh = (kalitlar: KalitQator[]) => kalitlar.map(x => ({ id: x.id, tur: x.tur, nom: x.qurilma_nomi, yaratildi: x.yaratildi, oxirgi: x.oxirgi_ishlatildi }));
const BLOKLANGAN = 'PIN ko\'p marta xato kiritildi. Birozdan keyin urinib ko\'ring.';

async function tasdiqBer(k: Kontekst, m: TasdiqYuk['m']): Promise<Javob> {
  const t = await tasdiqYarat({ u: k.uid, j: sessJ(k), m }, k.kalit, k.hozir);
  return ok({ tasdiq_token: t, muddat_soniya: 300, usul: m }, { tasdiq: t });
}
async function joriyTasdiq(k: Kontekst): Promise<TasdiqYuk | null> {
  return tasdiqTekshir(k.tasdiq, k.kalit, { u: k.uid, j: sessJ(k) }, k.hozir);
}
/** Himoyalangan sozlama amallari: foydalanuvchida PIN yoki kalit bor bo'lsa -- yangi tasdiq shart. */
async function sozlamaTalabi(k: Kontekst): Promise<Javob | null> {
  const [q, kl] = await Promise.all([k.store.holat(k.uid), k.store.kalitlar(k.uid)]);
  if (!q?.pin_hash && kl.length === 0) return null;
  if (await joriyTasdiq(k)) return null;
  return xato(403, 'STEP_UP_KERAK', 'Avval PIN yoki biometrik bilan tasdiqlang.', { usullar: kl.length ? ['pin', 'passkey', 'qurilma'] : ['pin'] });
}

/** PIN tekshirish (urinish hisobi bilan). Qaytadi: null = to'g'ri, Javob = rad. */
async function pinSinov(k: Kontekst, pin: unknown): Promise<Javob | null> {
  const q = await k.store.holat(k.uid);
  const h = pinHolat(q, k.iat, k.hozir);
  if (!h.ok) return h.code === 'PIN_YOQ' ? xato(409, 'PIN_YOQ', 'PIN o\'rnatilmagan.')
    : h.code === 'QAYTA_KIRISH_KERAK' ? xato(423, 'QAYTA_KIRISH_KERAK', 'Xavfsizlik uchun tizimga qayta kiring.')
    : xato(429, 'BLOKLANGAN', BLOKLANGAN, { qolgan_soniya: h.qolgan_soniya });
  /* PIN boshqa server kaliti (preview/production SESSIYA_KALIT farqi yoki almashtirilgan kalit) bilan yozilgan: hech qachon mos kelmaydi -- urinish SANALMAYDI, foydalanuvchi qulflanib qolmaydi. */
  if (await pinKalitBoshqa(q!.pin_hash, k.kalit)) return xato(409, 'PIN_KALIT_BOSHQA', 'PIN boshqa muhitda o\'rnatilgan. Qayta kirib, yangi PIN o\'rnating.');
  const togri = typeof pin === 'string' && await pinTekshir(pin, k.uid, k.kalit, q!.pin_hash);
  const r = await k.store.urinish(k.uid, togri);
  if (togri) return null;
  if (r.code === 'QAYTA_KIRISH_KERAK') return xato(423, 'QAYTA_KIRISH_KERAK', 'Xavfsizlik uchun tizimga qayta kiring.');
  if (r.code === 'BLOKLANGAN') return xato(429, 'BLOKLANGAN', BLOKLANGAN, { qolgan_soniya: 900 });
  return xato(401, 'PIN_NOTOGRI', 'PIN noto\'g\'ri.');
}

export async function qulfAmal(k: Kontekst, amal: string, b: Record<string, unknown>): Promise<Javob> {
  switch (amal) {
    case 'holat': {
      const [q, kl, talab] = await Promise.all([k.store.holat(k.uid), k.store.kalitlar(k.uid), k.store.talab(k.uid, null)]);
      const h = pinHolat(q, k.iat, k.hozir);
      return ok({
        pin_bor: !!q?.pin_hash, pin_uzunlik: pinUzunlikOl(q?.pin_hash), qolgan_urinish: Math.max(0, BLOK_XATO - (q?.xato_soni ?? 0)), pin_kalit_boshqa: await pinKalitBoshqa(q?.pin_hash, k.kalit), bosh_vaqt_daq: q?.bosh_vaqt_daq ?? 10, kalitlar: bosh(kl), rejim: talab.rejim, talab: talab.talab,
        usullar: qabulUsullar(talab.rejim, talab),
        pin_holat: h.ok ? 'ok' : h.code, qolgan_soniya: !h.ok && h.code === 'BLOKLANGAN' ? h.qolgan_soniya : 0,
        tasdiq_bor: !!(await joriyTasdiq(k)),
      });
    }
    case 'vaqt_saqla': {
      const d = Number(b.daq);
      if (!Number.isInteger(d) || d < 1 || d > 60) return xato(400, 'VAQT_NOTOGRI', 'Vaqt 1 dan 60 daqiqagacha bo\'lishi kerak.');
      await k.store.vaqtYoz(k.uid, d);
      return ok({ bosh_vaqt_daq: d });
    }
    case 'pin_saqla': {
      const yangi = typeof b.yangi === 'string' ? b.yangi : '';
      if (!PIN_RE.test(yangi)) return xato(400, 'PIN_FORMAT', 'PIN 4-6 raqamdan iborat bo\'lishi kerak.');
      if (zaifPin(yangi)) return xato(400, 'PIN_ZAIF', 'PIN juda oson (0000, 1234 kabi). Boshqasini tanlang.');
      const q = await k.store.holat(k.uid);
      if (q?.pin_hash) {
        const boshqaKalit = await pinKalitBoshqa(q.pin_hash, k.kalit); // eski PIN tekshirib bo'lmaydi -- faqat yangi to'liq kirish yo'li
        if (!boshqaKalit && b.eski !== undefined && b.eski !== null && b.eski !== '') { const r = await pinSinov(k, b.eski); if (r) return r; }
        else {
          /* Eski PIN esdan chiqqan: faqat yangi to'liq kirishdan keyin (sessiya 10 daqiqadan eski emas) va u 10-xato blokidan KEYIN chiqarilgan. */
          const qk = q.qayta_kirish_vaqti ? Date.parse(q.qayta_kirish_vaqti) : 0;
          if (!yangiKirishmi(k.iat, k.hozir) || (qk && k.iat <= qk)) return xato(403, 'ESKI_PIN_KERAK', 'Eski PIN kerak (yoki qayta kirib, 10 daqiqa ichida almashtiring).');
        }
      } else {
        const talab = await sozlamaTalabi(k); if (talab) return talab; // PIN yo'q, lekin biometrik kalit bor
      }
      await k.store.pinYoz(k.uid, await pinXesh(yangi, k.uid, k.kalit));
      return ok({ pin_bor: true });
    }
    case 'pin_ochir': {
      const r = await pinSinov(k, b.pin); if (r) return r;
      await k.store.pinOchir(k.uid);
      return ok({ pin_bor: false });
    }
    case 'pin_tekshir': {
      const r = await pinSinov(k, b.pin); if (r) return r;
      return tasdiqBer(k, 'pin');
    }
    case 'kalit_ochir': {
      const t = await sozlamaTalabi(k); if (t) return t;
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0) return xato(400, 'ID_NOTOGRI', 'Qurilma noto\'g\'ri.');
      return (await k.store.kalitOchir(k.uid, id)) ? ok() : xato(404, 'TOPILMADI', 'Qurilma topilmadi.');
    }
    case 'siyosat_ol': {
      const kid = Number(b.kompaniya_id);
      if (!Number.isSafeInteger(kid) || kid <= 0 || !k.kompaniyalar.includes(kid)) return xato(403, 'RUXSAT_YOQ', 'Bu kompaniya uchun ruxsat yo\'q.');
      return ok({ rejim: (await k.store.siyosatOl(kid)) ?? 'pin' });
    }
    case 'siyosat_saqla': {
      const kid = Number(b.kompaniya_id);
      if (!Number.isSafeInteger(kid) || kid <= 0 || !rejimYaroqli(b.rejim)) return xato(400, 'SIYOSAT_NOTOGRI', 'Siyosat noto\'g\'ri.');
      if (!k.siyosatRuxsat(kid)) return xato(403, 'RUXSAT_YOQ', 'Siyosatni faqat kompaniya rahbari o\'zgartiradi.');
      const t = await sozlamaTalabi(k); if (t) return t;
      await k.store.siyosatYoz(kid, b.rejim, k.uid);
      return ok({ rejim: b.rejim });
    }

    // ---- WebAuthn (passkey): Windows Hello / Touch ID / Face ID / Android biometrik (brauzer) ----
    case 'webauthn_reg_boshla': {
      const t = await sozlamaTalabi(k); if (t) return t;
      const kl = (await k.store.kalitlar(k.uid)).filter(x => x.tur === 'webauthn');
      const c = await chaqiriqYarat(k.uid, 'reg', k.kalit, k.hozir);
      return ok({
        chaqiriq: c.token,
        options: {
          challenge: c.n, rp: { id: k.rpId, name: 'QURAI' }, timeout: CHAQIRIQ_MS, attestation: 'none',
          user: { id: base64url(await sha256(`qulf-user|${k.uid}`)), name: `u${k.uid}`, displayName: 'QURAI' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
          excludeCredentials: kl.map(x => ({ type: 'public-key', id: x.kredensial_id, transports: x.transports })),
        },
      });
    }
    case 'webauthn_reg_tugat': {
      const cq = await chaqiriqTekshir(b.chaqiriq, k.kalit, k.uid, 'reg', k.hozir);
      if (!cq) return xato(400, 'CHAQIRIQ_YAROQSIZ', 'So\'rov muddati o\'tgan. Qaytadan urinib ko\'ring.');
      if (!(await k.store.chaqiriqIshlat(cq.j, k.uid, new Date(cq.e)))) return xato(409, 'CHAQIRIQ_ISHLATILGAN', 'So\'rov allaqachon ishlatilgan.');
      const t = await sozlamaTalabi(k); if (t) return t;
      const cd = str(b.clientDataJSON, 4096), ao = str(b.attestationObject, 16384);
      if (!cd || !ao) return xato(400, 'MAYDON', 'Ma\'lumot to\'liq emas.');
      const r = await regTekshir({ clientDataJSON: cd, attestationObject: ao }, { challenge: cq.n, origins: k.origins, rpId: k.rpId });
      if (!r.ok) return xato(400, 'WEBAUTHN_' + r.code, 'Biometrik ro\'yxatdan o\'tmadi.');
      if ((await k.store.kalitlar(k.uid)).some(x => x.kredensial_id === r.kredensial_id)) return xato(409, 'KALIT_BOR', 'Bu qurilma allaqachon qo\'shilgan.');
      const tr = Array.isArray(b.transports) ? b.transports.filter((x): x is string => typeof x === 'string' && /^[a-z-]{2,20}$/.test(x)).slice(0, 6) : [];
      await k.store.kalitQosh(k.uid, { tur: 'webauthn', kredensial_id: r.kredensial_id, ochiq_kalit: r.ochiq_kalit, alg: r.alg, hisob: r.hisob, transports: tr, qurilma_nomi: str(b.nom, 80) });
      return ok();
    }
    case 'webauthn_kirish_boshla': {
      const kl = (await k.store.kalitlar(k.uid)).filter(x => x.tur === 'webauthn');
      if (!kl.length) return xato(409, 'KALIT_YOQ', 'Biometrik qurilma qo\'shilmagan.');
      const c = await chaqiriqYarat(k.uid, 'kirish', k.kalit, k.hozir);
      return ok({
        chaqiriq: c.token,
        options: { challenge: c.n, rpId: k.rpId, timeout: CHAQIRIQ_MS, userVerification: 'required',
          allowCredentials: kl.map(x => ({ type: 'public-key', id: x.kredensial_id, transports: x.transports })) },
      });
    }
    case 'webauthn_kirish_tugat': {
      const cq = await chaqiriqTekshir(b.chaqiriq, k.kalit, k.uid, 'kirish', k.hozir);
      if (!cq) return xato(400, 'CHAQIRIQ_YAROQSIZ', 'So\'rov muddati o\'tgan. Qaytadan urinib ko\'ring.');
      if (!(await k.store.chaqiriqIshlat(cq.j, k.uid, new Date(cq.e)))) return xato(409, 'CHAQIRIQ_ISHLATILGAN', 'So\'rov allaqachon ishlatilgan.');
      const id = str(b.id, 1400), cd = str(b.clientDataJSON, 4096), ad = str(b.authenticatorData, 4096), sg = str(b.signature, 2048);
      if (!id || !cd || !ad || !sg) return xato(400, 'MAYDON', 'Ma\'lumot to\'liq emas.');
      const kalit = (await k.store.kalitlar(k.uid)).find(x => x.tur === 'webauthn' && x.kredensial_id === id);
      if (!kalit) return xato(401, 'KALIT_YOQ', 'Qurilma topilmadi.');
      const r = await kirishTekshir({ clientDataJSON: cd, authenticatorData: ad, signature: sg }, kalit, { challenge: cq.n, origins: k.origins, rpId: k.rpId });
      if (!r.ok) return xato(401, 'WEBAUTHN_' + r.code, 'Biometrik tasdiq o\'tmadi.');
      await k.store.kalitHisob(kalit.id, r.hisob);
      return tasdiqBer(k, 'passkey');
    }

    // ---- Android qurilma kaliti (Keystore, ES256, setUserAuthenticationRequired): passkey'ga o'xshash protokol ----
    case 'qurilma_reg_boshla': {
      const t = await sozlamaTalabi(k); if (t) return t;
      const c = await chaqiriqYarat(k.uid, 'qreg', k.kalit, k.hozir);
      return ok({ chaqiriq: c.token, challenge: c.n });
    }
    case 'qurilma_reg_tugat': {
      const cq = await chaqiriqTekshir(b.chaqiriq, k.kalit, k.uid, 'qreg', k.hozir);
      if (!cq) return xato(400, 'CHAQIRIQ_YAROQSIZ', 'So\'rov muddati o\'tgan. Qaytadan urinib ko\'ring.');
      if (!(await k.store.chaqiriqIshlat(cq.j, k.uid, new Date(cq.e)))) return xato(409, 'CHAQIRIQ_ISHLATILGAN', 'So\'rov allaqachon ishlatilgan.');
      const t = await sozlamaTalabi(k); if (t) return t;
      const pk = str(b.ochiq_kalit, 400), im = str(b.imzo, 200);
      if (!pk || !im) return xato(400, 'MAYDON', 'Ma\'lumot to\'liq emas.');
      let spki: Uint8Array, der: Uint8Array;
      try { spki = unbase64url(pk); der = unbase64url(im); } catch { return xato(400, 'MAYDON', 'Ma\'lumot noto\'g\'ri.'); }
      const key = await ecSpkiImport(spki);
      if (!key) return xato(400, 'KALIT_NOTOGRI', 'Kalit formati noto\'g\'ri.');
      const kid = await kredensialIdDan(spki);
      if (!(await ecImzoTekshir(key, qurilmaXabar('reg', cq.n, kid), der))) return xato(401, 'IMZO', 'Kalitga egalik isbotlanmadi.');
      if ((await k.store.kalitlar(k.uid)).some(x => x.kredensial_id === kid)) return xato(409, 'KALIT_BOR', 'Bu qurilma allaqachon qo\'shilgan.');
      await k.store.kalitQosh(k.uid, { tur: 'android', kredensial_id: kid, ochiq_kalit: base64url(spki), alg: -7, hisob: 0, transports: [], qurilma_nomi: str(b.nom, 80) });
      return ok({ kredensial_id: kid });
    }
    case 'qurilma_kirish_boshla': {
      const kl = (await k.store.kalitlar(k.uid)).filter(x => x.tur === 'android');
      if (!kl.length) return xato(409, 'KALIT_YOQ', 'Qurilma kaliti qo\'shilmagan.');
      const c = await chaqiriqYarat(k.uid, 'qkirish', k.kalit, k.hozir);
      return ok({ chaqiriq: c.token, challenge: c.n, kredensiallar: kl.map(x => x.kredensial_id) });
    }
    case 'qurilma_kirish_tugat': {
      const cq = await chaqiriqTekshir(b.chaqiriq, k.kalit, k.uid, 'qkirish', k.hozir);
      if (!cq) return xato(400, 'CHAQIRIQ_YAROQSIZ', 'So\'rov muddati o\'tgan. Qaytadan urinib ko\'ring.');
      if (!(await k.store.chaqiriqIshlat(cq.j, k.uid, new Date(cq.e)))) return xato(409, 'CHAQIRIQ_ISHLATILGAN', 'So\'rov allaqachon ishlatilgan.');
      const kid = str(b.kredensial_id, 100), im = str(b.imzo, 200);
      if (!kid || !im) return xato(400, 'MAYDON', 'Ma\'lumot to\'liq emas.');
      const kalit = (await k.store.kalitlar(k.uid)).find(x => x.tur === 'android' && x.kredensial_id === kid);
      if (!kalit) return xato(401, 'KALIT_YOQ', 'Qurilma topilmadi.');
      let der: Uint8Array; try { der = unbase64url(im); } catch { return xato(400, 'MAYDON', 'Ma\'lumot noto\'g\'ri.'); }
      const key = await ecSpkiImport(unbase64url(kalit.ochiq_kalit));
      if (!key || !(await ecImzoTekshir(key, qurilmaXabar('kirish', cq.n, kid), der))) return xato(401, 'IMZO', 'Biometrik tasdiq o\'tmadi.');
      await k.store.kalitHisob(kalit.id, kalit.hisob + 1);
      return tasdiqBer(k, 'qurilma');
    }
    default:
      return xato(400, 'AMAL_YOQ', 'Amal ochiq emas.');
  }
}

export type { ChaqiriqMaqsad };
