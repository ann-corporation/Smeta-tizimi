/* T2-RUXSAT-YADRO-ROLLAR-001: rol -> ruxsat to'plami FAQAT yagona katalogda (t2_role_permissions_v2).
 * Qoidalar:
 *  1) t2_effective_authorization_v1 ning ENG OXIRGI ta'rifi katalogga tayanadi va qattiq rol ro'yxati yo'q
 *     (aks holda yangi rol UNKNOWN_ROLE bilan rad etiladi).
 *  2) 20261216800000 dan keyingi migratsiyalarda `when '<rol>' then array['x.y',...]` ruxsat ro'yxati yo'q
 *     (t2_role_permissions_v2 ning o'zi bundan mustasno; platforma control.global.* massivi hisobga olinmaydi).
 *    node testlar/t2_ruxsat_yadro_rollar.test.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '..', '..', 'supabase', 'migrations');
let bad = 0;
function must(label, v) { if (v) console.log('✅ ' + label); else { console.error('❌ ' + label); bad++; } }
const forward = fs.readdirSync(dir).filter(f => f.endsWith('.sql') && !/\.(rollback|acceptance)\.sql$/.test(f)).sort();
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

const defs = forward.filter(f => /create\s+(or\s+replace\s+)?function\s+public\.t2_effective_authorization_v1\s*\(/i.test(read(f)));
const last = defs[defs.length - 1];
must('t2_effective_authorization_v1 ta\'rifi topildi (' + last + ')', !!last);
const src = last ? read(last) : '';
const m = src.match(/create\s+(or\s+replace\s+)?function\s+public\.t2_effective_authorization_v1\s*\([\s\S]*?\$(\w*)\$[\s\S]*?\$\2\$/i);
const body = m ? m[0] : '';
must('oxirgi ta\'rif rol to\'plamini t2_role_permissions_v2 dan oladi', /t2_role_permissions_v2\s*\(/.test(body));
must('oxirgi ta\'rifda qattiq `when \'<rol>\' then array[` ruxsat ro\'yxati yo\'q',
  !/when\s+'[a-z_]+'\s+then\s+array\s*\[\s*'(?!control\.global)[a-z_]+\.[a-z_.]+'/i.test(body.replace(/--[^\n]*/g, '')));

const RAD = /when\s+'([a-z_]+)'\s+then\s+array\s*\[\s*'(?!control\.global)[a-z_]+\.[a-z_.]+'/ig;
const yangi = forward.filter(f => f.slice(0, 14) > '20261216800000');
const topilgan = [];
for (const f of yangi) {
  const s = read(f).replace(/--[^\n]*/g, '');
  // t2_role_permissions_v2 ta'rifi ichidagisi ruxsat etiladi
  const qolgan = s.replace(/create\s+(or\s+replace\s+)?function\s+public\.t2_role_permissions_v2\s*\([\s\S]*?\$(\w*)\$[\s\S]*?\$\2\$/ig, '');
  if (RAD.test(qolgan)) topilgan.push(f);
  RAD.lastIndex = 0;
}
must('20261216800000 dan keyingi migratsiyalarda qattiq rol->ruxsat ro\'yxati yo\'q' + (topilgan.length ? ' (' + topilgan.join(', ') + ')' : ''), topilgan.length === 0);
process.exit(bad ? 1 : 0);