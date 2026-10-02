/* TENANT IZOLYATSIYASI — "Auth Session -> User -> Tenant -> Role" poydevori
 * ═══════════════════════════════════════════════════════════════════
 *
 * 2026-08-27: foydalanuvchi ko'rsatmasi bilan (Antigravity orqali
 * uzatilgan, keyin to'g'ridan-to'g'ri suhbatda tasdiqlangan) — kichik
 * funksiyalarni to'xtatib, haqiqiy multi-tenant poydevorini qurish.
 *
 * MUAMMO EDI: sessiya faqat `rol`/`email` saqlardi — qaysi foydalanuvchi,
 * qaysi kompaniya(lar)ga a'zo ekani UMUMAN yo'q edi. Server `kompaniya_id`
 * ni mijoz yuborgan har qanday qiymat deb qabul qilardi, sessiya bilan
 * solishtirmasdi.
 *
 * Bu test 3 narsani tekshiradi (bazaga ulanmaydi, faqat KOD ichida
 * qoida saqlanib qolganini):
 *   1) Sess TYPE'i foydalanuvchi/kompaniya identifikatsiyasini bilishi
 *   2) kirish.ts yangi kirishda haqiqiy a'zolik yozuvini yaratishi
 *   3) sb-yoz.ts har yozuv so'rovida kompaniya a'zoligini tekshirishi
 *
 * Bazadagi xulq-atvor ALOHIDA tekshirilgan (Supabase MCP orqali, jonli):
 *   t2_kirish_royxatga_ol bir xil login bilan ikki marta chaqirilsa
 *     → ikkinchisi dublikat a'zolik yaratmaydi (idempotent)
 *   yangi foydalanuvchi hali a'zoligi yo'q bo'lsa
 *     → barcha faol kompaniyaga GAS'dan kelgan rol bilan a'zo qilinadi
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const oqi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let ok = 0, xato = 0;
const T = (nom, shart, izoh) => {
  if (shart) { ok++; console.log('  ✅ ' + nom); }
  else { xato++; console.log('  ❌ ' + nom + (izoh ? '  → ' + izoh : '')); }
};

console.log('\n── 1. SESS TYPE FOYDALANUVCHI/KOMPANIYANI BILADIMI ──');
{
  const s = oqi('functions/_shared/auth.ts');
  T('Sess da foydalanuvchi_id bor', /foydalanuvchi_id\?:\s*number/.test(s));
  /* ⚡ 2026-08-27: `kompaniyalar` oddiy ID massividan {kompaniya_id,
     rol} juftlik massiviga o'tdi — "polimorfik rol" (bir odam bir
     kompaniyada admin, boshqasida faqat rahbar) uchun. */
  T('Sess da kompaniyalar {id,rol} juftlik ro\'yxati bor',
    /kompaniyalar\?:\s*\{\s*kompaniya_id:\s*number;\s*rol:\s*string\s*\}\[\]/.test(s));
  T('eski sessiya buzilmasin deb IXTIYORIY (?:) belgilangan',
    /foydalanuvchi_id\?:/.test(s) && /kompaniyalar\?:/.test(s));
}

console.log('\n── 2. KIRISHDA HAQIQIY A\'ZOLIK YOZUVI YARATILADIMI ──');
{
  const s = oqi('functions/api/kirish.ts');
  T('t2_kirish_royxatga_ol chaqiriladi', s.indexOf('t2_kirish_royxatga_ol') >= 0);
  T('sessiya foydalanuvchi_id/kompaniyalar bilan imzolanadi',
    /imzola\(\{[^}]*foydalanuvchi_id[^}]*kompaniyalar/s.test(s));
  T('Supabase ishlamasa ham kirish BLOKLANMAYDI (best-effort)',
    s.indexOf('kirish baribir davom etadi') >= 0);
}

console.log('\n── 3. sb-yoz.ts HAR YOZUVDA A\'ZOLIKNI TEKSHIRADIMI ──');
{
  const s = oqi('functions/api/sb-yoz.ts');
  T('kompaniya_id sessiya a\'zoligi bilan solishtiriladi (topilmasa rad)',
    /sess\.kompaniyalar\.find\(\(a\) => a\.kompaniya_id === soraganKompaniya\)/.test(s));
  T('tekshiruv AMAL branchlaridan OLDIN turadi (hech biri o\'tkazib yubormaydi)',
    s.indexOf('sess.kompaniyalar.find') < s.indexOf("amal === 'qator_tahrir'"));
  T('eski sessiya (kompaniyalar yo\'q) bloklanib qolmaydi',
    /Array\.isArray\(sess\.kompaniyalar\)/.test(s));
  T('rad javobi 403 bilan qaytadi', /zo emassiz[\s\S]{0,80}status:\s*403/.test(s));
  /* ⚠️ 2026-09-07 (Claude, P0): AVVAL `boss` ham shu yerda bloklangan
     edi — bu XATO edi (t2_effective_authorization_v1ning o'z jadvaliga
     ko'ra boss to'liq yozish huquqiga ega). Endi faqat `rahbar`. */
  T('POLIMORFIK ROL: shu kompaniyadagi rol rahbar bo\'lsa yozish rad etiladi (boss EMAS)',
    /azolik\.rol === 'rahbar'/.test(s) && !/azolik\.rol === 'boss'/.test(s));
}

console.log('\n── 4. sb.ts (O\'QISH) HAM KOMPANIYA A\'ZOLIGINI TEKSHIRADIMI ──');
{
  /* 2026-10-02: o'qish izolyatsiyasi `_shared/tenant-oqish.ts` ga ko'chdi (DEFAULT DENY, majburiy kompaniya
     filtri). Xulq-atvor — `functions/_shared/tenant-oqish.test.ts` (vitest); bu yerda faqat ulanganini tekshiramiz. */
  const s = oqi('functions/api/sb.ts');
  const t = oqi('functions/_shared/tenant-oqish.ts');
  T('sb.ts har jadval o\'qishida oqishQarori ni chaqiradi', /const qaror = oqishQarori\(jadval, so, sess\)/.test(s));
  T('majburiy tenant filtri URL ga qo\'shiladi', /majburiyFiltr \? '&' \+ majburiyFiltr/.test(s));
  T('ota yozuv (obyekt/loyiha/viborka) egasi serverda tekshiriladi', /otaKompaniyasi\(ctx\.env, qaror\.ota\.jadval/.test(s));
  T('kompaniya jadvaliga kompaniya_id=in.(a\'zolar) majburan qo\'shiladi', /kompaniya_id=in\.\$\{royxat\}/.test(t));
  T('rad javobi 403 bilan qaytadi', /zo emassiz[\s\S]{0,80}/.test(t) && /rad\(403, 'TENANT_FORBIDDEN'/.test(t));
  T('eski anchorsiz o\'tkazib yuborish olib tashlandi', !/HOZIRCHA o'tkazib yuboriladi/.test(s));
  const blok = (s.match(/const RUXSAT_JADVALLAR[\s\S]*?\n\]\);/m) || [''])[0].replace(/\/\*[\s\S]*?\*\//g, '');
  const ochiq = [...new Set([...blok.matchAll(/'([^']+)'/g)].map((m) => m[1]))].sort();
  const sBlok = (t.match(/export const OQISH_SIYOSATI[\s\S]*?\n\};/m) || [''])[0].replace(/\/\*[\s\S]*?\*\//g, '');
  const siyosat = [...new Set([...sBlok.matchAll(/\b([a-z][a-z0-9_]*):\s*(?:K\b|OBYEKT\b|\{\s*tur)/g)].map((m) => m[1]))].sort();
  T('har ochiq jadvalning izolyatsiya siyosati bor (va ortiqcha siyosat yo\'q)',
    ochiq.length > 0 && JSON.stringify(ochiq) === JSON.stringify(siyosat),
    'faqat sb.ts da: ' + ochiq.filter((x) => !siyosat.includes(x)).join(',') + ' | faqat siyosatda: ' + siyosat.filter((x) => !ochiq.includes(x)).join(','));
}

console.log(`\n═══ ${ok} o'tdi, ${xato} yiqildi ═══`);
process.exit(xato ? 1 : 0);
