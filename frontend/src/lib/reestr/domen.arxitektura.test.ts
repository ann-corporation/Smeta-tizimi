import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  DOMENLAR, ISTISNO, OTORITET, OXSHASHLAR, PLATFORMA_SINKLAR, HISOB_YADRO_SQL, RUXSAT_MANBA_SQL, PREFIKS, egasi, type Domen,
} from './domen';
import { buzilishlarniTop, katalogOqi, migratsiyalarniOqi, asosFunksiyaNomi, type Buzilishlar } from './domen.sql-tahlil';
import meros from './domen-meros.json';

/**
 * ARXITEKTURA QO'RIQCHILARI (egasi 2026-11-12). Hujjat: docs/architecture/DOMEN_SHARTNOMALARI.md.
 * Sof fayl tahlili (DB kerak emas, ~1 s). Har yiqilish xabari agentga AYNAN nima qilishni aytadi.
 * Meros ro'yxati (domen-meros.json) - bugungi haqiqat; faqat YANGI buzilish yiqitadi.
 * Meros ro'yxatini KENGAYTIRISH mumkin emas (quyidagi CHEGARA oshmaydi) - kodni tuzating yoki egasidan qaror oling.
 */
const ILDIZ = join(process.cwd(), '..');
const katalog = katalogOqi(ILDIZ);
const mig = migratsiyalarniOqi(ILDIZ);
const b: Buzilishlar = buzilishlarniTop(
  ILDIZ,
  { egasi, sinklar: PLATFORMA_SINKLAR, hisobYadro: HISOB_YADRO_SQL, ruxsatManba: RUXSAT_MANBA_SQL },
  katalog,
);
const CHEGARA = { yozish: 99, pul: 49, rol: 2, idemsiz: 38 } as const;
const royxat = (a: string[]) => a.map((x) => '  - ' + x).join('\n');

describe('a) har jadval va funksiya aynan bitta domenga tegishli', () => {
  it('egasiz obyekt yo\'q', () => {
    expect(
      b.egasiz,
      'EGASIZ obyektlar topildi:\n' + royxat(b.egasiz) +
        '\n\nNima qilish kerak: frontend/src/lib/reestr/domen.ts -> PREFIKS ga yangi prefiks qo\'shing (nom domen prefiksi bilan boshlansa avtomatik tushadi) ' +
        'yoki ISTISNO ga {domen, izoh} bilan yozing. Obyekt qaysi domen faktini saqlasa - o\'sha domen. Aniq bo\'lmasa noaniq:true qo\'ying va PR da egasidan so\'rang.',
    ).toEqual([]);
  });

  it('prefiks ikki domenda takrorlanmaydi va hamma domen bo\'sh emas', () => {
    const korilgan = new Map<string, Domen>();
    const takror: string[] = [];
    for (const d of Object.keys(PREFIKS) as Domen[]) {
      for (const p of PREFIKS[d]) {
        const oldingi = korilgan.get(p);
        if (oldingi) takror.push(`${p}: ${oldingi} va ${d}`);
        korilgan.set(p, d);
      }
    }
    expect(takror, 'bitta prefiks ikki domenga yozilgan - aynan bitta egasi bo\'lishi shart').toEqual([]);
    for (const d of Object.keys(DOMENLAR) as Domen[]) expect(PREFIKS[d].length, d + ' domenida prefiks yo\'q').toBeGreaterThan(0);
  });

  it('ISTISNO da eskirgan (katalogda yo\'q) nom yo\'q', () => {
    const hammasi = new Set<string>([
      ...katalog.jadvallar, ...katalog.funksiyalar, ...mig.jadvallar.keys(), ...mig.funksiyalar.keys(),
    ]);
    const eski = Object.keys(ISTISNO).filter((n) => !hammasi.has(n) && !hammasi.has('_' + n) && !hammasi.has('trg_' + n));
    expect(eski, 'ISTISNO dagi nomlar katalogda ham, migratsiyada ham yo\'q - qatorni o\'chiring:\n' + royxat(eski)).toEqual([]);
  });

  it('har OTORITET funksiyasi mavjud va e\'lon qilingan domenga tegishli', () => {
    const fn = new Set<string>([...katalog.funksiyalar, ...mig.funksiyalar.keys(), ...katalog.jadvallar, ...mig.jadvallar.keys()]);
    const xato: string[] = [];
    for (const o of OTORITET) {
      if (!fn.has(o.funksiya)) xato.push(`${o.fakt}: ${o.funksiya} katalogda yo'q`);
      else if (egasi(o.funksiya)?.domen !== o.domen) xato.push(`${o.fakt}: ${o.funksiya} egasi ${egasi(o.funksiya)?.domen}, e'lon ${o.domen}`);
    }
    expect(xato, 'OTORITET reestri katalogga mos emas:\n' + royxat(xato)).toEqual([]);
  });
});

describe('b) domenlararo YOZISH (boshqa domen jadvaliga INSERT/UPDATE/DELETE)', () => {
  it('yangi buzilish yo\'q', () => {
    const ruxsat = new Set(Object.keys(meros.yozish));
    const yangi = b.yozish.filter((x) => !ruxsat.has(x));
    expect(
      yangi,
      'YANGI domenlararo yozish:\n' + royxat(yangi.map((x) => { const [f, t] = x.split('>'); return `${x}   (${egasi(asosFunksiyaNomi(f))?.domen} -> ${egasi(t)?.domen})`; })) +
        '\n\nNima qilish kerak: funksiya boshqa domenning jadvalini to\'g\'ridan-to\'g\'ri yozmasin - egasi domenning NOMLI funksiyasini chaqiring ' +
        '(masalan ijro smeta qatorini emas, smeta domenining RPC sini). Yozish zarur bo\'lsa - PR da sababni yozing va egasi tasdig\'idan keyin ' +
        'node frontend/scripts/domen-meros-yigish.mjs (hamda domen.ts -> YOZISH_SABAB ga sabab, test CHEGARA ni ko\'tarish). Audit/outbox/signal/command_log uchun PLATFORMA_SINKLAR dagi jadvallar ruxsat etilgan.',
    ).toEqual([]);
  });
  it('meros ro\'yxati o\'smaydi va har yozuvning sababi bor', () => {
    expect(Object.keys(meros.yozish).length).toBeLessThanOrEqual(CHEGARA.yozish);
    for (const [, v] of Object.entries(meros.yozish)) expect(String(v).length).toBeGreaterThan(5);
  });
});

describe('c) pul/QQS hisobi yadrodan tashqarida (SQL)', () => {
  it('yangi takroriy kalkulyator yo\'q', () => {
    const ruxsat = new Set(Object.keys(meros.pul));
    const yangi = b.pul.filter((x) => !ruxsat.has(x));
    expect(
      yangi,
      'YANGI pul/QQS hisobi (1.12, *0.12, round(pul,2)) yadrodan tashqarida:\n' + royxat(yangi) +
        '\n\nNima qilish kerak: summa/QQS/ustama arifmetikasini yozmang - _t2_summa_paket_v1 / _t2_summa_agg_v1 / _t2_kaskad_yakun_v1 (SQL) yoki lib/hisob-yadro (frontend) natijasini o\'qing. ' +
        'Narx QQS siz saqlanadi; QQS bilan summa faqat yadrodan. Haqiqiy yadro funksiyasi bo\'lsa - domen.ts -> HISOB_YADRO_SQL (egasi tasdig\'i bilan).',
    ).toEqual([]);
    expect(Object.keys(meros.pul).length).toBeLessThanOrEqual(CHEGARA.pul);
  });
});

describe('d) ikkinchi ruxsat manbasi', () => {
  it('qattiq "when rol then array[...]" ro\'yxati o\'smaydi', () => {
    const ruxsat = new Set(Object.keys(meros.rol));
    const yangi = b.rol.filter((x) => !ruxsat.has(x));
    expect(
      yangi,
      'YANGI qattiq yozilgan rol -> capability ro\'yxati:\n' + royxat(yangi) +
        '\n\nNima qilish kerak: rol imkoniyatlari FAQAT t2_role_permissions_v2 da. Yangi capability uchun u funksiyani kengaytiring va rolga bog\'lang; ' +
        'RPC ichida t2_require_permission_v2 / t2_permission_allowed_v2 ni chaqiring - o\'z ro\'yxatingizni yozmang.',
    ).toEqual([]);
    expect(Object.keys(meros.rol).length).toBeLessThanOrEqual(CHEGARA.rol);
  });
});

describe('e) shlyuz yozish amallari: capability + idempotentlik', () => {
  it('har amalda capability bor', () => {
    expect(
      b.capsiz,
      'sb-yoz.ts AMALLAR da bor, lekin write-command-policy.ts da capability yo\'q:\n' + royxat(b.capsiz) +
        '\n\nNima qilish kerak: WRITE_COMMAND_POLICY ga amal: \'<capability>\' qo\'shing (fail-closed). Yangi capability kerak bo\'lsa - avval permission-policy.ts va t2_role_permissions_v2.',
    ).toEqual([]);
  });
  it('har amal RPC sida operation_id bor (yoki sababli ro\'yxatda)', () => {
    const ruxsat = new Set(Object.keys(meros.idemsiz));
    const yangi = b.idemsiz.filter((x) => !ruxsat.has(x));
    expect(
      yangi,
      'operation_id (idempotentlik kaliti) YO\'Q yangi yozish amallari:\n' + royxat(yangi) +
        '\n\nNima qilish kerak: RPC ga p_operation_id uuid parametri va t2_*_command_log da takrorni tekshirishni qo\'shing (qayta yuborish ikki marta yozmasin). ' +
        'Tabiiy kalit/CAS (kutilgan_versiya) bilan idempotent bo\'lsa - domen-meros.json -> idemsiz ga "sabab" bilan yozing va CHEGARA ni PR da asoslang.',
    ).toEqual([]);
    expect(Object.keys(meros.idemsiz).length).toBeLessThanOrEqual(CHEGARA.idemsiz);
  });
});

describe('f) o\'xshash mexanizmlar (ogohlantirish, qattiq xato emas)', () => {
  it('OXSHASHLAR dagi jadvallar katalogda bor va kanonik ro\'yxatda', () => {
    const jadval = new Set<string>([...katalog.jadvallar, ...mig.jadvallar.keys()]);
    const xato: string[] = [];
    for (const o of OXSHASHLAR) {
      for (const n of o.nomlar) if (!jadval.has(n)) xato.push(`${o.tushuncha}: ${n} katalogda yo'q`);
      if (!o.nomlar.includes(o.kanonik)) xato.push(`${o.tushuncha}: kanonik ${o.kanonik} nomlar ichida emas`);
      if (!o.tavsiya.trim()) xato.push(`${o.tushuncha}: tavsiya yo'q`);
    }
    expect(xato, 'OXSHASHLAR reestri eskirgan:\n' + royxat(xato)).toEqual([]);
  });

  it('yangi o\'xshash jadval kandidatlari (faqat ogohlantirish)', () => {
    const KALIT = ['baho', 'reyting', 'hodisa', 'tolov', 'dalil', 'mashina', 'haydovchi', 'xodim', 'kadr', 'narx_manba', 'akt', 'jurnal', 'taklif'];
    const bor = new Set(OXSHASHLAR.flatMap((o) => o.nomlar));
    const topilma: string[] = [];
    const jadvallar = [...new Set([...katalog.jadvallar, ...mig.jadvallar.keys()])].filter((n) => !/_(royxat|reestr|bak|backup)|_bak_|^v_/.test(n));
    for (const k of KALIT) {
      const mos = jadvallar.filter((n) => (' ' + n.replace(/^t2_/, '').split('_').join(' ') + ' ').includes(' ' + k.split('_').join(' ') + ' '));
      const domenlar = new Set(mos.map((n) => egasi(n)?.domen));
      const yangi = mos.filter((n) => !bor.has(n));
      if (domenlar.size >= 2 && yangi.length) topilma.push(`${k}: ${yangi.join(', ')}`);
    }
    if (topilma.length) console.warn('[domen] OXSHASHLAR da yo\'q, lekin bir necha domenda uchraydigan jadvallar:\n' + royxat(topilma));
    expect(Array.isArray(topilma)).toBe(true);
  });
});
