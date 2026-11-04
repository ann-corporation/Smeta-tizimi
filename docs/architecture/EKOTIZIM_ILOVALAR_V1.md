# EKOTIZIM ILOVALAR V1 — «Google Workspace» uslubidagi ilovalar modeli (dizayn)

Holat: **DIZAYN QORALAMA** · 2026-11-04 · kod va migratsiya YO'Q · egasi qarori: ilovalar + rol ish joylari + «Bugun».
Bog'liq: `docs/architecture/ekotizim/` (E0–E7 — ko'p tomonli tenant/ruxsat kontraktlari; bu hujjat ularni O'ZGARTIRMAYDI, ustiga mahsulot qatlamini qo'yadi), `docs/governance/CONSTITUTION.md`.

## 0. Qisqa xulosa va topilmalar (dalil bilan)

1. **Modul yoqish/o'chirish mexanizmi ALLAQACHON bor** — yangi «ilova sozlama» jadvali kerak emas:
   `t2_capability` (`turi='module'`: `module.narx|loyiha|erp|aosr`, prodda hammasi `on`), `t2_modul_holat_v1`, `t2_capability_override_set_v1`
   (migratsiya `20261106730000_t2_modul_katalog_v1.sql`), frontendda `frontend/src/lib/modullar.ts` (`menyuModulYoqilgan`) va `navFiltr.ts` 1-qadam.
   Reestrdagi `NavSahifa.modul` maydoni shu uchun. **Tavsiya: ilova = modul kodi (kengaytiriladi), `t2_kompaniya_sozlama` emas.**
   `t2_kompaniya_sozlama.kalit` ustida CHECK bor (faqat `hujjat.imzo_tomonlari`, `hujjat.dizayn`; `f2.tasdiq_rejimi` RPC ichida) — yangi kalit uchun migratsiya kerak bo'ladi (§G, taklif).
2. **Hodisa shinasi `t2_outbox` prodda BO'SH (0 qator).** Kodda faqat `tomon.*`, `kontragent.tomon_boglandi`, `izoh.yozildi`, `topshiriq.*`, `buyurtma.*`, tender jarayoni yozadi; iste'molchi faqat `bildirishnoma` (`t2_outbox_ishlov_v1`). **F2 tasdiqlash (`t2_akt_lifecycle_transition_v1`), fakt, paket, to'lov outbox ga YOZMAYDI** → ilovalararo avtomatik oqimning asosiy qismi hozir yo'q.
3. **Signal dvigateli bor** (`t2_signal`, `t2_signal_emit`, `docs/architecture/CONTROL_SIGNAL_ENGINE_V1.md`). Prodda: `missing_price` open 8 868, `data_quality` open 4 804, `document_missing` open 8. «Bugun» uchun tayyor asos, lekin shovqinli (guruhlash kerak).
4. **Monetizatsiya ostki qismi ishlaydi**: token daftari (o'zgarmas), `t2_token_sarfla_v1` (atomik, idempotent), tariflar, obuna, qo'lda to'lov so'rovi. Prod tariflari: Bepul sinov 200 token/0 so'm; PTO Start 3 300/299 000; PTO Pro 9 200/799 000; PTO Expert 24 000/1 999 000 (oyiga). `token_som=100`, foyda 30 %, ro'yxatdan o'tish bonusi 500 token. Faol obuna: 1 ta (free). Kompaniya soni 2, faol a'zolik 5 — ya'ni tizim hali tijoratlashmagan, tuzilma o'zgartirish arzon.
5. **Tarqoqlik manbai**: navigatsiya reestri (`navReestr.ts`) toza, lekin `App.tsx` da ~60 ta marshrut reestrdan tashqarida (eski `/admin/test/*`, `/boss/*`, ERP alohida yo'llari). Menyu emas, **marshrutlar va bir xil sahifaning bir necha manzili** muammo.

## A. Inventar — har marshrut → ilova → rollar

Manba: `frontend/src/lib/nav/navReestr.ts` (menyu, ruxsat), `frontend/src/App.tsx` (marshrutlar), `frontend/scripts/generate-site-map.mjs` (generator: `menuRoutes` = reestr `yol:`, `appRouteSegments` = `<Route path>`; natija `src/lib/sayt-xaritasi/generated.ts` repoda yo'q — build paytida hosil bo'ladi), `frontend/src/lib/company-authorization/route-permission.ts`, `frontend/src/lib/nav/menyuRolYopiq.ts`.
Rol belgilari: SA superadmin · BO boss/admin · RA rahbar · PT pto · PR prorab · BX buxgalter (`bugalter`) · TA ta'minotchi · OM omborchi · US usta/brigadir · BU buyurtmachi · KA kadr · ME mexanik · IN inspektor. Rollar capability dan (prod `t2_role_permissions_v2(rol)`, 61 ta katalog) chiqarildi.
Ilova kodlari: **PTO**=PTO va Smeta · **FF**=Fakt va F2 · **MO**=Moliya · **SO**=Sotuv · **XO**=Xarid/Tender/Ombor · **HR** · **LO**=Logistika · **HA**=Hujjat aylanishi · **DE**=Desktop · **YA**=Yadro (Kompaniya/Shaxsiy, doim yoqiq) · **PL**=Platforma (faqat SA).

### A1. Menyudagi sahifalar (navReestr.ts, komponent App.tsx dan)

| Yo'l | Komponent (frontend/src/…) | Ilova | Ruxsat (ko'rinish) | Rollar |
|---|---|---|---|---|
| /admin/dashboard | admin/sahifalar/BossDashboard.tsx | MO (rahbar paneli; «Bugun» ga ko'chadi) | control.company.read, financial.write | RA BO PT BX |
| /admin/obyektlar | test02/TestObyektlar.tsx | PTO | smeta.read | PT PR BX RA BO BU |
| /admin/loyiha | test02/TestLoyiha.tsx | PTO | project.read (module.loyiha) | PT PR RA BO BU |
| /admin/participants | (ParticipantsPage) | HA | project.read | PT PR RA BO BU |
| /admin/mindmap | test02/TestXarita.tsx | PTO | control.company.read, project/object.write | RA BO PT PR |
| /admin/smeta-studio | (SmetaStudio) | PTO | control…, smeta.write | RA BO PT PR |
| /admin/holat, /admin/holat/:id | admin/sahifalar/HolatNative.tsx | PTO | smeta.read | PT PR BX RA BO BU |
| /admin/smeta-narxlash, /narx-dalil, /nakrutka, /narxlar, /narx-manbalari, /oferta | SmetaNarxlashResNative, NarxDalil, NakrutkaNative, Narxlar, NarxManbalari, OfertaNative | PTO (module.narx) | narx.write | RA BO PT PR |
| /admin/fakt | admin/sahifalar/FaktNative.tsx | FF | fakt.write yoki fakt.read+self.work.write | BO PT PR US RA |
| /admin/m29 | M29Native.tsx | FF (ombor bilan bog'liq) | smeta.write, warehouse.write | RA BO PT PR OM |
| /admin/f2-tayyorlash | F2TayyorlashNative | FF | f2.prepare | BO PT PR |
| /admin/f2 | F2ImportV3 (+F2ImportNative.tsx) | FF | f2.import | BO PT PR |
| /admin/f2-tarix | F2TarixNative | FF | f2.read | PT PR BX RA BO BU |
| /admin/f2-reestr | F2Reestr | FF | f2.read | shu |
| /admin/nakopitelniy | NakopitelniyVedomost | FF (Forma-3 shu yerda) | f2.read | shu |
| /admin/moliya | test02/WrapperMoliya.tsx | MO | financial.write (module.erp) | RA BO PT BX |
| /admin/shartnoma-liniya | ShartnomaLiniya | MO | financial.read, object/project.write | RA BO PT BX PR BU |
| /admin/qarzdorlik | Qarzdorlik | MO | financial.write | RA BO PT BX |
| /admin/crm | test02/WrapperCRM.tsx | MO (kontragentlar) | financial.write, object/project.write | RA BO PT BX PR |
| /admin/aloqalar | TomonlarAloqa | HA | shu | shu |
| /admin/documents | DocumentsPage | HA | project.read, document.write | PT PR BX RA BO BU |
| /admin/hujjat-nazorat | HujjatNazoratPage | HA | shu | shu |
| /admin/aosr | test02/TestAosr.tsx | HA (module.aosr) | document.write, quality.read | PT PR RA BO IN |
| /admin/storage | test02/TestSaqlash.tsx | HA | shu | shu |
| /admin/zakazchik, /taqdimlar, /murojaatlar | ZakazchikKabinet, TaqdimlarInbox, Murojaatlar | HA | project.read | RA BO PT PR BU |
| /admin/logistika | test02/WrapperLogistika.tsx | LO + XO (sklad) — **bo'linadi** | logistics.read, warehouse.read… | TA OM PT PR RA BO |
| /admin/zayavka | test02/TestZayavka.tsx | XO | procurement.read, warehouse.write | TA OM PT PR RA BO |
| /admin/tender | TenderSahifa | XO | procurement.read, supply.offer | TA PT PR RA BO |
| /admin/erp | test02/TestErp.tsx | HR (+ mexanika) | hr.read, machinery.read/log | KA ME PT PR RA BO |
| /admin/sotuv | SotuvSahifa | SO | sales.read | BX RA BO (PT YO'Q) |
| /admin/kompaniya | KompaniyaPage | YA | company.member.manage, company.profile.update | BO RA |
| /admin/tizim-sozlama, /hujjat-dizayn, /tokenlar, /ai-agentlar, /korzinka | TestSozlama, HujjatDizayni, Tokenlar, AiAgentlar, TestKorzinka | YA (tokenlar = billing) | control.company.read (+company.*) | BO RA |
| /admin/system-control | SystemControlPage | PL | faqatSuperadmin | SA |
| /admin/ish-joylarim, /topshiriqlar, /mutaxassis, /akkaunt, /sozlamalar | IshJoylarim, Topshiriqlar, Mutaxassis, AkkauntMarkazi, SozlamalarMarkazi | YA (shaxsiy) | [] hamma | hamma |
| /admin/boshqaruv, /tizim-xaritasi, /fayl-boglash, /test, /sayt-xaritasi, /_demo/* | BoshqaruvPanel, TizimXaritasi, FaylBoglash, TestShell, SaytXaritasi, *Demo | PL | superadmin | SA |

### A2. Reestrda YO'Q marshrutlar (App.tsx) — dublikat / yetim / yo'naltirma

| Yo'l (App.tsx) | Holat | Ilova | Tavsiya |
|---|---|---|---|
| /admin/test/moliya, /logistika, /zayavka, /erp, /crm, /loyiha, /aosr, /korzinka, /sozlama, /xarita, /obyektlar, /saqlash | **DUBLIKAT** — production manzili bor (yuqoridagi jadval) | — | `Navigate` ga aylantirish; eski xatcho'p buzilmasin |
| /admin/test/portfel, /smeta, /daraxt, /tolov, /sklad, /faktura, /hisobot, /tizim, /kontragent | **YETIM** (menyuda yo'q; `/test/kontragent` — SUPERADMIN_ISTISNO, CRM «Batafsil») | MO/XO/PTO | har birini ilovaga biriktirish yoki arxivlash (alohida audit) |
| /admin/test/xodimlar, /f2native | yo'naltirma (kompaniya, f2) | — | qoladi |
| /admin/kadrlar, /texnika, /taminot, /sifat (ErpKadrlar/Texnika/Taminot/Sifat) | **YETIM** — `/admin/erp` ning bo'limlari, `/boss/*` da ham takror | HR / XO / HA | `/admin/erp` tablari sifatida reestrga yozish |
| /boss, /boss/holat, /boss/fakt, /boss/kadrlar… /boss/eski (BossShell, Umumiy) | **DUBLIKAT** (`/admin/holat`, `/admin/fakt` …); `/boss/eski` — eski GAS paneli | — | `/boss/*` → `/admin/*` yo'naltirma; `eski` arxiv |
| /admin/zakazchik/obyekt/:aloqaId/:obyektId (ObyektPortali) | ichki sahifa (menyuda yo'q) | HA | qoladi, ilova = HA |
| /qoshil/:kod, /ulash/:kod, /tg, / (KirishSahifa) | kirish/taklif yo'llari | YA | ilovadan mustaqil |
| /admin/f2-eski, /buxgalteriya, /shartnomalar, /fakturalar, /sklad, /ierarxiya, /monitoring, /hujjatlar, /shaxsiy-smeta, /supabase, /tezlik, /shartnoma, /kalkulyator | yo'naltirmalar (redirect) | — | qoladi (eski havolalar) |
| frontend/src/test02/ dagi TestF2, TestFakt, TestHujjat, TestGrafik, TestNarxlar, TestNarxNazorati, TestBirja, TestKorrespondensiya, TestSotuvCrm, TestSpravochnik, TestMaterialAlias, TestInvite | App.tsx da to'g'ridan `<Route>` YO'Q — boshqa sahifa ichida komponent bo'lishi mumkin | ? | **tekshirilmagan**: P1 da `grep` bilan import grafini tekshirib, yetimlarini ro'yxatlash |

Natija: ~46 menyu sahifasi → ilovalarga bo'lingach har ilovada 3–9 sahifa. 13 ta `/admin/test/*` dublikat + `/boss/*` = menyu o'zgarmaydi, lekin Ctrl+K va sayt xaritasidagi shovqin kamayadi.
**Reestr o'zgarishi (taklif):** `NavSahifa` ga `ilova: IlovaKod` maydoni (hozirgi `modul` ni almashtiradi/to'ldiradi); `NavGuruh` ning ilovaga xaritasi bitta jadvalda (`lib/nav/ilovalar.ts`, sof ma'lumot). Ikkinchi ro'yxat yaratilmaydi (reestr qoidasi).

## B. Ilova ta'riflari

Umumiy qoida: ilova **ko'rinish va tarif** birligi, **xavfsizlik** emas. Xavfsizlik — capability + server (CONSTITUTION). Ilova o'chiq bo'lsa: menyuda yo'q, Bugun'da yo'q, **serverda yozuv amali rad etiladi** (§F.3).

| Kod | Ilova | Maqsad | Sahifalar | Asosiy capability (mavjud) | Bog'liq (qattiq/yumshoq) |
|---|---|---|---|---|---|
| PTO | PTO va Smeta | Obyekt, smeta, narxlash, LRV/RES | obyektlar, holat, smeta-studio, narx*(6), loyiha, mindmap | object.*, smeta.*, narx.*, project.* | — (yadro) |
| FF | Fakt va F2 | Fakt → F2 → Nakopitelniy → Forma-3 → oylik paket | fakt, m29, f2*(5), nakopitelniy | fakt.*, f2.read/import/prepare/approve/cancel/correct, self.work.* | PTO (qattiq); XO (M-29, yumshoq) |
| MO | Moliya | To'lov, xarajat, shartnoma, qarzdorlik, buxgalteriya | moliya, shartnoma-liniya, qarzdorlik, crm, dashboard | financial.*, accounting.*, payroll.* | FF (F2 → debitor), PTO |
| SO | Sotuv (uy sotish) | Ko'chmas mulk: shaxmatka, bron, bitim, grafik, to'lov | sotuv | sales.read/write/price/payment | MO (kassa, yumshoq) |
| XO | Xarid, Tender, Ombor | Zayavka → tender/birja → buyurtma → sklad | zayavka, tender, (logistika→sklad qismi) | procurement.*, supply.*, warehouse.* | PTO (smeta resursi), LO, MO |
| HR | Kadrlar/KPI | Xodim, tabel, texnika, KPI | erp (+kadrlar, texnika) | hr.*, hr.pii.*, hr.tabel.write, machinery.*, payroll.* | FF (mehnat fakti), MO |
| LO | Logistika | Reys, mashina, haydovchi, yuk birjasi | logistika (transport qismi), `t2_tr_*` | logistics.read/dispatch/trip | XO (buyurtma → yuk) |
| HA | Hujjat aylanishi | Hujjatlar, AOSR/laboratoriya, tomonlar, buyurtmachi kabineti | documents, hujjat-nazorat, aosr, storage, zakazchik, taqdimlar, murojaatlar, aloqalar, participants | document.*, quality.*, design.* | barchasi (yumshoq) |
| DE | Desktop | Oflayn obyekt paketi, `/api` shim | UI sahifasi yo'q: `frontend/src/desktop/fetch-shim.ts`, `OBYEKT_PAKET_OFFLINE_DESKTOP_V1.md` | — (tarif bayrog'i) | PTO, FF |
| YA | Yadro | Kompaniya, a'zolar, tokenlar, sozlamalar, shaxsiy, AI ishchilar | kompaniya, tokenlar, ... | company.*, control.* | — doim yoqiq |
| PL | Platforma | Superadmin | boshqaruv, system-control, … | k.superadmin | — |

Yadro PTO/Smeta + Fakt/F2 bugungi qarorga ko'ra «modul emas, doim ko'rinadi» (modullar.ts izohi). Tavsiya: **FF ni PTO ga qattiq bog'lab, ikkalasi PTO paketida doim yoqiq**; qolgan 7 ilova yoqiladigan.

**Qoida (ilova yoqilsa):** yangi `module.*` kodlari `t2_capability` ga qo'shiladi: `module.moliya`, `module.sotuv`, `module.xarid`, `module.hr`, `module.logistika`, `module.hujjat`, `module.desktop` (mavjud `module.narx|loyiha|erp|aosr` yangi kodlarga xaritalanadi, eski kodlar o'chirilmaydi — orqaga moslik).

## C. Ilovalararo bog'lanish matritsasi («atom soati»)

Statuslar: **bor** (kodda dalil) · **qisman** · **yo'q**. «Dalil» — migratsiya/RPC nomi. Har oqimning umumiy qabul sharti (hammasi uchun): (1) `operation_id` takrorida ikkinchi ta'sir yo'q; (2) boshqa kompaniya ma'lumoti ko'rinmaydi; (3) NULL ≠ 0, minus ishora saqlanadi; (4) summa tiyingacha mos (`SummaJuft` qoidasi: ustamali + ustamasiz); (5) outbox qatori + audit.

| # | Manba voqea | Maqsad ta'sir | Mexanizm | Holat | Qabul testi (taklif) |
|---|---|---|---|---|---|
| L1 | PTO: smeta faol versiya | FF: fakt faqat `versiya_holat='faol'` qatorga | `t2_fakt_yoz_v2`, `/api/sb` versiya shlyuzi (`functions/_shared/versiya-oqish.ts`), qo'riqchi `t2_versiya_xabardorlik_audit_v1()` | bor | Almashtirilgan versiya qatoriga fakt yozish rad; audit funksiya bo'sh |
| L2 | FF: fakt yozildi | F2 qoralama hajmi | `t2_f2_qoralama_yangila_v1`, `t2_akt_yarat_v2` | bor | Fakt 10→12: qoralama hajmi 12; F2 tasdiqlangandan keyin fakt o'zgarsa qoralamaga tegmaydi (const) |
| L3 | FF: F2 `approved` | MO: kutilayotgan tushum/debitor | Hozir: `t2_f2_reestr_yoz_v1` (qo'lda), `t2_debitor_aging` shartnoma bo'yicha. **Outbox yo'q** | **yo'q** (qisman: qo'lda reestr) | `approve` → `f2.tasdiqlandi` outbox qatori (bitta tranzaksiyada) → MO ko'rinishida `f2_summa` = akt qatorlari yig'indisi (ustamali) tiyingacha teng; takror `operation_id` — 1 qator |
| L4 | FF: F2 `approved` | Nakopitelniy / Forma-3 | `t2_nakopitelniy_v2`, `t2_forma3_f2_bog_v1`, `t2_forma3_lineage_guard_v1` | qisman (F3 bog'lash qo'lda RPC) | F2 jami = nakopitelniy o'sish; F3 manba F2 aktga bog'liq, bekor qilingan F2 ga bog'lab bo'lmaydi |
| L5 | FF: oy yopildi | FF/HA: oylik paket | `t2_shartnoma_oylik_paket_tekshir_v1/_saqla_v1`, `_t2_oy_iz_v1` | bor (yumshoq ogohlantirish) | Topshirilgach F2 o'zgarsa saqlash bloklanmaydi, «o'zgargan» belgisi chiqadi |
| L6 | Paket «topshirildi» | MO: schet/to'lov kutish | yo'q | **yo'q** | `paket.topshirildi` → MO da «to'lov kutilmoqda» elementi; summa = paket F2 yig'indisi |
| L7 | FF: M-29 | XO: sklad qoldig'i kamayadi | `t2_m29_bajar_v1`, `t2_m29_bekor_v1`, `t2_sklad_ombor_qoldiq_v1` | qisman (tekshirish kerak) | M-29 bajar: qoldiq −N; bekor: +N; minus qoldiq rad |
| L8 | PTO: smeta resursi | XO: zayavka (talabnoma) | `t2_zayavka_royxat`, `TIZIM_02_PROCUREMENT_REQUEST_CONTRACT_V1.md` | qisman | Zayavka hajmi ≤ smeta hajmi; ortiq — ogohlantirish |
| L9 | XO: zayavka → tender/birja | XO: buyurtma | `t2_tender_*_v1`, `t2_birja_rfq_yarat`, `t2_buyurtma_*` (outbox `buyurtma.*`) | bor | G'olib tanlash → buyurtma 1 ta; takror yo'q |
| L10 | XO: buyurtma `yuklashga_tayyor` | LO: reys/yuk | outbox `buyurtma.yuklashga_tayyor`, `_t2_yuk_buyurtmadan_v1` (F3b) | qisman (F3b mavjudligi tekshirilmagan) | Buyurtma → yuk 1:1; ok=false bo'lsa buyurtma o'tishi bekor |
| L11 | LO: reys yopildi | MO: transport xarajati | `t2_tr_reys_yop_v1`, `t2_tr_xarajat_otkaz_v1` | qisman | Reys yopish → xarajat 1 ta, obyektga o'tkazma summasi reys narxiga teng |
| L12 | XO: sklad kirim (faktura) | MO: yetkazuvchi qarzi | `t2_sklad_markaziy_prixod_import_v1`, `t2_qarzdorlik_saqla_v1` | **yo'q** (ikki alohida import) | Kirim hujjati → qarz qatori; storno → qarz kamayadi |
| L13 | SO: to'lov yozildi | MO: kassa/jami tushum | `t2_sotuv_tolov_yoz_v1`, `t2_sotuv_tolov_bekor_v1` | **yo'q** (tekshirish kerak: MO ga o'tish) | Sotuv to'lovi = MO tushum, bekor qilish teskari yozuv |
| L14 | HR: tabel | FF/MO: mehnat fakti, ish haqi | `hr.tabel.write`, `payroll.*` | **yo'q** | Tabel soati × stavka = mehnat xarajati |
| L15 | Har ilova: hujjat chiqarish | YA: token yechish | `hujjatTokenBilan` (`lib/token-hujjat.ts`) → `tokenSarfla` → `t2_token_sarfla_v1` | bor | Yetarli token: 1 yechim; yetmasa `TOKEN_YETMAYDI`; xato → `t2_token_qaytar_v1` 24 s ichida bir marta; bir xil xesh — bepul |
| L16 | Istalgan: topshiriq/izoh/tomon | Bildirishnoma | `t2_outbox` → `t2_outbox_ishlov_v1('bildirishnoma')` | qisman (prodda outbox bo'sh) | Topshiriq berish → ijrochiga 1 bildirishnoma; o'zi o'ziga yo'q |
| L17 | FF: fakt vs F2 | Bugun/signal | `t2_overbilling_radar`, `t2_signal_emit` | bor (ko'rinish) | F2 hajm > fakt hajm → signal 1 ta, tuzatilsa `resolved` |
| L18 | XO: tender yutildi | PTO/MO: shartnoma/loyiha | `t2_tender_golib_v2` → `t2_shartnoma_saqla_v2` | **yo'q** | G'olib → shartnoma qoralamasi (qo'lda tasdiq) |
| L19 | Ilova o'chirildi | Menyu/Bugun/server | `t2_modul_holat_v1`, gateway | qisman (faqat menyu) | O'chiq ilova amali serverda `ILOVA_YOQILMAGAN`; ma'lumot saqlanadi |

**Atom soati qoidasi (taklif):** har L-oqim uchun bitta fayl: `supabase/tests/ekotizim_link_L<N>_contract.sql` (mavjud `*_contract*.sql` va migratsiya yonidagi `*.acceptance.sql` uslubida) + 1 ta frontend Vitest (nav/ilova). CI da «oqim → test» jadvali tekshiriladi: matritsada «bor» deb yozilgan oqimning testi bo'lmasa CI qizil.
Oldin L3 va L6 uchun **outbox yozish** (alohida migratsiya + test), keyin iste'molchi. Iste'molchilar hozir bitta (`bildirishnoma`); yangi kursorlar (`moliya`, `bugun`) `t2_outbox_kursor` bilan qo'shiladi (`iste_molchi` regexi `^[a-z][a-z0-9_]{1,40}$`; payload ≤ 4096 bayt, mavzu regexi `^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$`).

## D. Rol ish joylari (5–7 asosiy amal + standart ilovalar)

Standart bosh sahifa bugun: `lib/nav/boshSahifa.ts` (`ROL_BOSH_SAHIFA`). Taklif: yangi `lib/nav/rolIshJoyi.ts` (sof ma'lumot). Qolgani «Barcha bo'limlar».

| Rol | Standart ilovalar | 5–7 asosiy amal (target) |
|---|---|---|
| Prorab (PR) | PTO, FF, XO | 1 Bugungi fakt kiritish (/admin/fakt) · 2 Obyekt holati (/admin/holat) · 3 Zayavka berish (/admin/zayavka) · 4 M-29 sarfi (/admin/m29) · 5 F2 tayyorlash (/admin/f2-tayyorlash) · 6 Topshiriqlarim · 7 AOSR |
| PTO (PT) | PTO, FF, HA | 1 F2 tayyorlash/import · 2 Tasdiq kutayotgan F2 (/admin/f2-tarix) · 3 Fakt ↔ F2 farqi (overbilling) · 4 Oylik paket · 5 Narxlash (RES) · 6 Smeta yuklash (/admin/obyektlar) · 7 Hujjat nazorati |
| Buxgalter (BX) | MO, FF (o'qish), SO | 1 Qarzdorlik (/admin/qarzdorlik) · 2 To'lovlar (/admin/moliya) · 3 Shartnomalar · 4 F2 reestri (faqat o'qish) · 5 Sotuv to'lovlari (SO yoqiq bo'lsa) · 6 Hujjatlar |
| Rahbar/Boss (RA/BO) | hammasi (yoqiqlari) | 1 Bugun (bosh) · 2 Rahbar paneli · 3 Tasdiqlash navbati · 4 Qarzdorlik/pul oqimi · 5 Obyektlar xaritasi · 6 Kompaniya/a'zolar · 7 Tokenlar va obuna |
| Sotuvchi (BX/RA + sales.*) | SO | 1 Shaxmatka · 2 Bron muddati · 3 Bitimlar · 4 To'lov grafigi · 5 Mijozlar. NB: «sotuvchi» roli hozir YO'Q (sales.* faqat bugalter/rahbar/boss) — yangi rol kerak, **taklif**; PTO da sales.* yo'q (ataylab) |
| Ta'minotchi (TA) | XO, LO | 1 Ochiq zayavkalar · 2 Tender/takliflar · 3 Buyurtmalar · 4 Yetkazib berish · 5 Sklad qoldig'i |
| Omborchi (OM) | XO | 1 Kirim qabul · 2 M-29 · 3 Qoldiq · 4 Zayavka bajarish |
| Usta/brigadir (US) | FF (soddalashtirilgan) | 1 Bugungi fakt (self.work.write) · 2 Mening ishlarim |
| Buyurtmachi (BU) | HA | 1 Buyurtmachi kabineti · 2 Obyekt portali · 3 F2 ko'rish · 4 Murojaat |
| Kadr/Mexanik/Inspektor | HR / HR / HA | KA: xodim, tabel · ME: texnika jurnali · IN: AOSR, laboratoriya |

Mexanizm: `rolBoshSahifasi` o'zgarmaydi (zaxira); yangi `IshJoyiKarta[]` (nom, yo'l, ruxsat, ilova) navFiltr bilan filtrlanadi — ruxsati yo'q yoki ilovasi o'chiq karta ko'rinmaydi.

## E. «Bugun» navbati

Printsip: tizim **hisoblaydi**, foydalanuvchi bosadi → tegishli ekran **oldindan to'ldirilgan** ochiladi (`?obyekt=&akt=` kabi `scope` parametrlari; pul/PII URL ga qo'yilmaydi — faqat id). Yangi RPC taklifi: `t2_bugun_v1(p_actor_id, p_kompaniya_id)` (faqat o'qish, actor ruxsati ichida; `t2_effective_authorization_v1`). Element = {tur, ilova, obyekt, sarlavha, jiddiylik, muddat, nishon yo'l, soni}. Signal asosli turlar `t2_signal` dan (obyekt bo'yicha **guruhlanadi**: 8 868 ta missing_price bitta «N obyektda narxsiz qator» kartasi).

| Tur | Ilova | Manba | Jiddiylik | Maqsad ekran |
|---|---|---|---|---|
| B1 Tasdiqlangan F2 bor, fakt yo'q | FF | `t2_overbilling_radar` (f2_hajm vs fakt_hajm) | yuqori | /admin/fakt?obyekt= |
| B2 F2 tasdiq kutmoqda | FF | `t2_akt.lifecycle_status in ('submitted','checked')` (RPC: `t2_akt_lifecycle_transition_v1`); SoD: tasdiqlovchi tayyorlovchi emas | yuqori (rahbar/PT) | /admin/f2-tarix?akt= |
| B3 Oylik paketda hujjat yetishmaydi | FF/HA | `t2_shartnoma_oylik_paket_tekshir_v1`, `t2_aosr_coverage`, signal `document_missing` | o'rta | /admin/f2-tarix (paket) |
| B4 Muddati o'tgan talabnoma | XO | `t2_zayavka_royxat` (muddat, holat) | yuqori | /admin/zayavka?id= |
| B5 To'lanmagan qarz | MO | `t2_debitor_aging` (kun_otdi, guruh), `t2_qarz_svod_v1` | yuqori | /admin/qarzdorlik?shartnoma= |
| B6 Narxsiz qatorlar | PTO | signal `missing_price` (obyekt bo'yicha guruh) | o'rta | /admin/smeta-narxlash?obyekt= |
| B7 Menga topshiriq | YA | `t2_topshiriqlar_v1` | o'rta | /admin/topshiriqlar |
| B8 O'qilmagan bildirishnoma | YA | `t2_bildirishnomalar_v1` | past | tegishli ekran |
| B9 Tender muddati | XO | `t2_tenderlar_v1` | o'rta | /admin/tender?id= |
| B10 Bron/grafik kechikishi | SO | `t2_sotuv_panel_v1`, `t2_sotuv_bitimlar_v1` | o'rta | /admin/sotuv |
| B11 Ochiq reys / yetkazib berish | LO | `t2_transport_ol_v1` | o'rta | /admin/logistika |
| B12 Token kam / obuna tugayapti | YA | `t2_token_holat_v1` (balans, obuna.tugaydi) | o'rta (BO/RA) | /admin/tokenlar |
| B13 Ma'lumot sifati | PTO | signal `data_quality` (4 804 open — faqat guruh, tavsiya sifatida) | past | tegishli |

Tartib: `ball = jiddiylik(3/2/1) × 100 + muddat_yaqinligi (0–50) + summa_ahamiyati (0–30)`; rolga ko'ra filtr (capability + ilova yoqiq). Har tur «yopilgan» holatini manba holatidan oladi (alohida to'lov o'chirish yo'q); «keyinga qoldirish» — shaxsiy `localStorage` emas, `t2_signal.state='dismissed'` (signal asosli turlar).

## F. Monetizatsiya

### F1. Hozir bor (dalil)
| Qism | Joy |
|---|---|
| Token daftari (o'zgarmas, faqat INSERT, minus yo'q) | `t2_token_harakat`, trigger `t2_token_harakat_ozgarmas_trg` (`20261105270000_t2_pto_tijorat_v1.sql`) |
| Narx jadvali: amal → asos + yacheyka narxi, foyda % | `t2_token_narx` (`smeta_import`, `f2_import`, `f2_qoralama`, `f2_hujjat`, `hujjat`, `ai_kirish`, `ai_chiqish`, `katalog_import`), `t2_token_sozlama` (1 token = 100 so'm, foyda 30 %); v3 — yuqori chegara olib tashlangan |
| Hujjat chiqarish yagona pullik yo'li | `frontend/src/lib/token-hujjat.ts` (`hujjatTokenBilan`: faqat tizim hisoblagan formulali kataklar; bir xil xesh — bepul; xato — qaytarish) → `frontend/src/api/t2-token.ts` (`tokenBilan`, `tokenSarfla`, `tokenQaytar`, `tokenYakunla`) → `/api/sb-yoz` `token_sarfla_v1` → `t2_token_sarfla_v1` |
| Tariflar/obuna | `t2_tarif`, `t2_obuna`, `t2_obuna_belgila_v1` (superadmin; to'lov qo'lda tasdiqlanadi) |
| To'lov so'rovi (o'tkazma/payme/click) | `t2_tolov_sorov_yarat_v1`, superadmin ko'rinishi `t2_boshqaruv_tolovlar_v1`; saga `t2_token_saga_v1` |
| O'zi ro'yxatdan o'tish, demo | `t2_ozi_royxat_*`, `t2_demo_manba_belgila_v1`, bonus 500 token |
| Superadmin panel | `/admin/boshqaruv`, `t2_boshqaruv_*` |
| Marketplace | tender (`t2_tender_*`), birja (`t2_birja_rfq_*`), transport (`t2_tr_*`), uy sotish (`t2_sotuv_*`) — **komissiya hozir YO'Q** |

### F2. Taklif (narxlar — FARAZ, bozor tekshiruvi kerak)

| Qatlam | Model | Faraz narx (so'm) | Izoh |
|---|---|---|---|
| Asos tarif (mavjud) | kompaniya/oy: Start 299 000 · Pro 799 000 · Expert 1 999 000 (prod) | o'zgarmaydi | PTO + FF kiradi |
| Ilova qo'shimchasi | har ilova alohida oylik | MO 149 000 · XO 199 000 · SO 349 000 · HR 99 000 · LO 149 000 · HA 99 000 · DE 199 000 | Pro tarifga 2 ilova, Expert barcha ilova kiritilgan (faraz) |
| O'rindiq (seat) vs obyekt | **Gibrid tavsiya**: tarifga N o'rindiq kiradi (Start 3, Pro 10, Expert cheksiz); ortiqcha o'rindiq 29 000/oy; **faol obyekt** limiti (Start 3, Pro 15) — ortiqcha obyekt 59 000/oy | — | Qurilishda ofis xodimi kam, obyekt ko'p → obyekt hajmi daromadga ko'proq mos. Usta/shaxsiy (`self.work`) o'rindiq sanalmaydi |
| Hujjat tokenlari | mavjud: asos + yacheyka, 1 token = 100 so'm, foyda 30 % | o'zgarmaydi | Barcha ilovalar hujjati shu yo'ldan o'tadi (egasi: «har ish pul ishlasin») |
| Marketplace komissiya | tender g'olibi to'lovi: shartnoma summasining 0,3–1 % (yetkazuvchidan) ; uy sotish: bitim summasining 0,1–0,3 % ; yuk birjasi: reys narxining 3–5 % | — | Faqat platforma ichida yopilgan bitimlar; qo'lda tasdiq (hisob-kitob oyligi) |
| Sinov | 14 kun, bepul tarif 200 token (mavjud `free`), ro'yxatdan o'tish bonusi 500 token (mavjud); **demo kompaniya** = `t2_demo_manba` obyekti nusxasi (o'qish rejimida) | 0 | Tugagach: PTO yadrosi o'qish rejimi, hujjat chiqarish token talab qiladi |
| Yillik chegirma | 12 oy = 10 oy narxi | — | `p_oylar` 1–24 ruxsat etilgan (mavjud) |

### F3. Qayerda majburlanadi (hozir / kerak)
| Qatlam | Hozir | Taklif |
|---|---|---|
| Menyu | `modullar.ts` + `navFiltr.ts` (faqat ko'rinish) | `ilova` bo'yicha; tarifdan kelgan ilova ham «yoqiq» deb hisoblanadi |
| Marshrut | `RuxsatGuard` (capability, `faqatSuperadminYolmi`) | + ilova yoqiqligi (o'chiq ilova URL i «Ilova yoqilmagan» ekrani) |
| **Server (eng muhimi)** | capability RPC ichida; modul holati serverda tekshirilmaydi | `functions/api/sb-yoz.ts` va `sb.ts` dagi amal → ilova xaritasi + `t2_modul_holat_v1` tekshiruvi (gateway); qo'shimcha: kritik RPC ichida `t2_ilova_yoqilgan(kompaniya, kod)` yordamchi (migratsiya taklifi) |
| Obuna muddati | `t2_obuna.tugaydi` bor, ammo avtomatik cheklov yo'q | `t2_modul_holat_v1` natijasiga tarif ilovalarini qo'shish; muddat o'tsa: yozuv amallari `OBUNA_TUGAGAN` (o'qish ochiq, ma'lumot yo'qolmaydi) |
| Token | **Mijoz** `hujjatTokenBilan` orqali chaqiradi (fayl ko'p hollarda brauzerda yasaladi) — server «hujjat tayyor» deb bilmaydi | Faylni kanonik saqlashga (`/api/hujjat-yukla`) yozishda serverda tokenni tekshirish (tekshirilmagan; alohida audit) — aks holda mijoz tokenni aylanib o'tishi mumkin |
| O'rindiq/obyekt limiti | yo'q | a'zo qo'shish (`t2_azolik_qosh_v1`) va obyekt yaratish (`t2_obyekt_yarat_v1`) ichida limit tekshiruvi |
| Komissiya | yo'q | tender/sotuv/reys yopish RPC larida `t2_token_harakat` ga emas, alohida `t2_komissiya` daftariga o'zgarmas yozuv (taklif, F5 fazasi) |

## G. Amalga oshirish rejasi (kichik, xavfsiz PR lar)

Smeta CONST, F2 muzlash qoidalariga tegilmaydi. Har PR: gate'lar + i18n (`t()` + `lugat/qism/ekotizim.json`) + yangiliklar yozuvi (`public/yangiliklar.json`).

| Faza | PR | Tarkib | Taxminiy hajm |
|---|---|---|---|
| 1 | Ilova yoqish + menyu filtri | `lib/nav/ilovalar.ts` (sof ma'lumot); `NavSahifa.ilova`; `navFiltr` 1-qadam ilova bo'yicha; ilova ishga tushirgich (yuqori panel); ilova ichida faqat shu menyu; «Kompaniya → Ilovalar» yoqish/o'chirish (`t2_capability_override_set_v1`); testlar (har sahifa aynan bitta ilovada, yetim yo'q). Dublikat `/admin/test/*` → `Navigate` | 5–7 kun |
| 2 | Rol ish joyi | `rolIshJoyi.ts`, `RolBoshSahifa` kartalar; «Barcha bo'limlar»; `menyuRolYopiq` bilan mos test | 3–4 kun |
| 3 | «Bugun» | `t2_bugun_v1` (faqat o'qish) + sahifa; B1–B8 birinchi bosqich; signal guruhlash; maqsad ekranlarga `?obyekt=&akt=` oldindan to'ldirish | 8–10 kun |
| 4a | Outbox yozuvchilar | `f2.tasdiqlandi`, `paket.topshirildi` (L3, L6) — bitta tranzaksiyada; iste'molchi kursori `moliya` | 5–6 kun |
| 4b | Bog'lanish testlari | L1–L19 shartnoma testlari + CI tekshiruv «oqim→test»; yetishmaydigan L12–L14, L18 alohida PR lar | 10–15 kun (qisman 4a bilan) |
| 5 | Ilova bo'yicha billing | tarif→ilova xaritasi; gateway tekshiruvi; o'rindiq/obyekt limiti; tokenlar sahifasida ilova obunalari; komissiya daftari — keyingi PR | 8–12 kun |
| 6 (keyin) | Tsikl stepper, Ctrl+K AI, Oddiy/Pro | Ctrl+K palitrasi mavjud (`AdminShell` + `navFiltr`) — AI qatlam qo'shiladi | alohida baholash |

Migratsiya (FAQAT TAKLIF, hozir yozilmaydi), zaxira versiya **`20261130000000`** (oxirgisi repoda `20261124000000`):
1. Data-only: `t2_capability` ga `module.moliya|sotuv|xarid|hr|logistika|hujjat|desktop` (turi `module`, `default_holat='on'` — hech kim yo'qotmasin). Sxema o'zgarmaydi (CHECK `turi` allaqachon `module` ni qabul qiladi).
2. Agar «ilova tartibi/Oddiy–Pro rejimi» saqlash kerak bo'lsa: `t2_kompaniya_sozlama_kalit_check` ga `'ilovalar.ui'` kaliti — **ammo asosiy yoqish holati uchun bu jadval KERAK EMAS** (capability override mavjud, versiya/audit/idempotent). Egasi «afzal `t2_kompaniya_sozlama`» degan edi; bu hujjat tavsiyasi: yoqish holati — modul/override, UI afzalliklari — sozlama.
3. Rollback fayli va `.acceptance.sql` har migratsiya bilan (repo odati). Prodga avval migratsiya, keyin merge (egasi qoidasi).

## H. Xavflar

| # | Xavf | Ta'sir | Chora |
|---|---|---|---|
| 1 | Ilova «xavfsizlik» deb o'ylanishi | O'chiq ilova API orqali yozilishi | Gateway + RPC darajasida tekshiruv (F3); menyu faqat ko'rinish |
| 2 | Outbox hozir bo'sh/bitta iste'molchi | «Atom soati» oqimlari ishlamaydi | 4a faza birinchi; kursor ishlovi monitoring (kechikish metrikasi) |
| 3 | F2/Smeta CONST buzilishi | Tasdiqlangan hujjat o'zgaradi | Oqimlar faqat o'qiydi/yangi qatlam yozadi; F2 lifecycle tegilmaydi, faqat outbox qo'shiladi |
| 4 | Token mijoz tomonidan chaqiriladi | Daromad yo'qotish | Server tomonda kanonik saqlashda tekshirish (audit) |
| 5 | Mavjud kompaniyalar yo'qotish | 2 ta prod kompaniya | Hamma yangi modul `on`; ommaviy o'chirish yo'q |
| 6 | Dublikat marshrutlarni o'chirish | Eski havola/xatcho'p buziladi | `Navigate`, o'chirish emas |
| 7 | Bugun'da shovqin (13 k signal) | Foydalanuvchi e'tiborsiz qoladi | Guruhlash, rol filtri, yuqori chegarali ball, «keyinga» |
| 8 | Rol/capability bo'shliqlari | «Sotuvchi» roli yo'q; PTO da `sales.*` yo'q | Yangi rol — alohida ruxsat PR (broad RLS/rol o'zgarishi — approval gate) |
| 9 | Narx farazlari noto'g'ri | Past konversiya | Faraz deb belgilangan; A/B va 3–5 mijoz intervyusi, narx `t2_tarif` ma'lumotida (kod o'zgarmaydi) |
| 10 | Prod va repo farqi | Prod tarif (299 000) ≠ migratsiya (99 000) | Prod haqiqat; migratsiyadagi tarif `on conflict do nothing`; yangi tarif o'zgarishi alohida data-migratsiya |
| 11 | Komissiya yuridik/soliq | Marketplace to'lovlari | Avval qo'lda hisob-kitob; yuridik ko'rik; to'lov oqimini platforma ushlamaydi |
| 12 | Hujjat qamrovi | Tekshirilmagan yetim `test02/*` komponentlar | P1 da import grafi audit; ishonchsiz joylar «tekshirilmagan» deb qoldirildi |
