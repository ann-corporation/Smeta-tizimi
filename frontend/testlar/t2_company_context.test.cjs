/* T2-COMPANY-CONTEXT-P0-FIX-001 — kompaniya/tenant konteksti qo'riqchisi.
   Codex auditi (ops/handoff/T2_COMPANY_CONTEXT_UX_AUDIT_001_CODEX.md) asosida.
   `tsc` / `vitest` ko'rmaydigan strukturaviy shartlarni tekshiradi. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
const bor = (...p) => fs.existsSync(path.join(__dirname, '..', '..', ...p));
let ok = 0;
const must = (l, c) => { assert(c, l); console.log('  ✅ ' + l); ok++; };

const kontekst = R('frontend', 'src', 'umumiy', 'kontekst', 'KompaniyaKontekst.tsx');
const chiqish = R('frontend', 'src', 'umumiy', 'kontekst', 'chiqish.ts');
const kerak = R('frontend', 'src', 'umumiy', 'kontekst', 'KompaniyaKerak.tsx');
const scope = R('frontend', 'src', 'umumiy', 'kontekst', 'routeScope.ts');
const adminShell = R('frontend', 'src', 'admin', 'AdminShell.tsx');
const testShell = R('frontend', 'src', 'test02', 'TestShell.tsx');
const eskiTanlov = R('frontend', 'src', 'test02', 'KompaniyaTanlov.tsx');
const bossShell = R('frontend', 'src', 'boss', 'BossShell.tsx');
const app = R('frontend', 'src', 'App.tsx');
const mainTsx = R('frontend', 'src', 'main.tsx');
const pkg = JSON.parse(R('frontend', 'package.json'));
const hammasi = R('frontend', 'testlar', 'hammasi.cjs');

console.log('\n── P0-1: yagona provider AdminShell ichida ──');
must('KompaniyaProvider AdminShell.tsx da mount qilingan', /KompaniyaProvider/.test(adminShell) && /<KompaniyaProvider>/.test(adminShell));
must('KompaniyaTanlagich AdminShell konteks-barida ko\'rinadi', /<KompaniyaTanlagich \/>/.test(adminShell));
must('TestShell endi o\'z KompaniyaProvider ini yaratmaydi (ikkilanish yo\'q)', !/<KompaniyaProvider>/.test(testShell) && !/import .*KompaniyaProvider/.test(testShell));
must('eski test02/KompaniyaTanlov faqat re-export', /re-export/i.test(eskiTanlov) && /from '\.\.\/umumiy\/kontekst\/KompaniyaKontekst'/.test(eskiTanlov) && !/createContext/.test(eskiTanlov));

console.log('\n── P0-2: membership-filtered kompaniya ro\'yxati ──');
must('kontekst kanonik t2_men_v1 (menOl) dan oziqlanadi', /from '\.\.\/\.\.\/api\/t2-men'/.test(kontekst) && /menOl\(\)/.test(kontekst));
must('kontekst BARCHA-kompaniya sbT2KompaniyalarOl ni ISHLATMAYDI', !/sbT2KompaniyalarOl/.test(kontekst));
must('kompaniyalar ro\'yxati faqat azoliklar dan quriladi', /men\?\.azoliklar/.test(kontekst));
must('superadmin faqat FAOL azolik roli superadmin bo\'lsa', /a\.rol === 'superadmin'/.test(kontekst));

console.log('\n── P0-3: kontekst holati (persist / switch / logout / revoke / actor-namespace) ──');
must('joriy tanlov actor-namespaced localStorage da (uid bilan)', /t2_kompaniya_kontekst/.test(kontekst) && /uid: p\.uid|typeof p\.uid === 'number'/.test(kontekst));
must('boshqa actor tanlovi (uid mos kelmasa) e\'tiborga olinmaydi', /s\.uid === men\.foydalanuvchi\.id/.test(kontekst));
must('kompaniya almashilganda react-query keshi tozalanadi', /qc\.clear\(\)/.test(kontekst));
must('saqlangan tanlov azoliklar bilan solishtiriladi (revoke -> tozalanadi)', /const valid = kompaniyalar\.find\(\(k\) => k\.id === wantId\)/.test(kontekst));
must('logout kontekstni tozalaydi (chiqish.ts)', /t2_kompaniya_kontekst/.test(chiqish) && /removeItem/.test(chiqish));
must('AdminShell va BossShell YAGONA tizimdanChiq ni ishlatadi', /tizimdanChiq/.test(adminShell) && /tizimdanChiq/.test(bossShell));

console.log('\n── P0-4: route scope klassifikatsiyasi ──');
must('routeScope.ts har route ni klasslashtiradi', /GLOBAL|COMPANY_SCOPED|PROJECT_SCOPED|OBJECT_SCOPED/.test(scope));
// 2026-10-26: menyudagi sahifalarning scope'i yagona navigatsiya reestrida (routeScope.ts undan yig'adi).
const navReestr = R('frontend', 'src', 'lib', 'nav', 'navReestr.ts');
must('/admin/kompaniya = GLOBAL (kompaniya tanlash shart emas)', /yol: '\/admin\/kompaniya'[^\n]*scope: 'GLOBAL'/.test(navReestr) && /NAV_SAHIFALAR/.test(scope));
must('company-scoped sahifa <KompaniyaKerak/> ko\'rsatadi (xom matn emas)', bor('frontend','src','umumiy','kontekst','KompaniyaKerak.tsx') && /Global rejim|Kompaniya tanlanmagan/.test(kerak));
for (const f of ['HujjatNazoratPage.tsx', 'DocumentsPage.tsx', 'ParticipantsPage.tsx']) {
  const s = R('frontend', 'src', 'admin', 'pages', f);
  must(f + ': "Avval yuqoridan kompaniya tanlang" xom matni olib tashlangan', !/Avval yuqoridan kompaniya tanlang/.test(s) && /KompaniyaKerak/.test(s));
}
must('BossDashboard xom "kompaniya tanlang" matnini ishlatmaydi', !/Avval yuqoridan kompaniya tanlang/.test(R('frontend','src','admin','sahifalar','BossDashboard.tsx')));

console.log('\n── P0-5: xom xato UX ──');
must('main.tsx ErrorBoundary error.message ni ekranga chiqarmaydi', !/\{this\.state\.error\.message\}/.test(mainTsx) && /Diagnostika kodi/.test(mainTsx));
must('_shared/xato.ts xavfsiz xato helperi bor', bor('frontend','functions','_shared','xato.ts'));
must('company.ts xom text.slice ni foydalanuvchiga qaytarmaydi', /xavfsizXato/.test(R('frontend','functions','api','company.ts')));

console.log('\n── P0-6: Cloudflare Functions type gate ──');
must('tsconfig.functions.json mavjud + functions/** ni qamraydi', bor('frontend','tsconfig.functions.json') && /functions\/\*\*\/\*\.ts/.test(R('frontend','tsconfig.functions.json')));
must('typecheck:functions skripti bor', !!pkg.scripts['typecheck:functions']);
must('build skripti functions type-check ni yurgizadi', /tsconfig\.functions\.json/.test(pkg.scripts.build));
must('npm run tekshir (hammasi.cjs) functions type gate ni yurgizadi', /tsconfig\.functions\.json/.test(hammasi));
must('@cloudflare/workers-types devDependency da', !!(pkg.devDependencies && pkg.devDependencies['@cloudflare/workers-types']));

console.log('\n── P1: IA konsolidatsiyasi ──');
must('/admin/test/xodimlar -> /admin/kompaniya ga yo\'naltiriladi', /path="xodimlar" element=\{<Navigate to="\/admin\/kompaniya"/.test(app));
must('AdminShell navida "Xodimlar va Rollar" yo\'q (dublikat CRUD)', !/Xodimlar va Rollar/.test(adminShell));
must('KompaniyaPage a\'zolar boshqaruvini o\'z ichiga oladi (kanonik komandalar)', /useKompaniyaAzolari/.test(R('frontend','src','admin','pages','KompaniyaPage.tsx')) && /azoOchir/.test(R('frontend','src','admin','pages','KompaniyaPage.tsx')));
must('Settings dagi kompaniya-profil bloki olib tashlangan (redirect)', /Kompaniya sahifasiga o'tish/.test(R('frontend','src','test02','TestSozlama.tsx')) && !/kompaniya_nomi/.test(R('frontend','src','test02','TestSozlama.tsx')));

console.log('\n── P0-2 server: platforma superadmin (sun\'iy a\'zoliksiz) ──');
const mig = R('supabase', 'migrations', '20260914120000_t2_platforma_superadmin_context_v1.sql');
const migA = R('supabase', 'migrations', '20260914120000_t2_platforma_superadmin_context_v1.acceptance.sql');
must('t2_platforma_superadmin resolveri bor', /create or replace function public\.t2_platforma_superadmin/.test(mig));
must('superadmin shoxi HECH QANDAY t2_azolik yozmaydi (sun\'iy a\'zolik yo\'q)', !/insert into public\.t2_azolik/i.test(mig));
must('oddiy yo\'l o\'zgarmagan: a\'zolik topilsa roli qaytadi', /if found then return v_rol; end if;/.test(mig));
must('acceptance sentineli PLATFORMA_SUPERADMIN_CONTEXT_ACCEPTANCE_PASS', /PLATFORMA_SUPERADMIN_CONTEXT_ACCEPTANCE_PASS/.test(migA));
must('acceptance: superadmin cross-company da 0 ta yangi azolik', /wrote % synthetic|synthetic t2_azolik/.test(migA));

console.log('\n' + ok + ' checks passed');
