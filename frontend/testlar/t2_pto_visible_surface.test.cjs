/*
 * Release correction guard: kundalik T2 yo‘llari legacy menyuda takrorlanmasin
 * va PTO operatoriga ichki ID/version/hash ko‘rsatilmasin. Canonical ID’lar
 * komponentlarning state/key/API qatlamida qolishi mumkin; bu oracle faqat
 * rendered user-facing fragmentlarni tekshiradi.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const noComment = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
let passed = 0;
let failed = 0;
function must(label, condition, reason) {
  try {
    assert.ok(condition, reason || label);
    console.log('  ✅ ' + label);
    passed++;
  } catch (error) {
    console.log('  ❌ ' + label + ' — ' + error.message);
    failed++;
  }
}

const shell = noComment(read('frontend', 'src', 'admin', 'AdminShell.tsx'));
const oldMenu = shell.slice(shell.indexOf('const ESKI_TIZIM_MENYU = ['), shell.indexOf('export default function AdminShell'));
const t2Menu = shell.slice(shell.indexOf('const TIZIM_02_GURUHLAR = ['), shell.indexOf('const ESKI_TIZIM_MENYU'));
const exactMenuPath = (source, route) => new RegExp(`yol:\\s*['"]${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(source);

console.log('\n── T2 / legacy navigation boundary ──');
for (const route of ['/admin/obyektlar', '/admin/f2', '/admin/f2-tayyorlash', '/admin/narxlar']) {
  must(route + ' legacy menu duplicate removed', !exactMenuPath(oldMenu, route),
    route + ' ESKI_TIZIM_MENYU ichida qolmasligi kerak');
}
must('canonical nav uses production routes only', !/\/admin\/test\//.test(t2Menu),
  'oddiy PTO menyusida test/texnik marshrutlar ko‘rinmasligi kerak');
must('Smeta va Fakt bitta ishchi menyuda birlashtirilgan',
  /yol:\s*['"]\/admin\/holat['"][\s\S]{0,120}nom:\s*['"]Smeta va Fakt \/ LRV['"]/.test(t2Menu) && !exactMenuPath(t2Menu, '/admin/fakt'),
  'Fakt alohida dublikat menyu bo‘lib chiqmasligi kerak');
for (const route of ['/admin/dashboard', '/admin/obyektlar', '/admin/holat', '/admin/f2', '/admin/f2-tayyorlash', '/admin/f2-tarix', '/admin/hujjat-nazorat', '/admin/narxlar', '/admin/documents', '/admin/fayl-boglash']) {
  must(route + ' is present in the canonical IA', exactMenuPath(t2Menu, route),
    route + ' production information architecture ichida bo‘lishi kerak');
}
must('legacy modules start collapsed', /useState\(false\)/.test(shell),
  'Tizim_01/ERP menyusi default ko‘rinishda PTO ishini bosmasligi kerak');
/* ⚠️ 2026-09-08: bu yerda yana ikkita tekshiruv bor edi — «shell uses one
   bounded viewport contract» va «shell keeps URL project/object context
   visible». Ular qobiqning MANTIG'INI emas, `codex/premium-pto-ui-ux-v1`
   shoxchasidagi ANIQ implementatsiya izlarini (`os-route-viewport`,
   `os-route-context` CSS sinflari va `function routeContext(`) tekshirardi.
   O'sha qobiq olinmadi: egasi so'ragan «sichqoncha borsa ochiladigan,
   aks holda faqat belgichalar» yon paneli, menyu dublikatlarini olib
   tashlash va Tizim-1 ni alohida yig'ish AYNAN hozirgi qobiqda bor va
   Codex shoxchasi bulardan oldingi holatga asoslangan edi.

   Boshqa qobiq bilan bajarilishi mumkin bo'lgan talabni implementatsiya
   izi bo'yicha tekshirish — noto'g'ri test. Talabning o'zi (bitta
   scroll-host va URL kontekstining ko'rinishi) o'z o'rnida qoladi;
   kerak bo'lsa u xulq-atvor testi sifatida qayta yozilsin, manba
   matnidagi sinf nomi bo'yicha emas. */
for (const route of ['/admin/obyektlar', '/admin/f2', '/admin/f2-tayyorlash', '/admin/narxlar']) {
  must(route + ' remains in T2 navigation', exactMenuPath(t2Menu, route),
    route + ' TIZIM_02 navigation ichida ko‘rinadigan bo‘lishi kerak');
}

console.log('\n── PTO-visible identity boundary ──');
const ptoSources = [
  ['F2TayyorlashNative', read('frontend', 'src', 'admin', 'sahifalar', 'F2TayyorlashNative.tsx')],
  ['F2TarixNative', read('frontend', 'src', 'admin', 'sahifalar', 'F2TarixNative.tsx')],
  ['FaktNative', read('frontend', 'src', 'admin', 'sahifalar', 'FaktNative.tsx')],
  ['AdditionalReplacementNative', read('frontend', 'src', 'admin', 'sahifalar', 'AdditionalReplacementNative.tsx')],
  ['HujjatNazoratPage', read('frontend', 'src', 'admin', 'pages', 'HujjatNazoratPage.tsx')],
  ['ProgressValuationWorkspace', read('frontend', 'src', 'components', 'construction-document-control', 'ProgressValuationWorkspace.tsx')],
  ['RevisionHistoryView', read('frontend', 'src', 'components', 'construction-document-control', 'RevisionHistoryView.tsx')],
  ['ChangeControlWorkspace', read('frontend', 'src', 'components', 'construction-document-control', 'ChangeControlWorkspace.tsx')],
  ['ExportPreview', read('frontend', 'src', 'components', 'construction-document-control', 'ExportPreview.tsx')],
  ['ProjectCloseoutWorkspace', read('frontend', 'src', 'components', 'construction-document-control', 'ProjectCloseoutWorkspace.tsx')],
  ['NarxlarNative', read('frontend', 'src', 'admin', 'sahifalar', 'NarxlarNative.tsx')],
  ['DocumentCenter', read('frontend', 'src', 'components', 'document-center', 'DocumentCenter.tsx')],
  ['BossDashboard', read('frontend', 'src', 'admin', 'sahifalar', 'BossDashboard.tsx')],
];
for (const [name, source] of ptoSources) {
  const clean = noComment(source);
  must(name + ' has no visible row-number interpolation', !/>\s*#\$\{[^}]*qator_id/.test(clean) && !/F2\s+#\$\{/.test(clean),
    name + ' user-facing JSX ichida #qator_id ko‘rinmasligi kerak');
  must(name + ' has no visible revision/projection/hash identity',
    !/revisionIds\.join|projectionHash\s*\}/.test(clean) && !/>\s*\{e\.revisionId\}|>\s*\{c\.revisionId\}/.test(clean),
    name + ' user-facing JSX ichida revision/projection identifikatori ko‘rinmasligi kerak');
}
must('PTO visible export errors omit canonical line IDs',
  !/\{x\.lineId\}:\s*\{x\.code\}/.test(noComment(ptoSources.find(([name]) => name === 'ExportPreview')[1])),
  'eksport tekshiruvi operatorga ichki lineId bermasligi kerak');
must('DocumentCenter omits technical document identity',
  !/document_id|sha256|document\.revision|Canonical revision|Replica revision/.test(noComment(ptoSources.find(([name]) => name === 'DocumentCenter')[1])),
  'hujjat markazi document ID, revision va hashni oddiy foydalanuvchiga ko‘rsatmasligi kerak');
must('BossDashboard omits technical signal identity and raw error',
  !/s\.entity_type\}\s*#\$\{s\.entity_id\}|\(q\.error as any\)\?\.message/.test(noComment(ptoSources.find(([name]) => name === 'BossDashboard')[1])),
  'rahbar paneli signal ID yoki backend xatosini foydalanuvchiga chiqarmasligi kerak');
must('F2 tarixida developer versiya izohi yo‘q',
  !/serverdagi versiya|revision\s*[:=]/i.test(noComment(ptoSources.find(([name]) => name === 'F2TarixNative')[1])),
  'operatorga ichki versiya atamasi emas, tushunarli tasdiqlash holati ko‘rsatilishi kerak');

console.log('\n── LRV / F2 operator workflow guard ──');
const lrv = noComment(read('frontend', 'src', 'umumiy', 'daraxt', 'SmetaTree.tsx'));
const holat = noComment(read('frontend', 'src', 'admin', 'sahifalar', 'HolatNative.tsx'));
const f2Prep = noComment(read('frontend', 'src', 'admin', 'sahifalar', 'F2TayyorlashNative.tsx'));
/* 2026-09-30: yagona F2 import — /admin/f2 (F2ImportV3 + F2V3Workbench). Eski F2ImportNative va
   F2TwoPaneWorkbench olib tashlandi (egasi: "bitta manba"); talablar o'zgarmadi — tekshiruv V3 ga qaratildi. */
const f2Import = noComment(read('frontend', 'src', 'admin', 'sahifalar', 'F2ImportV3.tsx'));
must('LRV exposes canonical Fakt save port', /onFaktSave\?/.test(lrv) && /sbFaktBelgilaV2/.test(holat) && /sbFaktYoz/.test(holat),
  'Fakt LRV ichidan typed canonical adapter orqali yozilishi kerak');
must('LRV distinguishes total and delta Fakt', /Jami Faktni o‘rnatish/.test(lrv) && /Faktga qo‘shish/.test(lrv),
  'operator jami qiymat va qo‘shiladigan qiymatni adashtirmasligi kerak');
must('LRV has save/conflict state', /Saqlanmoqda/.test(lrv) && /conflict|serverda o‘zgargan/.test(lrv),
  'Fakt yozish holati va optimistic conflict ko‘rinishi kerak');
must('F2 preparation has bulk possible-volume action', /Barcha mumkin hajmni olish/.test(f2Prep),
  'yuzlab qatorni qo‘lda kiritishga majburlamaslik kerak');
must('F2 preparation has exception summary', /Tanlangan qatorlar/.test(f2Prep) && /Ogohlantirishlar/.test(f2Prep) && /Narx asosi yo‘q/.test(f2Prep),
  'F2 tayyorlash yuqori darajadagi exception summary berishi kerak');
/* ⚠️ 2026-09-08: bu uchta tekshiruv avval Codex'ning o'z F2 ekrani
   (`IkkiPanel` + jadval + `selectedUid`/`scrollIntoView`) manbasiga
   qarab yozilgandi. Egasi esa AYNAN drag-drop 2 oynali workbench'ni
   talab qilgan ("buni maksimal boyagi 2 oynali f2 importda ishlashi
   kerak"), shuning uchun `F2TwoPaneWorkbench` saqlab qolindi. Talab
   o'zgargani yo'q -- faqat uni bajaradigan komponent boshqa, shuning
   uchun tekshiruv HAQIQIY komponentga qaratildi. */
const f2Workbench = noComment(read('frontend', 'src', 'admin', 'sahifalar', 'F2V3Workbench.tsx'));
must('F2 import has exact/unmatched summary', /Aniq bog‘landi/.test(f2Workbench) && /Bog‘lanmagan/.test(f2Workbench) && /mos emas/.test(f2Import),
  'F2 import operatorga raw JSON o‘rniga tekshiruv xulosasini ko‘rsatishi kerak');
must('F2 import is a two-pane matching workbench', /F2V3Workbench/.test(f2Import) && /F2 qatori/.test(f2Workbench) && /smeta/i.test(f2Workbench),
  'F2 manbasi va kanonik smeta yonma-yon ko‘rinishi kerak');
must('F2 matching supports visual rebind', /onDragStart/.test(f2Workbench) && /onDrop/.test(f2Workbench) && /setTanlangan|tanla/.test(f2Workbench),
  'manba qatorini tanlab yoki sudrab kanonik qatorga bog‘lash mumkin bo‘lishi kerak');
const nakopPage = noComment(read('frontend', 'src', 'admin', 'pages', 'HujjatNazoratPage.tsx'));
const nakop = noComment(read('frontend', 'src', 'components', 'construction-document-control', 'NakopitelniyWorkspace.tsx'));
must('Nakopitelniy has project/object/period filters', /Davr/.test(nakopPage) && /Loyiha/.test(nakopPage) && /Obyekt/.test(nakopPage) && /qidiruv/.test(nakopPage),
  'Nakopitelniy read-model uchun kontekst va davr filtrlari ko‘rinishi kerak');
must('Nakopitelniy separates period and cumulative values', /Oldingi/.test(nakop) && /Joriy F2/.test(nakop) && /Jamlanma/.test(nakop) && /Qolgan/.test(nakop),
  'miqdor va qiymatning oldingi/joriy/jamlanma/qolgan o‘qlari alohida ko‘rsatilishi kerak');

console.log(`\n═══ ${passed} passed, ${failed} failed ═══`);
process.exit(failed ? 1 : 0);
