'use strict';
// Sinov boshlash migratsiyasi (20270102000000) invariantlari — matn darajasidagi kontrakt (DB qabul sinovi: .acceptance.sql, ROLLBACK ichida).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = fs.readFileSync(path.join(dir, '20270102000000_t2_sinov_boshlash_v1.sql'), 'utf8');
const accept = fs.readFileSync(path.join(dir, '20270102000000_t2_sinov_boshlash_v1.acceptance.sql'), 'utf8');
const fn = (nom) => { const i = sql.indexOf('function public.' + nom + '('); assert.ok(i > 0, nom); return sql.slice(i, sql.indexOf('$f$;', i + 40)); };

test('bir martalik: operation_id foydalanuvchidan hosil bo‘ladi, ledger sababi sinov_boshlangich', () => {
  const b = fn('t2_sinov_boshlash_v1');
  assert.match(b, /md5\('sinov_boshlangich:' \|\| p_actor_id\)::uuid/);
  assert.match(b, /on conflict \(operation_id\) do nothing/);
  assert.match(b, /'sinov_boshlangich'/);
  assert.match(b, /command = 'sinov_boshlash' order by created_at limit 1/); // boshqa operation_id bilan ham qayta berilmaydi
  assert.match(b, /actor_id <> p_actor_id[\s\S]*OPERATION_CONFLICT/);
});
test('suiiste‘mol chegaralari: sutkalik umumiy, IP-xesh, a’zosi borga yo‘q', () => {
  const b = fn('t2_sinov_boshlash_v1');
  assert.match(b, />= 300/);
  assert.match(b, /r\.ip_belgi = v_ip\) >= 5/);
  assert.match(b, /SINOV_KERAKMAS/);
  assert.match(b, /t2_azolik where foydalanuvchi_id = p_actor_id and holat = 'faol'/);
});
test('izolyatsiya: demo faqat o‘z sinov kompaniyasiga (boss a’zolik), ulashilgan obyekt yo‘q', () => {
  const b = fn('t2_sinov_demo_v1');
  assert.match(b, /rol = 'boss'/);
  assert.match(b, /_t2_demo_nusxa\(v_kid, v_manba\)/);
  assert.match(b, />= 200/);
});
test('sinov ish joyi haqiqiyga aylanadi: yangi kompaniya/bonus yo‘q; sinovsiz yo‘l saqlangan', () => {
  const b = fn('t2_kompaniya_ozi_och_v1');
  assert.match(b, /sinovdan/);
  const i = b.indexOf("'sinovdan', true");
  const j = b.indexOf('_t2_sinov_bonus');
  assert.ok(i > 0 && j > i, 'aylantirish bonusdan oldin qaytadi');
  assert.match(b, /OZI_OCHILGAN/);
  assert.match(b, /INN_BAND/);
});
test('xavfsizlik: faqat service_role, tranzaksiya buyruqlari yo‘q, superadmin berilmaydi', () => {
  for (const f of ['t2_sinov_boshlash_v1(bigint, uuid)', 't2_sinov_demo_v1(bigint, uuid)', 't2_sinov_holat_v1(bigint)']) {
    assert.ok(sql.includes('revoke all on function public.' + f + ' from public, anon, authenticated;'), f);
    assert.ok(sql.includes('grant execute on function public.' + f + ' to service_role;'), f);
  }
  assert.doesNotMatch(sql, /^\s*(begin|commit);/im);
  assert.doesNotMatch(sql, /superadmin\s*\(/i);
});
test('token 1000 (sozlama) va namuna hajmi kichik', () => {
  assert.match(sql, /royxat_bonus_token = 1000/);
  const rs = (sql.match(/"rs":\[/g) || []).length;
  assert.ok(rs <= 5, 'namuna ishlar soni kichik');
});
test('qabul sinovi: takror, limit/izolyatsiya, aylantirish, a’zoga yo‘q', () => {
  for (const s of ['takror (op)', 'takror (yangi op)', 'izolyatsiya', 'SINOV_KERAKMAS', 'aylantirish', 'OZI_OCHILGAN', 'OPERATION_CONFLICT']) assert.ok(accept.includes(s), s);
});
