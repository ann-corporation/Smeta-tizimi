/**
 * `f2_excel` — rasmiy Ф-2 (Акт о приёмке выполненных работ) Excel'ini brauzersiz yasash (egasi 2026-11-19).
 *
 * YAGONA MANBA: sayt (`/api/hujjat-yarat`) ishlatadigan `f2Yasa` (frontend/functions/_shared/hujjat-f2.ts) AYNAN SHU funksiya
 * chaqiriladi — bo'limlar, podval/nakrutka, imzo, КАЛИТ ustuni, dizayn, fayl nomi (`hujjatFaylNomi`) ikkinchi marta yozilmagan.
 * Farq faqat ma'lumot manbasida: yuklovchilarning nisbiy so'rovlari `sayt-shim` orqali MCP ning Postgres ulanishiga boradi.
 * Token: sayt bilan bir xil server yo'li (`serverSarfla`, `t2_token_sarfla_v1`, kalit obyekt+oy+raqam; qayta yuklash BEPUL).
 * `tasdiq:false` (standart) — preview: hujjat yasaladi, narx haqiqiy RPC dan (ROLLBACK) ko'rsatiladi, token yechilmaydi, fayl yozilmaydi.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { Mijoz } from '../db';
import {
  Rad, diskArxivla, diskHolatiMatni, f2Yasa, hujjatDizayniniOrnat, hujjatDizayniniYukla, serverSarfla, tizimImzosiniQoy,
  type F2Tayyor, type F2YasaAkt,
} from '../frontend';
import type { Muhit } from '../muhit';
import { SHIM_BAZA, shimRejimda } from '../sayt-shim';
import { dryRun, tool } from '../tool';

type AktSatr = { id: number; obyekt_id: number; tur: string | null; holat: string | null; oy: string | null; raqam: string | null; kompaniya_id: number | null };

const ENV_PAPKA = 'SMETA_EKSPORT_PAPKA';
/** Standart chiqish papkasi: SMETA_EKSPORT_PAPKA, aks holda `~/Downloads/smeta-f2`. */
export function standartPapka(env: NodeJS.ProcessEnv = process.env): string {
  return env[ENV_PAPKA]?.trim() || path.join(os.homedir(), 'Downloads', 'smeta-f2');
}

/** Fayl nomi yo'l ajratgichsiz (faqat nom; papka alohida). */
export const faylNomiTozala = (n: string): string => n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 180) || 'f2.xlsx';

/** Biznes qoidalari (sayt `f2Yasa` ga shu kancani uzatamiz): bekor akt rad; obyekt+oyiga bittadan ortiq bekor emas F-2 — rad (id lar bilan). */
export function f2Qoidalar(akt: F2YasaAkt, reestr: readonly F2YasaAkt[]): void {
  if (akt.holat === 'bekor') throw new Rad(409, 'AKT_BEKOR', `Akt #${akt.id} bekor qilingan (holat='bekor') — hujjat yasalmaydi.`);
  const oy = String(akt.oy ?? '').slice(0, 7);
  if (!oy) return;
  const bir = reestr.filter((a) => a.holat !== 'bekor' && String(a.oy ?? '').slice(0, 7) === oy);
  if (bir.length > 1) {
    throw new Rad(409, 'OYIGA_BIR_NECHTA_F2', `Obyektda ${oy} oyiga ${bir.length} ta bekor qilinmagan F-2 bor (egasi qoidasi: obyekt+oyga bitta F-2): ${bir.map((a) => `#${a.id}${a.raqam ? ` №${a.raqam}` : ''} (${a.holat ?? '?'})`).join(', ')}. Avval ortiqchasini bekor qiling (akt_bekor).`);
  }
}

/** Cloudflare R2 (REST) — faqat `put`: Diskka arxivlash (`diskArxivla` faqat `r2Yoz` → `put` chaqiradi). Tashqi `fetch` (shim emas) ishlatiladi. */
export function r2Bucket(env: NodeJS.ProcessEnv, tashqiFetch: typeof fetch): { put(k: string, v: Uint8Array, o?: unknown): Promise<unknown>; get(k: string): Promise<unknown>; head(k: string): Promise<unknown>; delete(k: string): Promise<unknown> } {
  const token = env.CLOUDFLARE_API_TOKEN?.trim(), account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !account) throw new Error('R2_SOZLANMAGAN: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID muhit o\'zgaruvchilari yo\'q — Diskka yozib bo\'lmaydi.');
  const baza = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${env.SMETA_R2_BUCKET?.trim() || 'smeta-tizimi-canonical'}/objects/`;
  const yoq = async () => { throw new Error('R2: bu amal MCP da yo\'q'); };
  return {
    async put(k, v, o) {
      const ct = (o as { httpMetadata?: { contentType?: string } } | undefined)?.httpMetadata?.contentType ?? 'application/octet-stream';
      const r = await tashqiFetch(baza + k.split('/').map(encodeURIComponent).join('/'), { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': ct }, body: v as unknown as BodyInit });
      if (!r.ok) throw new Error(`R2 yozish xatosi: HTTP ${r.status}`);
      return null;
    },
    get: yoq, head: yoq, delete: yoq,
  };
}

type TokenNatija = { sarflandi: number; bepul_takror: boolean } | { yetmaydi: true; kerak: number | null; balans: number | null };

type Bitta = {
  akt_id: number; obyekt_id: number; raqam: string | null; oy: string | null; fayl_nomi: string; qator_soni: number | null;
  summa: { ustamasiz: number | null; ustamali: number | null; nds: number | null; qqs_bilan: number | null; taxminiy: boolean; narxsiz_qator: number } | null;
  token: TokenNatija; yacheyka?: number; fayl?: string; hajm_bayt: number; disk?: string;
};

async function bittaAkt(mu: Muhit, a: AktSatr, o: { tasdiq: boolean; papka: string; disk: boolean }): Promise<Bitta> {
  const aktor = mu.aktorKerak();
  const kid = a.kompaniya_id;
  if (kid == null) throw new Rad(404, 'KOMPANIYA_YOQ', `Akt #${a.id}: obyekt kompaniyasi aniqlanmadi.`);
  if (mu.kompaniyaDoira && !mu.kompaniyaDoira.includes(kid)) throw new Rad(403, 'RUXSAT_YOQ', `Akt #${a.id}: bu kompaniyaga ruxsat yo'q.`);
  const tashqiFetch = globalThis.fetch;
  const bucket = o.tasdiq && o.disk ? r2Bucket(process.env, tashqiFetch) : null; // sozlanmagan bo'lsa — token yechilishidan OLDIN xato
  const env = { SUPABASE_URL: SHIM_BAZA, SUPABASE_KEY: 'mcp', ...(bucket ? { R2_CANONICAL: bucket } : {}) };
  let tayyor!: F2Tayyor;
  let bytes!: Uint8Array;
  let token!: TokenNatija;
  let yacheyka = 0;
  let disk: string | undefined;

  await mu.yozish({ tool: 'f2_excel', args: { akt_id: a.id, tasdiq: o.tasdiq, disk: o.disk }, dryRun: !o.tasdiq, obyektId: a.obyekt_id, snapshot: false, izoh: `akt #${a.id}` }, async (m: Mijoz) => {
    await shimRejimda({ m, aktorId: aktor }, async () => {
      await hujjatDizayniniYukla(kid); // sayt endpointi bilan bir xil: kompaniya «Hujjat dizayni» hujjatdan oldin qo'llanadi
      tayyor = await f2Yasa(kid, a.obyekt_id, a.id, { tekshir: f2Qoidalar, moliya: true });
      bytes = tizimImzosiniQoy(tayyor.bytes, { hujjat: tayyor.faylNomi });
      const s = await serverSarfla(env, { actorId: aktor, kompaniyaId: kid, turi: tayyor.turi, obyektId: a.obyekt_id, davr: tayyor.davr, xesh: tayyor.xesh, bytes: tayyor.bytes });
      if (!s.ok) {
        if (o.tasdiq || s.code !== 'TOKEN_YETMAYDI') throw new Error(`${s.code}: ${s.xato}`);
        token = { yetmaydi: true, kerak: Number.isFinite(s.kerak) ? s.kerak ?? null : null, balans: Number.isFinite(s.balans) ? s.balans ?? null : null };
      } else {
        token = { sarflandi: s.sarflandi, bepul_takror: s.bepulTakror };
        yacheyka = s.sarflandi;
      }
      if (o.tasdiq && o.disk) {
        const d = !tayyor.arxivla ? null : await diskArxivla(env as never, { actorId: aktor, kompaniyaId: kid, obyektId: a.obyekt_id, turi: tayyor.turi, faylNomi: tayyor.faylNomi, bytes: tayyor.bytes, davr: tayyor.davr, xesh: tayyor.xesh, manba: tayyor.manba });
        disk = diskHolatiMatni(d); // faqat tasdiqlangan F-2 Diskka yoziladi (sayt qoidasi)
      }
    }, () => hujjatDizayniniOrnat(null));
    return null;
  });

  let fayl: string | undefined;
  if (o.tasdiq) {
    await fs.mkdir(o.papka, { recursive: true });
    fayl = path.join(o.papka, faylNomiTozala(tayyor.faylNomi));
    await fs.writeFile(fayl, bytes);
  }
  const mo = tayyor.moliya;
  return {
    akt_id: a.id, obyekt_id: a.obyekt_id, raqam: a.raqam, oy: a.oy, fayl_nomi: tayyor.faylNomi, qator_soni: mo?.qatorSoni ?? null,
    summa: mo ? { ustamasiz: mo.ustamasiz, ustamali: mo.ustamali, nds: mo.nds, qqs_bilan: mo.jami, taxminiy: mo.taxminiy, narxsiz_qator: mo.narxsizQator } : null,
    token, ...(yacheyka ? { yacheyka } : {}), ...(fayl ? { fayl } : {}), hajm_bayt: bytes.byteLength, ...(disk ? { disk } : {}),
  };
}

export const f2Excel = tool({
  nom: 'f2_excel',
  tavsif: 'Rasmiy Ф-2 Excel (bo\'limlar, podval/nakrutka, imzo, КАЛИТ, dizayn) — saytdagi hujjat bilan AYNAN bir dvigatel (`f2Yasa`), brauzersiz. '
    + '`akt_id` yoki `akt_idlar`. Standart `tasdiq:false` — PREVIEW: summalar (ustamasiz/ustamali/QQS bilan), qator soni, fayl nomi va TOKEN NARXI (haqiqiy RPC, ROLLBACK); token yechilmaydi, fayl yozilmaydi. '
    + '`tasdiq:true` — token yechiladi (hujjat qayta yuklansa BEPUL: kalit obyekt+oy+raqam) va fayl `papka` ga (standart ~/Downloads/smeta-f2 yoki SMETA_EKSPORT_PAPKA) yoziladi; '
    + '`disk:true` — qo\'shimcha kompaniya Diskiga (faqat tasdiqlangan F-2; CLOUDFLARE_API_TOKEN/ACCOUNT_ID kerak). '
    + 'Rad: bekor akt; obyektda shu oyga bittadan ortiq bekor qilinmagan F-2 (id lar bilan). Aktor: SMETA_AKTOR_ID / aktor_tanla.',
  kirish: {
    akt_id: z.number().int().positive().optional().describe('t2_akt.id (tur=f2)'),
    akt_idlar: z.array(z.number().int().positive()).min(1).max(20).optional().describe('bir nechta akt (har biri alohida hujjat va token)'),
    papka: z.string().min(1).optional().describe('lokal chiqish papkasi (standart ~/Downloads/smeta-f2)'),
    disk: z.boolean().optional().describe('true + tasdiq:true — kompaniya Diskiga ham arxivlash'),
    tasdiq: z.boolean().optional().describe('true — token yechiladi va fayl yoziladi. Standart false (preview).'),
    dry_run: dryRun,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const idlar = [...new Set([...(a.akt_idlar ?? []), ...(a.akt_id != null ? [a.akt_id] : [])])];
    if (!idlar.length) throw new Error('akt_id yoki akt_idlar kerak.');
    const tasdiq = a.tasdiq === true && a.dry_run !== true; // dry_run:true har doim preview (tasdiq bilan to'qnashsa ham)
    const papka = path.resolve(a.papka ?? standartPapka());
    const satrlar = (await mu.oqish((m) => m.query<AktSatr>(
      `select a.id, a.obyekt_id, a.tur, a.holat, a.oy::text as oy, a.raqam, o.kompaniya_id
         from public.t2_akt a join public.t2_obyekt o on o.id = a.obyekt_id where a.id = any($1::bigint[])`, [idlar]))).rows;
    const natijalar: Array<Bitta | { akt_id: number; rad: string; kod?: string }> = [];
    for (const id of idlar) {
      const s = satrlar.find((x) => x.id === id);
      if (!s) { natijalar.push({ akt_id: id, rad: `Akt #${id} topilmadi.`, kod: 'AKT_TOPILMADI' }); continue; }
      if (s.tur !== 'f2') { natijalar.push({ akt_id: id, rad: `Akt #${id} F-2 emas (tur=${s.tur}).`, kod: 'TUR_F2_EMAS' }); continue; }
      try { natijalar.push(await bittaAkt(mu, s, { tasdiq, papka, disk: a.disk === true })); }
      catch (e) { natijalar.push({ akt_id: id, rad: e instanceof Error ? e.message : String(e), ...(e instanceof Rad ? { kod: e.code } : {}) }); }
    }
    if (natijalar.every((n) => 'rad' in n)) throw new Error(natijalar.map((n) => ('rad' in n ? n.rad : '')).join(' | '));
    return {
      rejim: tasdiq ? 'tasdiq (token yechildi, fayl yozildi)' : 'preview (token yechilmadi, fayl yozilmadi) — yozish uchun tasdiq:true',
      ...(tasdiq ? { papka } : {}),
      hujjatlar: natijalar,
    };
  },
});

export const HUJJAT_TOOLLAR = [f2Excel];
