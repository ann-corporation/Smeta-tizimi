#!/usr/bin/env node
// BIR MARTALIK: faqat Google Drive da bo'lgan hujjatlarni R2 ga ko'chirish (Drive butunlay olib tashlanishidan OLDIN). HOZIR ISHGA TUSHIRILMAGAN.
// 2026-11-15 o'lchovi (faqat o'qish): registry 116 hujjat, hammasi R2 da; Drive-only = 0 -> bu skript hozir "0 nomzod" deb tugaydi.
//   node ops/scripts/drive-r2-kochir.mjs            # dry-run: nomzodlar soni va jami hajm
//   node ops/scripts/drive-r2-kochir.mjs --apply    # Drive dan yuklab, /api/hujjat-yukla (yagona R2 xizmati) orqali R2 ga yozadi, sha256 tekshiradi
// Muhit (faqat NOMLAR; qiymatlar hech qachon chop etilmaydi): SMETA_DB_URL (o'qish), DRIVE_ACCESS_TOKEN (Drive v3 o'qish tokeni),
//   PROD_URL, HUJJAT_SESSIYA_COOKIE (superadmin sessiya cookie - /api/hujjat-yukla shu bilan kiradi). `pg` moduli: PG_MODULE_DIR.
// Har nomzod: Drive dan bayt -> sha256 -> POST /api/hujjat-yukla (operation_id = sha256 dan; server dedup + sha256 tekshiradi) -> registry qayta o'qiladi,
// r2_key + sha256 mos bo'lsa ok. Hech narsa Drive dan o'chirilmaydi.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const apply = process.argv.includes('--apply');
const req = createRequire(join(resolve(process.env.PG_MODULE_DIR || '.'), 'x.js'));
const { Client } = req('pg');
const db = new Client({ connectionString: process.env.SMETA_DB_URL }); await db.connect();
const { rows } = await db.query("select id, kompaniya_id, loyiha_id, obyekt_id, document_type, original_filename, mime_type, drive_file_id, size_bytes from public.t2_document_registry where drive_file_id is not null and r2_key is null order by id limit 5000");
const jami = rows.reduce((a, r) => a + Number(r.size_bytes || 0), 0);
console.info(`Drive-only nomzodlar: ${rows.length}, jami ${(jami / 1048576).toFixed(1)} MB`);
if (!apply || rows.length === 0) { await db.end(); process.exit(0); }
let ok = 0, xato = 0;
for (const r of rows) {
  try {
    const d = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(r.drive_file_id)}?alt=media`, { headers: { Authorization: 'Bearer ' + process.env.DRIVE_ACCESS_TOKEN } });
    if (!d.ok) throw new Error('DRIVE_' + d.status);
    const bayt = Buffer.from(await d.arrayBuffer());
    const sha = createHash('sha256').update(bayt).digest('hex');
    const fd = new FormData();
    fd.append('fayl', new File([bayt], r.original_filename || 'fayl', { type: r.mime_type || 'application/octet-stream' }));
    fd.append('kompaniya_id', String(r.kompaniya_id)); if (r.loyiha_id) fd.append('loyiha_id', String(r.loyiha_id)); if (r.obyekt_id) fd.append('obyekt_id', String(r.obyekt_id));
    fd.append('turi', r.document_type || 'hujjat'); fd.append('sha256', sha); fd.append('size', String(bayt.length));
    fd.append('operation_id', [sha.slice(0, 8), sha.slice(8, 12), '4' + sha.slice(13, 16), '8' + sha.slice(17, 20), sha.slice(20, 32)].join('-'));
    const u = await fetch(process.env.PROD_URL + '/api/hujjat-yukla', { method: 'POST', body: fd, headers: { Cookie: process.env.HUJJAT_SESSIYA_COOKIE } });
    const j = await u.json();
    if (!j.ok || j.sha256 !== sha) throw new Error('YUKLASH_' + (j.code || u.status));
    const t = (await db.query('select r2_key, sha256 from public.t2_document_registry where id = $1', [j.document_id])).rows[0];
    if (!t?.r2_key || t.sha256 !== sha) throw new Error('REGISTRY_MOS_EMAS');
    ok++;
  } catch (e) { xato++; console.error(`registry#${r.id}: ${e.message}`); }
}
console.info(`Tugadi: ok=${ok}, xato=${xato}`);
await db.end(); process.exit(xato ? 1 : 0);
