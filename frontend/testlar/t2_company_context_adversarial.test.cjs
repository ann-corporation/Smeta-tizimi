/*
 * T2-COMPANY-CONTEXT-ADVERSARIAL-TESTS-001
 *
 * Bu test ataylab current b54f686 relizida YIQILADI. U product bugni
 * yashirish uchun emas, Claude P0 fixidan keyin provider/selector/tenant
 * boundary haqiqatan birlashganini tekshirish uchun mustaqil oracle.
 *
 * Run (Claude fix worktree):
 *   node frontend/testlar/t2_company_context_adversarial.test.cjs
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const noComment = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const compact = (s) => noComment(s).replace(/\s+/g, ' ');
let passed = 0;
let failed = 0;
const must = (label, condition, why) => {
  try {
    assert.ok(condition, why || label);
    console.log('  ✅ ' + label);
    passed++;
  } catch (err) {
    console.log('  ❌ ' + label + ' — ' + err.message);
    failed++;
  }
};

const app = read('frontend', 'src', 'App.tsx');
const shell = read('frontend', 'src', 'admin', 'AdminShell.tsx');
/* T2-COMPANY-CONTEXT-P0-FIX-001 kanonik kontekst modulini test02/ dan
 * umumiy/kontekst/ ga ko'chirdi. `selector` shu kanonik moduldan
 * o'qiladi (KompaniyaTanlov.tsx endi faqat re-export). Assertionlar
 * O'ZGARMAGAN — faqat fayl yo'li fixga moslashtirildi (transparent). */
const selector = (fs.existsSync(path.join(ROOT, 'frontend', 'src', 'umumiy', 'kontekst', 'KompaniyaKontekst.tsx'))
  ? read('frontend', 'src', 'umumiy', 'kontekst', 'KompaniyaKontekst.tsx') + '\n'
    + read('frontend', 'src', 'umumiy', 'kontekst', 'KompaniyaTanlagich.tsx') + '\n'
    + read('frontend', 'src', 'api', 't2-men.ts') + '\n'
  : '') + read('frontend', 'src', 'test02', 'KompaniyaTanlov.tsx');
const testShell = read('frontend', 'src', 'test02', 'TestShell.tsx');
const sb = read('frontend', 'functions', 'api', 'sb.ts');
const auth = read('frontend', 'functions', '_shared', 'auth.ts');
const company = read('frontend', 'functions', 'api', 'company.ts');
const boss = read('frontend', 'functions', 'api', 'boss-dashboard.ts');
const control = read('frontend', 'functions', 'api', 'system-control.ts');
const documents = read('frontend', 'src', 'hujjat-maydoni', 'HujjatMaydoni.tsx');
const participants = read('frontend', 'src', 'admin', 'pages', 'ParticipantsPage.tsx');
const dashboard = read('frontend', 'src', 'admin', 'sahifalar', 'BossDashboard.tsx');
const workbench = read('frontend', 'src', 'admin', 'pages', 'HujjatNazoratPage.tsx');

console.log('\n── LEVEL 1: production shell context boundary ──');
const productionHasProvider = /KompaniyaProvider/.test(app) || /KompaniyaProvider/.test(shell);
must('production /admin tree imports the canonical CompanyProvider', productionHasProvider,
  'App.tsx yoki AdminShell.tsx production provider import qilishi kerak');
const shellHasSelector = /KompaniyaTanlagich/.test(shell) || /KompaniyaTanlagich/.test(app);
must('production /admin tree renders CompanySelector', shellHasSelector,
  'selector faqat /admin/test/* ichida qolmasligi kerak');
must('legacy TestShell is not the sole provider owner',
  productionHasProvider && shellHasSelector,
  'TestShell provideri production context uchun yetarli emas');

const productionConsumers = [
  ['BossDashboard', dashboard], ['DocumentsPage', documents],
  ['ParticipantsPage', participants], ['HujjatNazoratPage', workbench],
];
for (const [name, source] of productionConsumers) {
  must(name + ' company context consumer is covered by production provider',
    /useKompaniya\(/.test(source) ? productionHasProvider : true,
    name + ' useKompaniya ishlatadi, lekin production provider topilmadi');
}
must('TestShell no longer creates an independent second provider',
  !/KompaniyaProvider/.test(testShell) || /KompaniyaProvider/.test(app),
  'parallel provider stale context va selector divergence yaratadi');

console.log('\n── LEVEL 1: selector authorization contract ──');
must('selector does not query all active t2_kompaniya directly',
  !/sbT2KompaniyalarOl\s*\(/.test(noComment(selector)),
  'normal user selectorida barcha faol tenantlarni chiqarish mumkin emas');
must('selector/read model is actor-authorized through /api/company or an explicit context port',
  /\/api\/company|useMen\(|CompanyContextPort|companyContextOl/.test(selector + app + shell),
  'selector membership/access read modelga bog‘lanishi kerak');
must('active company persistence is actor-namespaced or session-bound',
  /localStorage\.setItem\([^\n]*(foydalanuvchi|actor|user|sess)/i.test(noComment(selector)) ||
    /SAQLASH_KALIT\s*=\s*[^;]*(foydalanuvchi|actor|user|sess)/i.test(noComment(selector)) ||
    // fix: bitta JSON kalit { uid, id, global }; uid = men.foydalanuvchi.id;
    // saqlangan tanlov faqat shu actor uchun tiklanadi (s.uid === men.foydalanuvchi.id)
    (/const uid = men\?\.foydalanuvchi\?\.id/.test(noComment(selector))
      && /s\.uid === men\.foydalanuvchi\.id/.test(noComment(selector))),
  'localStorage kaliti boshqa foydalanuvchi contextini meros qilmasligi kerak');
must('missing/stale context is not silently replaced with first active company',
  !/k\[0\]\s*\|\|\s*null/.test(compact(selector)),
  'birinchi faol kompaniyani avtomatik tanlash noto‘g‘ri tenant xavfi');

console.log('\n── LEVEL 1: server authorization invariants ──');
must('company API derives actor from verified session',
  /tekshir\(ctx\.request\.headers\.get\('Cookie'\)/.test(company) && /p_actor_id:\s*a\.id/.test(company),
  'actor request bodydan olinmasligi kerak');
must('company-scoped canonical gateways take target company plus actor',
  /p_kompaniya_id/.test(boss) && /p_actor_id/.test(boss) && /p_kompaniya_id/.test(control),
  'gateway target kompaniya va verified actorni RPCga uzatishi kerak');
must('legacy /api/sb must not rely only on a client filter shape for tenant isolation',
  !(/const mos\s*=\s*\(so\.filtr[\s\S]{0,180}kompaniya_id=eq/i.test(noComment(sb)) &&
    /if \(Array\.isArray\(sess\.kompaniyalar\)\)[\s\S]{0,500}if \(mos\)/i.test(noComment(sb))),
  'filter-shape authorization partial tenant guard hisoblanadi');
must('old session missing membership cannot bypass canonical tenant authorization',
  !/eski sessiya[\s\S]{0,180}(o.tkazib yuboriladi|skip|o.tkazib)/i.test(auth + sb),
  'canonical T2 pathlarda membership noma’lum bo‘lsa fail closed bo‘lishi kerak');

console.log('\n── LEVEL 1: safe empty/error UX ──');
const protectedPages = dashboard + documents + participants + workbench;
must('company-scoped production pages use a professional context-required surface',
  /CompanyContextRequired|company context|required|Kompaniya konteksti/i.test(protectedPages),
  'context yo‘q holatda professional selection/onboarding state bo‘lishi kerak');
must('production pages do not expose raw Error.message in context error UI',
  !/String\(\(q\.error as any\)\?\.message/.test(protectedPages),
  'raw backend message userga chiqmasligi kerak');

console.log('\n── LEVEL 4 contract fixtures (manual/API runner required) ──');
const manifest = JSON.parse(read('frontend', 'testlar', 'fixtures', 'company-context-adversarial-cases.json'));
must('manifest contains all mandatory adversarial cases', manifest.cases.length >= 26,
  'superadmin, normal user, persistence, deep-link, raw-error va logout cases yo‘q');
must('each case has expected server and UI evidence', manifest.cases.every((c) => c.id && c.level && c.expected),
  'test case evidence contracti to‘liq emas');

console.log(`\n═══ ${passed} passed, ${failed} failed ═══`);
process.exit(failed ? 1 : 0);
