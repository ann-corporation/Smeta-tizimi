#!/usr/bin/env node
/**
 * tg-kanal.mjs — /api/telegram/kanal uchun kichik CLI (faqat superadmin sessiyasi bilan).
 *
 *   QURAI_COOKIE="sess=..."  node scripts/tg-kanal.mjs holat [kanal|guruh|@user|-100id]
 *   QURAI_COOKIE=...         node scripts/tg-kanal.mjs tavsif kanal "Yangi tavsif" [--sarlavha "Nom"]
 *   QURAI_COOKIE=...         node scripts/tg-kanal.mjs bot-profil '{"nom":"QURAI","qisqa":{"uz":"..","ru":"..","en":".."},"tavsif":{"uz":"..","ru":"..","en":".."}}'
 *   QURAI_COOKIE=...         node scripts/tg-kanal.mjs post kanal "Matn" [--rasm https://qurai.uz/x.png]   (egasiga qoralama; chiqarmaydi)
 *   QURAI_COOKIE=...         node scripts/tg-kanal.mjs ochir kanal 123                                   (egasiga o'chirish so'rovi)
 *
 * Sessiya cookie si FAQAT muhit o'zgaruvchisidan (QURAI_COOKIE) olinadi, hech qachon chop etilmaydi. QURAI_URL — standart https://qurai.uz.
 */
const [amal, ...a] = process.argv.slice(2);
const cookie = process.env.QURAI_COOKIE;
const base = (process.env.QURAI_URL || 'https://qurai.uz').replace(/\/+$/, '');
if (!cookie) { console.error('QURAI_COOKIE (superadmin sessiya cookie si) kerak.'); process.exit(2); }
const bayroq = (n) => { const i = a.indexOf('--' + n); return i >= 0 ? a.splice(i, 2)[1] : undefined; };
const rasm = bayroq('rasm'); const sarlavha = bayroq('sarlavha');
const yuk = {
  holat: () => ({ amal: 'holat', ...(a[0] ? { chat: a[0] } : {}) }),
  tavsif: () => ({ amal: 'tavsif_ornat', chat: a[0], tavsif: a[1], ...(sarlavha ? { sarlavha } : {}) }),
  'bot-profil': () => ({ amal: 'bot_profil_ornat', ...JSON.parse(a[0] || '{}') }),
  post: () => ({ amal: 'post_taklif', chat: a[0], matn: a[1], ...(rasm ? { rasm } : {}) }),
  ochir: () => ({ amal: 'post_ochir', chat: a[0], xabar_id: Number(a[1]) }),
}[amal];
if (!yuk) { console.error('amal: holat | tavsif | bot-profil | post | ochir'); process.exit(2); }
const r = await fetch(base + '/api/telegram/kanal', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie }, body: JSON.stringify(yuk()) });
console.log(r.status, JSON.stringify(await r.json().catch(() => ({})), null, 2));
process.exit(r.ok ? 0 : 1);
