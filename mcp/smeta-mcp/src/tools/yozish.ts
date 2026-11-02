/**
 * Yozish toollari — cheklovsiz (egasi talabi). Himoya: avtomatik snapshot (mavjud bo'lsa), bazadagi audit, dry_run (ROLLBACK).
 * Asl smeta const qoidasini buzadigan tahrir rad etilmaydi — natijada ogohlantirish qaytadi.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bittaSorov, type Mijoz } from '../db';
import { qatorTozala } from '../format';
import { FUNKSIYA_TAVSIF_SQL, funksiyaTavsifQatori, identifikator, overloadTanla, qoshishSorovi, rpcSorovi, tranzaksiyaBuyrugi, USTUN_TURLARI_SQL, yangilashSorovi, type FunksiyaTavsif } from '../sql';
import { dryRun, obyektIdS, tool } from '../tool';

/** RPC argumentlaridan obyektni aniqlash (snapshot uchun). */
export async function obyektniAniqla(m: Mijoz, args: Record<string, unknown>): Promise<number | null> {
  const n = (v: unknown) => { const x = Number(v); return Number.isSafeInteger(x) && x > 0 ? x : null; };
  const req = args.p_request && typeof args.p_request === 'object' ? args.p_request as Record<string, unknown> : null;
  const tog = n(args.p_obyekt_id) ?? n(req?.obyekt_id) ?? n(req?.p_obyekt_id);
  if (tog) return tog;
  const akt = n(args.p_akt_id);
  if (akt) { const r = await m.query<{ obyekt_id: number }>('select obyekt_id from public.t2_akt where id = $1', [akt]); if (r.rows[0]) return Number(r.rows[0].obyekt_id); }
  const q = n(args.p_qator_id) ?? n(args.p_id);
  if (q) { const r = await m.query<{ obyekt_id: number }>('select obyekt_id from public.t2_qator where id = $1', [q]); if (r.rows[0]) return Number(r.rows[0].obyekt_id); }
  return null;
}

/** Aktor/kim/operation_id avtomatik qo'shiladi (berilmagan bo'lsa va funksiyada shunday argument bo'lsa). */
export function argTayyorla(f: FunksiyaTavsif, args: Record<string, unknown>, aktorId: () => number): { args: Record<string, unknown>; qoshildi: string[] } {
  const out = { ...args };
  const qoshildi: string[] = [];
  const bor = (k: string) => f.argNomlar.includes(k) && !(k in out);
  if (bor('p_actor_id')) { out.p_actor_id = aktorId(); qoshildi.push('p_actor_id'); }
  if (bor('p_kim')) { out.p_kim = `mcp:actor:${aktorId()}`; qoshildi.push('p_kim'); }
  if (bor('p_actor_label')) { out.p_actor_label = `mcp:actor:${aktorId()}`; qoshildi.push('p_actor_label'); }
  if (bor('p_operation_id') && /uuid/i.test(f.argTurlar[f.argNomlar.indexOf('p_operation_id')])) { out.p_operation_id = randomUUID(); qoshildi.push('p_operation_id'); }
  return { args: out, qoshildi };
}

export async function funksiyaOl(m: Mijoz, toliqNom: string): Promise<{ sxema: string; variantlar: FunksiyaTavsif[] }> {
  const [sxema, nom] = toliqNom.includes('.') ? toliqNom.split('.', 2) : ['public', toliqNom];
  identifikator(`${sxema}.${nom}`);
  const r = await m.query(FUNKSIYA_TAVSIF_SQL, [sxema, nom]);
  if (!r.rows.length) throw new Error(`Funksiya topilmadi: ${sxema}.${nom} (sxema tooli bilan qidiring).`);
  return { sxema, variantlar: r.rows.map((x) => funksiyaTavsifQatori(x as never)) };
}

/** RPC'ni joriy tranzaksiyada chaqiradi (boshqa toollar ham ishlatadi). */
export async function rpcChaqir(m: Mijoz, nom: string, args: Record<string, unknown>, aktorId: () => number): Promise<{ natija: unknown; qoshildi: string[]; overload: string }> {
  const { sxema, variantlar } = await funksiyaOl(m, nom);
  const dastlab = overloadTanla(variantlar, Object.keys(args)) ?? variantlar.find((v) => v.argNomlar.length >= Object.keys(args).length) ?? variantlar[0];
  const t = argTayyorla(dastlab, args, aktorId);
  const f = overloadTanla(variantlar, Object.keys(t.args));
  if (!f) {
    throw new Error(`${nom}: argumentlar hech bir overloadga mos emas. Variantlar: ${variantlar.map((v) => `(${v.argNomlar.map((n, i) => `${n} ${v.argTurlar[i]}`).join(', ')}; default ${v.defaultSoni})`).join(' | ')}`);
  }
  const q = rpcSorovi(f, t.args, sxema);
  const r = await m.query(q.sql, q.params);
  const rows = r.rows.map(qatorTozala);
  const natija = !f.toplam && rows.length === 1 && Object.keys(rows[0]).length === 1 ? Object.values(rows[0])[0] : rows;
  return { natija, qoshildi: t.qoshildi, overload: `${f.nom}(${f.argNomlar.join(', ')})` };
}

export const rpc = tool({
  nom: 'rpc',
  tavsif: 'Istalgan mavjud RPC (public yoki `sxema.nom`) ni chaqirish — named argumentlar (`{"p_obyekt_id":153,…}`), turlar katalogdan. '
    + 'p_actor_id / p_kim / p_actor_label / p_operation_id(uuid) berilmasa avtomatik (sessiya aktori; yangi UUID). Oldin obyekt snapshoti '
    + '(obyekt p_obyekt_id/p_akt_id/p_qator_id/p_request.obyekt_id dan yoki `obyekt_id` dan aniqlanadi). Masalan: t2_fakt_yoz_v2, t2_akt_yarat_v2, '
    + 't2_addrepl_execute_v1, t2_zamena_almashtirish_belgila_v1, t2_akt_bekor. Signaturani `sxema({funksiya})` bilan ko\'ring.',
  kirish: { nom: z.string().min(1), args: z.record(z.any()).optional(), obyekt_id: obyektIdS.optional(), dry_run: dryRun },
  yozadi: true,
  bajar: async (a, mu) => {
    const args = a.args ?? {};
    return mu.yozish({ tool: 'rpc', args: a, dryRun: a.dry_run, obyektId: async (m) => a.obyekt_id ?? obyektniAniqla(m, args), izoh: a.nom }, async (m, ogoh) => {
      const r = await rpcChaqir(m, a.nom, args, () => mu.aktorKerak());
      if (r.qoshildi.length) ogoh.push(`avtomatik qo'shildi: ${r.qoshildi.join(', ')}`);
      const ok = r.natija && typeof r.natija === 'object' && !Array.isArray(r.natija) ? (r.natija as { ok?: unknown }).ok : undefined;
      if (ok === false) ogoh.push('RPC {ok:false} qaytardi — o\'zgarish bo\'lmagan bo\'lishi mumkin (natijani o\'qing).');
      return { overload: r.overload, javob: r.natija };
    });
  },
});

export const sqlYozish = tool({
  nom: 'sql_yozish',
  tavsif: 'Istalgan DML/DDL (INSERT/UPDATE/DELETE/CREATE/ALTER …). `obyekt_id` berilsa — avval snapshot. Natija: ta\'sirlangan qatorlar soni va RETURNING qatorlari (≤200). '
    + 'Parametrli so\'rov bitta statement bo\'lishi kerak; parametrsiz — bir nechta statement ham mumkin (dry_run\'da emas). '
    + 'dry_run — faqat BITTA buyruq, tranzaksiya buyrug\'i (COMMIT/BEGIN/ROLLBACK…) rad etiladi, oxirida ROLLBACK. '
    + 'Har holda so\'rov MCP tranzaksiyasi chegarasini buzsa — xato qaytadi.',
  kirish: { sql: z.string().min(1), params: z.array(z.any()).optional(), obyekt_id: obyektIdS.optional(), dry_run: dryRun },
  yozadi: true,
  bajar: async (a, mu) => mu.yozish({ tool: 'sql_yozish', args: a, dryRun: a.dry_run, obyektId: a.obyekt_id ?? null }, async (m) => {
    // dry_run: «bazaga yozilmadi» va'dasi qat'iy bo'lishi uchun bitta buyruq (MCP-QA-01).
    const r = a.dry_run ? await bittaSorov(m, a.sql, a.params, tranzaksiyaBuyrugi) : await m.query(a.sql, a.params ?? []);
    const natijalar = (Array.isArray(r) ? r : [r]) as Array<{ command?: string; rowCount: number | null; rows: Record<string, unknown>[] }>;
    return natijalar.map((x) => ({ buyruq: x.command ?? null, tasirlangan: x.rowCount, qatorlar: x.rows.slice(0, 200).map(qatorTozala), ...(x.rows.length > 200 ? { qolgan: x.rows.length - 200 } : {}) }));
  }),
});

const ASL_MAYDONLAR = new Set(['hajm', 'narx', 'summa', 'kod', 'nom', 'birlik', 'kat', 'norma', 'tur', 'ota_id', 'obyekt_id', 'narx_usul']);
type QatorXom = Record<string, unknown> & { id: number; obyekt_id: number; qoshimcha?: boolean | null; zamena?: boolean | null; replaces_line_id?: number | null; versiya?: number; ota_id?: number | null; daraja?: number | null };
const aslmi = (q: QatorXom) => !q.qoshimcha && !q.zamena && q.replaces_line_id == null;

async function ustunTurlari(m: Mijoz, jadval: string): Promise<Map<string, string>> {
  const r = await m.query<{ nom: string; tur: string }>(USTUN_TURLARI_SQL, [jadval]);
  return new Map(r.rows.map((x) => [x.nom, x.tur]));
}

export const qatorTahrir = tool({
  nom: 'qator_tahrir',
  tavsif: 't2_qator qatorini to\'g\'ridan-to\'g\'ri tahrirlash (`maydonlar`: {ustun: qiymat}; har qanday ustun). Triggerlar (versiya, o\'zgarish jurnali) ishlaydi, '
    + 't2.manba=mcp. Asl smeta qatorining hajm/narx/kod/nom… o\'zgarsa — rad etilmaydi, ogohlantirish qaytadi (snapshot_id bilan qaytarish mumkin). '
    + '`kutilgan_versiya` — optimistik qulf (ixtiyoriy).',
  kirish: { id: z.number().int().positive(), maydonlar: z.record(z.any()), kutilgan_versiya: z.number().int().optional(), dry_run: dryRun },
  yozadi: true,
  bajar: async (a, mu) => mu.yozish({
    tool: 'qator_tahrir', args: a, dryRun: a.dry_run,
    obyektId: async (m) => { const r = await m.query<{ obyekt_id: number }>('select obyekt_id from public.t2_qator where id = $1', [a.id]); if (!r.rows[0]) throw new Error(`Qator #${a.id} topilmadi.`); return Number(r.rows[0].obyekt_id); },
    izoh: `qator #${a.id}: ${Object.keys(a.maydonlar).join(',')}`,
  }, async (m, ogoh) => {
    const oldin = (await m.query<QatorXom>('select * from public.t2_qator where id = $1 for update', [a.id])).rows[0];
    const turlar = await ustunTurlari(m, 'public.t2_qator');
    const q = yangilashSorovi('public.t2_qator', a.id, a.maydonlar, turlar, a.kutilgan_versiya ?? null);
    const r = await m.query<QatorXom>(q.sql, q.params);
    if (!r.rows[0]) throw new Error(`Yangilanmadi: versiya mos emas (kutilgan ${a.kutilgan_versiya}, bazada ${oldin.versiya}).`);
    const ozgargan = Object.keys(a.maydonlar);
    if (aslmi(oldin) && ozgargan.some((k) => ASL_MAYDONLAR.has(k))) ogoh.push(`DIQQAT: asl smeta qatori o'zgartirildi (${ozgargan.filter((k) => ASL_MAYDONLAR.has(k)).join(', ')}) — «asl smeta const» qoidasi. Fakt/F2 o'zgarishlari odatda alohida qatlamda (qo'shimcha/zamena) yuritiladi.`);
    const keyin = qatorTozala(r.rows[0]);
    return { id: a.id, oldin: Object.fromEntries(ozgargan.map((k) => [k, qatorTozala(oldin)[k]])), keyin: Object.fromEntries([...ozgargan, 'versiya'].map((k) => [k, keyin[k]])) };
  }),
});

export const qatorQosh = tool({
  nom: 'qator_qosh',
  tavsif: 't2_qator ga yangi qator (to\'g\'ridan-to\'g\'ri INSERT). `ota_id` berilsa daraja = ota.daraja+1; tartib berilmasa — oxiriga. '
    + 'Qo\'shimcha ish/zamena uchun odatda `rpc` orqali t2_qoshimcha_ish_yarat_v1 / t2_zamena_ish_yarat_v1 ma\'qul (bog\'lanishlar bilan). qoshimcha=false — asl smetaga qo\'shilish ogohlantirishi.',
  kirish: { obyekt_id: obyektIdS, ota_id: z.number().int().positive().nullable().optional(), maydonlar: z.record(z.any()).describe('tur, kod, nom, birlik, hajm, narx, kat, norma, qoshimcha …'), dry_run: dryRun },
  yozadi: true,
  bajar: async (a, mu) => mu.yozish({ tool: 'qator_qosh', args: a, dryRun: a.dry_run, obyektId: a.obyekt_id, izoh: String(a.maydonlar.nom ?? '') }, async (m, ogoh) => {
    const v: Record<string, unknown> = { ...a.maydonlar, obyekt_id: a.obyekt_id };
    if (a.ota_id != null) {
      const ota = (await m.query<QatorXom>('select id, obyekt_id, daraja from public.t2_qator where id = $1', [a.ota_id])).rows[0];
      if (!ota) throw new Error(`Ota qator #${a.ota_id} topilmadi.`);
      if (Number(ota.obyekt_id) !== a.obyekt_id) throw new Error(`Ota qator #${a.ota_id} boshqa obyektda (#${ota.obyekt_id}).`);
      v.ota_id = a.ota_id;
      if (!('daraja' in v) && ota.daraja != null) v.daraja = Number(ota.daraja) + 1;
    }
    if (!('tartib' in v)) v.tartib = Number((await m.query<{ t: number }>('select coalesce(max(tartib), 0) + 1 as t from public.t2_qator where obyekt_id = $1', [a.obyekt_id])).rows[0].t);
    const q = qoshishSorovi('public.t2_qator', v, await ustunTurlari(m, 'public.t2_qator'));
    const r = await m.query(q.sql, q.params);
    if (!v.qoshimcha && !v.zamena) ogoh.push('DIQQAT: qator qoshimcha=false bilan qo\'shildi — asl smeta tarkibiga kiradi («asl smeta const» qoidasi).');
    return { qator: qatorTozala(r.rows[0]) };
  }),
});

export const qatorOchir = tool({
  nom: 'qator_ochir',
  tavsif: 't2_qator qatorini o\'chirish (DELETE). Bolalari bo\'lsa `kaskad:true` kerak (hamma avlodlari o\'chadi). Akt/fakt qatorlari bog\'langan bo\'lsa ogohlantiriladi (FK bloklashi mumkin). Snapshot avval olinadi.',
  kirish: { id: z.number().int().positive(), kaskad: z.boolean().optional(), dry_run: dryRun },
  yozadi: true,
  bajar: async (a, mu) => mu.yozish({
    tool: 'qator_ochir', args: a, dryRun: a.dry_run,
    obyektId: async (m) => { const r = await m.query<{ obyekt_id: number }>('select obyekt_id from public.t2_qator where id = $1', [a.id]); if (!r.rows[0]) throw new Error(`Qator #${a.id} topilmadi.`); return Number(r.rows[0].obyekt_id); },
    izoh: `qator #${a.id}${a.kaskad ? ' (kaskad)' : ''}`,
  }, async (m, ogoh) => {
    const ids = (await m.query<{ id: number }>(`with recursive d as (select id from public.t2_qator where id = $1 union all select q.id from public.t2_qator q join d on q.ota_id = d.id) select id from d`, [a.id])).rows.map((r) => Number(r.id));
    if (ids.length > 1 && !a.kaskad) throw new Error(`Qator #${a.id} ning ${ids.length - 1} ta avlodi bor — o'chirish uchun kaskad:true bering (yoki avval bolalarini ko'chiring).`);
    const bog = (await m.query<{ n: number }>('select count(*)::int as n from public.t2_akt_qator where qator_id = any($1::bigint[])', [ids])).rows[0]?.n ?? 0;
    if (bog) ogoh.push(`${bog} ta akt/fakt qatori shu qator(lar)ga bog'langan — FK bo'lsa o'chirish rad etiladi, bo'lmasa ular yetim qoladi.`);
    const asl = (await m.query<{ n: number }>('select count(*)::int as n from public.t2_qator where id = any($1::bigint[]) and not coalesce(qoshimcha,false) and not coalesce(zamena,false) and replaces_line_id is null', [ids])).rows[0]?.n ?? 0;
    if (asl) ogoh.push(`DIQQAT: ${asl} ta asl smeta qatori o'chirildi («asl smeta const» qoidasi).`);
    const r = await m.query('delete from public.t2_qator where id = any($1::bigint[]) returning id, tur, kod, nom', [ids]);
    return { ochirildi: r.rowCount, qatorlar: r.rows.slice(0, 100) };
  }),
});
