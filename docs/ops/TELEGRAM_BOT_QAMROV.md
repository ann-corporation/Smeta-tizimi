# @qur_uz_bot — to'liq bot qamrov matritsasi (yo'l xaritasi)

Maqsad (egasi, 2026-11-19): Mini App'dan tashqari tizimni **100 % botning o'zida** ishlatish. Manba: `src/lib/reestr/sahifa.ts` (`SAHIFALAR`, 81 sahifa).
Bu hujjat **to'g'ri bo'lishi shart**: `src/lib/reestr/telegram-qamrov.test.ts` har sahifa yo'li shu jadvalda borligini tekshiradi (yangi sahifa qo'shilsa — shu yerga ham qator).

Qoidalar (egasi): AI birinchi (yagona Jarvis); «Telegramday» (o'zi ro'yxatdan o'tish, kompaniya/modul tanlash, har kanalda bir xil); «sodda ideal sikl» (bitta kiritish → AI taklifi → bir bosish);
har hujjat/natija token yechadi (qayta yuklash bepul); obyektga oyiga bitta F-2; **preview + «Tasdiqlash» siz hech narsa yozilmaydi**; null ≠ 0; summa doim QQS bilan → ustamali (QQS siz) → ustamasiz.

## 1. Arxitektura (shu PR seriyasi)

| Qatlam | Qaror |
|---|---|
| Menyu | Doimiy reply-klaviatura (rol bo'yicha: ijro rollari — PTO/prorab/…, qo'shimcha «Fakt kiritish»/«F-2» qatori) + inline asosiy menyu `g:m`. Yorliqlar uz/ru/en da bir xil amalga olib boradi. |
| Kontekst | **Server holati yo'q.** «Joriy obyekt» = Telegram chat menyu tugmasidagi `obyekt=<id>` (mavjud `menyuTugmasi`; obyekt kartasi ochilganda yoziladi). Kompaniya — obyektdan. Oy — F-2 ro'yxatida callback bilan (`g:f:<obyekt>:<YYYYMM>`). |
| Yo'l (breadcrumb) | Har xabar sarlavhasi: `Menyu › Obyektlar › #79 Nom › F-2 › 2026-11`; har ekranda «Orqaga» va «Menyu». |
| Sahifalash / qidiruv | `g:o:<sahifa>[:<kompaniya>]`; matn bilan qidiruv — `force_reply` belgisi `[gs:…]`. Ro'yxat 6 tadan; ‹ n/m ›. |
| Chuqur havola | `t.me/qur_uz_bot?start=o_<obyekt>` (karta), `f_`, `y_` (fakt), `h_` (hujjatlar), `t` (tasdiqlar), `n`, `m`. Ulash kodi (≥ 16 belgi) bilan to'qnashmaydi. |
| Yozish | **Yangi yozish yo'li yo'q.** Hammasi mavjud nuqtalar: `/api/f2-buyruq` (preview + imzolangan token → `tasdiq`), `hujjat-aylanish` (`zanjir_qaror`), `hujjat-yarat`. Token xabar oxirida (`#JF:…`), 15 daqiqa, aktorga bog'liq; muddati o'tgan/begona token — yozilmaydi. |
| Ruxsat | Hammasi `botChaqiruv` orqali middleware → shlyuz (veb bilan bir xil ruxsat, hisob, token yechish). Bot o'zi ruxsat yozmaydi. |
| Xatolar | 401/403 «ruxsatingiz yo'q», 402 «tokenlar yetarli emas», 404 «topilmadi yoki ochiq emas», 409/410 «o'zgargan/muddati o'tgan», 429 «juda ko'p so'rov»; ichki matn sizdirilmaydi. |
| Til | `tgT` + `lugat/qism/telegram-toliq-bot.json` (uz/ru/en); `src/i18n/telegram-toliq.test.ts` har kalit tarjimasini tekshiradi. |

Callback grammatikasi (`g:` prefiks, ≤ 64 bayt): `m` menyu · `c` kompaniya · `o:p[:k]` obyektlar · `s[:k]` qidiruv · `k:o` karta · `b:o:p` bo'limlar · `y[:o]` fakt · `r:o:q` fakt qatori ·
`ok`/`no` tasdiq/bekor · `f[:o[:ym]]` F-2 ro'yxat · `a:o:akt` F-2 xulosa · `l:o:akt:q` qator tahriri · `h[:o]` hujjatlar · `d:o:kalit` hujjat so'rovi · `x:o:{x|p}:kalit` yuborish ·
`t:p` tasdiqlar · `rq:id` / `ry:id:belgi` rad · `n:p` bildirishnomalar.

## 2. Yetkazilgan oqimlar (PR 1)

| Oqim | Qanday | Eslatma |
|---|---|---|
| Obyektlar → karta | ro'yxat + qidiruv + kompaniya tanlash; karta: smeta/fakt/F-2 — QQS bilan · ustamali · ustamasiz (`/api/obyekt-tugun-summa`) | null «—»; ustama manbasi yo'q bo'lsa ustamali «—» + izoh |
| Bo'limlar | RZ bo'yicha smeta/fakt/F-2 (ustamasiz), sahifalab | server yadrosi |
| Fakt kiritish | qidiruv so'zi → qator → hajm → preview → Tasdiqlash (`f2-buyruq` `fakt_yoz` → `t2_fakt_yoz_v2`) | delta; minus = kamaytirish; token yechiladi |
| F-2 | oy bo'yicha ro'yxat, akt xulosasi (3 shakl), qoralama qatorini tahrirlash (`f2_qoralama_tahrir`) | muzlagan F-2 tahrirlanmaydi |
| Hujjatlar | `hujjat-yarat` ro'yxati → tasdiq (token ogohlantirishi) → XLSX/PDF Telegram hujjati sifatida | qayta yuklash bepul; **F-2 rasmiy Excel server dvigateli** — `claude/mcp-f2-excel` PR si (TODO: u qo'shilgach `hujjat-yarat` f2 turi avtomatik yangilanadi, bot kodi o'zgarmaydi) |
| Tasdiqlar | kiruvchi quti, Tasdiqlash (mavjud `tq:` oqimi) / Rad (`g:rq` → `g:ry`, qadam belgisi bilan) | PIN/biometrik talab — Mini App ga yo'naltiriladi |
| Bildirishnomalar | ro'yxat, o'qilmagan soni, tasdiq tugmasi | «o'qildi» belgilash — PR 2 (2b) |

## 2b. Yetkazilgan oqimlar (PR 2: `telegram-toliq-qoshimcha.ts`)

Yangi yozish yo'li yo'q; har yozish — so'rov ekrani + tasdiq tugmasi (versiya callback da, `operation_id` deterministik → takroriy bosish takror yozmaydi). Erkin matn (rad sababi, xat javobi) — bot xabari oxiridagi belgi (`#SB:` / `#TX:`).

| Oqim | Qanday | Eslatma |
|---|---|---|
| Fakt jurnali | obyekt kartasi → «Fakt jurnali»: oy (‹ ›), 5 tadan sahifa, yozuv tafsiloti (`f2-buyruq` `fakt_jurnal`, o'qish) | qator nomi `sb`; summa QQS siz |
| F-2 lifecycle | akt xulosasida holatga mos tugma: yuborish → tekshirildi → tasdiqlash, «tekshirilgan» da **rad (sabab majburiy)**; `sb-yoz` `akt_lifecycle_transition_v1` | ruxsat/SoD/versiya serverda; PIN/biometrik (STEP_UP) → Mini App; bekor/tuzatish — Mini App |
| Bildirishnoma «o'qildi» | har o'qilmagan qatorga tugma + «Hammasi o'qildi» (`hujjat-aylanish` `bildirishnoma_oqildi`) | ro'yxat yangilanadi |
| Tokenlar | balans, obuna, oxirgi 5 sarf (`sb` `token_holat_v1`); ish joyi tanlash | to'ldirish — Mini App havolasi |
| Xat / murojaat | kiruvchi xatlar (kechikkan belgisi), ochish, «Qabul qildim», javob xati (`xat_qabul` / `xat_yubor`) | murojaatlar — faqat soni + Mini App |
| Topshiriqlar | menga / men bergan, ochish, holat o'zgartirish (`/api/topshiriq` `otish`), rad — sabab bilan | jadval `src/api/t2-topshiriq` bilan bir xil (test) |

Callback: `j:o:ym:p` jurnal · `jd:o:yozuv:ym:p` · `lq:o:akt:k` / `lo:o:akt:k:ver` lifecycle · `nr:id:p` / `na:p` · `tk[:k]` · `q:p` / `qo:k:id` / `qa` / `qk` / `qj` / `qy` xat · `z:y:p` / `zo:k:id:y` / `zs:k:id:y:h` / `zk:k:id:y:h:ver` topshiriq. Chuqur havola: `j_<obyekt>`, `x`, `z`, `k`.

**TODO (boshqa agent): «Hujjatlar paketi» adapteri.** Universal paket endpointi `claude/hujjat-paket-universal` branchida quriladi. U `main` ga tushgach `telegram-toliq-hujjat.ts` dagi `hujjatlarRoyxati` ga «Paket yuborish» tugmasi qo'shiladi (`hujjat-yarat`/yangi endpoint → bitta tanlov → Telegram hujjati; token ogohlantirishi va tasdiq shu yerdagi `g:d`/`g:x` naqshida). Bot hozir paket endpointiga **bog'lanmagan**.

**Ro'yxatdan o'tish (o'zi register) — amalga oshirilmagan**: egasi qarori kutilmoqda (ADR — PR #678).

## 3. Matritsa

Belgilar: ✅ to'liq · qisman · ❌ yo'q · — ilovasiz. «Hozir → Keyin» = botdagi umumiy holat (shu PR gacha → shu PR dan keyin).
Ustunlar: **O'** o'qish · **Y** yozish · **H** hujjat/fayl · **B** bildirishnoma.

| Sahifa | O' | Y | H | B | Hozir → Keyin | Rejalashtirilgan bot UX |
|---|---|---|---|---|---|---|
| /admin/pult | qisman | — | — | ❌ | qisman → qisman | direktor pulti: «Bugun» + pul oqimi kartasi (PR 3) |
| /admin/dashboard | qisman | — | — | — | qisman → qisman | «Bugun» bilan birlashadi |
| /admin/obyektlar | ✅ | ❌ | ✅ | — | qisman → qisman | obyekt yaratish/tahrir — AI orqali (PR 3) |
| /admin/loyiha | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | loyiha kartasi (PR 4) |
| /admin/participants | ❌ | ❌ | — | ❌ | ❌ → ❌ | ishtirokchilar ro'yxati + taklif (`/taklif` bor) (PR 4) |
| /admin/mindmap | ❌ | ❌ | — | — | ❌ → ❌ | botda yo'q: Mini App havolasi (xarita) |
| /admin/grafik | ❌ | ❌ | ❌ | — | ❌ → ❌ | haftalik grafik kartasi (PR 4) |
| /admin/smeta-studio | ❌ | ❌ | ❌ | — | ❌ → ❌ | Jarvis orqali smeta so'rovi (Codex PR-4 konteksti) |
| /admin/holat | ❌ | — | — | — | ❌ → qisman | karta + bo'limlar summalari (shu PR); LRV tafsiloti keyin |
| /admin/loyiha-smeta | ❌ | ❌ | — | — | ❌ → ❌ | Jarvis orqali (PR 4) |
| /admin/smeta-narxlash | ❌ | ❌ | — | — | ❌ → ❌ | «narx tuzat» Jarvis vositasi + preview (PR 4) |
| /admin/narx-dalil | ❌ | ❌ | ❌ | — | ❌ → ❌ | hujjat sifatida (PR 5) |
| /admin/narx-tekshiruv | ❌ | ❌ | — | — | ❌ → ❌ | PR 4 |
| /admin/nakrutka | ❌ | ❌ | — | — | ❌ → ❌ | ustama foizlari kartasi, o'qish (PR 4) |
| /admin/narxlar | ❌ | ❌ | — | ❌ | ❌ → ❌ | narx signali bildirishnomasi (PR 5) |
| /admin/narx-manbalari | ❌ | ❌ | — | — | ❌ → ❌ | PR 5 |
| /admin/oferta | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | tender oferta holati (PR 6) |
| /admin/fakt | ✅ | ✅ | — | — | qisman → ✅ | kiritish (PR 1) + fakt jurnali: oy/sahifa/tafsilot (PR 2) |
| /admin/naryad | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | brigada topshirig'i: prorab uchun ro'yxat + «bajarildi» (PR 3) |
| /admin/foto | ✅ | ✅ | — | — | qisman → qisman | foto-dalil ro'yxati (o'qish) (PR 2) |
| /admin/m29 | ❌ | ❌ | ✅ | — | ❌ → qisman | hujjat shu PR da (`hujjat-yarat` m29); kiritish PR 3 |
| /admin/f2-tayyorlash | ❌ | ❌ | ❌ | — | ❌ → ❌ | AI F-2 tayyorlash: Jarvis + preview (Codex PR-6 bilan) |
| /admin/f2 | ❌ | ❌ | — | — | ❌ → ❌ | F-2 Excel faylini botga tashlash → import preview (PR 3) |
| /admin/f2-tarix | ✅ | qisman | ✅ | ✅ | qisman → qisman | lifecycle: yuborish/tekshirildi/tasdiqlash/rad (PR 2); bekor va tuzatish — Mini App |
| /admin/f2-reestr | ✅ | — | ✅ | — | qisman → qisman | reestr bo'yicha oylar kesimi (PR 2) |
| /admin/nakopitelniy | ❌ | ❌ | ✅ | — | ❌ → qisman | hujjat shu PR da; jadval ko'rinishi PR 2 |
| /admin/solishtiruv | ❌ | — | ❌ | — | ❌ → ❌ | PR 4 |
| /admin/moliya | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | to'lov so'rovi tasdig'i (PR 3) |
| /admin/shartnoma-liniya | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | shartnoma kartasi (PR 4) |
| /admin/qarzdorlik | ❌ | — | ❌ | ❌ | ❌ → ❌ | qarz eslatmasi (PR 4) |
| /admin/buxgalteriya | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | provodka jurnali o'qish (PR 5) |
| /admin/kontragentlar | ❌ | ❌ | — | — | ❌ → ❌ | qidiruv (PR 5) |
| /admin/yetkazuvchi | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | yetkazuvchi kabineti (PR 6) |
| /admin/subpudratchi | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | subpudratchi kabineti (PR 6) |
| /admin/subpudrat | ❌ | ❌ | ❌ | — | ❌ → ❌ | PR 6 |
| /admin/documents | qisman | qisman | qisman | — | qisman → qisman | Disk: Telegram fayli → papka bor; ko'rish/yuborish — **Codex PR-5** |
| /admin/hujjat-nazorat | ❌ | — | ❌ | ❌ | ❌ → ❌ | PR 5 |
| /admin/aosr | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | AOSR: egasi bilan kelishgach (PR 6) |
| /admin/nazorat | ❌ | ❌ | — | ❌ | ❌ → ❌ | texnadzor: tekshiruv + foto (PR 6) |
| /admin/nazorat/tekshiruv | ❌ | ❌ | — | — | ❌ → ❌ | PR 6 |
| /admin/nazorat/jurnal | ❌ | — | — | — | ❌ → ❌ | PR 6 |
| /admin/zakazchik | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | buyurtmachi kabineti (PR 6) |
| /admin/taqdimlar | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | PR 6 |
| /admin/murojaatlar | qisman | ❌ | — | ❌ | ❌ → qisman | kiruvchi xatlar + soni (PR 2); murojaatga javob — Mini App |
| /admin/chizmalar | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | chizma revizyasi bildirishnomasi bor; ko'rish PR 6 |
| /admin/loyihachi | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | PR 6 |
| /admin/laboratoriya | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | PR 6 |
| /admin/hujjat-aylanish | qisman | ✅ | ❌ | ✅ | qisman → qisman | tasdiq/rad (PR 1); xat ochish/qabul/javob (PR 2) |
| /admin/logistika | qisman | qisman | qisman | — | qisman → qisman | ombor ovoz/hisobot bor; to'liq — **Codex PR-3 (ombor) + PR-6** |
| /admin/zayavka | ❌ | ❌ | — | ❌ | ❌ → ❌ | zayavka yaratish: bitta kiritish → AI → bir bosish (PR 3) |
| /admin/tender | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | PR 6 |
| /admin/yuk-birjasi | ❌ | ❌ | — | ❌ | ❌ → ❌ | Telegram-first haydovchi oqimi (alohida ADR) |
| /admin/bozor-sorov | ❌ | ❌ | — | ❌ | ❌ → ❌ | PR 6 |
| /admin/bozor-kabinet | ❌ | ❌ | — | ❌ | ❌ → ❌ | PR 6 |
| /admin/bozor-moderatsiya | ❌ | ❌ | — | — | ❌ → ❌ | faqat Mini App |
| /admin/tender-ochiq | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | PR 6 |
| /admin/yuk-chaqirish | ❌ | ❌ | — | ❌ | ❌ → ❌ | «taksi» modeli (alohida ADR) |
| /admin/haydovchi | ❌ | ❌ | — | ❌ | ❌ → ❌ | haydovchi rejimi — bot asosiy kanal (alohida ADR) |
| /admin/erp | ❌ | ❌ | — | — | ❌ → ❌ | PR 6 |
| /admin/hr | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | PR 6 |
| /admin/sotuv | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | cloud mahsulot (alohida) |
| /admin/kompaniya | qisman | qisman | — | — | qisman → qisman | a'zolar ro'yxati, taklif (`/taklif` bor), modul holati (PR 3) |
| /admin/system-control | ❌ | ❌ | — | ❌ | ❌ → ❌ | faqat superadmin: audit signali (PR 6) |
| /admin/tizim-sozlama | ❌ | ❌ | — | — | ❌ → ❌ | Mini App |
| /admin/hujjat-dizayn | ❌ | ❌ | ❌ | — | ❌ → ❌ | Mini App |
| /admin/tokenlar | ✅ | ❌ | — | ❌ | ❌ → qisman | balans + oxirgi sarflar (PR 2); to'ldirish — Mini App havolasi |
| /admin/ai-agentlar | ❌ | ❌ | — | — | ❌ → ❌ | Jarvis orqali |
| /admin/korzinka | ❌ | ❌ | — | — | ❌ → ❌ | PR 6 |
| /admin/ish-joylarim | ❌ | ❌ | — | — | ❌ → qisman | kompaniya tanlash (shu PR); yangi kompaniya/ro'yxatdan o'tish — PR 2 |
| /admin/kurs | ❌ | ❌ | — | — | ❌ → ❌ | rolga mos kurs qadamlari (PR 6) |
| /admin/topshiriqlar | ✅ | ✅ | — | ✅ | qisman → ✅ | menga/men bergan ro'yxat + holat o'zgartirish tasdiq bilan (PR 2) |
| /admin/mutaxassis | ❌ | ❌ | — | ❌ | ❌ → ❌ | PR 6 |
| /admin/osuvchi | ❌ | ❌ | — | — | ❌ → ❌ | PR 6 |
| /admin/akkaunt | qisman | qisman | — | qisman | qisman → qisman | `/men`, `/username`, `/kunlik`, `/chiqish` bor; ro'yxatdan o'tish botda — PR 2 |
| /admin/imzo | ❌ | ❌ | ❌ | ❌ | ❌ → ❌ | imzo faqat Mini App (PIN/biometrik) |
| /admin/sozlamalar | qisman | qisman | — | qisman | qisman → qisman | bildirishnoma turlari tugmalari (PR 2) |
| /admin/bugun | ✅ | — | — | ✅ | ✅ → ✅ | `/bugun` + kunlik xulosa bor |
| /admin/ruxsatlar-jadvali | ❌ | ❌ | — | — | ❌ → ❌ | Mini App |
| /admin/boshqaruv | ❌ | ❌ | — | — | ❌ → ❌ | faqat superadmin (PR 6) |
| /admin/tizim-xaritasi | ❌ | — | — | — | ❌ → ❌ | `/menyu` o'rnini bosadi |
| /admin/fayl-boglash | ❌ | ❌ | — | — | ❌ → ❌ | texnik; botga kerak emas |

## 4. Hisob (sahifa darajasida, 81 sahifa)

| | ✅ | qisman | ❌ |
|---|---|---|---|
| PR 1 gacha | 1 | 14 | 66 |
| PR 1 dan keyin | 1 | 18 | 62 |
| PR 2 dan keyin | 3 | 18 | 60 |

PR 2: `/admin/fakt` va `/admin/topshiriqlar` qisman→✅; `/admin/murojaatlar` va `/admin/tokenlar` ❌→qisman (murojaat javobi/to'ldirish — Mini App havolasi).

Sahifa darajasidagi o'sish kichik, chunki shu PR **yadro oqimlarni** (menyu, kontekst, karta, fakt, F-2, hujjat, tasdiq) quradi — ular PR 2–6 dagi ko'p sahifalarning umumiy asosi. Qamrov ko'rsatkichi sifatida yadro oqimlar:
karta ❌→✅, fakt kiritish (preview→Tasdiqlash) qisman→✅, F-2 ro'yxat/xulosa/tahrir ❌→✅ (lifecycle ❌), hujjat fayli ❌→✅, tasdiq+rad qisman→✅, bildirishnoma ro'yxati ❌→✅.

## 5. Bog'liqliklar

- **Codex**: `src/lib/jarvis/**`, `functions/_shared/jarvis/**` tegilmagan, faqat iste'mol qilingan (`f2-buyruq` vositalari, `f2-javob` turlari, `f2-mcp-liniya` xato matnlari). PR-3 ombor, PR-4 navigation/context (joriy obyektni Jarvis bilan bo'lishish — hozir faqat chat menyu tugmasida), PR-5 Disk, PR-6 parity (bot ↔ Android/Windows bir xil menyu).
- **`claude/mcp-f2-excel`**: rasmiy F-2 Excel server dvigateli. Shu PR gacha bot `hujjat-yarat` mavjud turlarini beradi; merge qilingach f2 hujjati o'sha dvigateldan avtomatik chiqadi.
- **Migratsiya talab qilinmagan.** Kontekst serverda saqlanmaydi (chat menyu tugmasi + callback). Bot ichida o'zi ro'yxatdan o'tish (kontakt → hisob/kompaniya yaratish) yangi RPC talab qiladi — PR 2 da ADR + migratsiya (egasi ruxsati bilan).

## 6. Keyingi PR rejasi

1. **PR 2** — o'qish: fakt jurnali, foto-dalil ro'yxati, F-2 lifecycle («tasdiqqa yuborish»), kiruvchi xat/murojaat, topshiriqlar «bajarildi», bildirishnoma «o'qildi», token balansi, bot ichida ro'yxatdan o'tish + kompaniya yaratish/tanlash (ADR).
2. **PR 3** — yozish: zayavka/ombor (Codex PR-3 bilan), naryad, obyekt yaratish, to'lov tasdig'i, F-2 Excel faylini botga tashlab import preview, bir-kiritish → AI taklifi → bir bosish.
3. **PR 4** — loyiha/smeta/shartnoma kartalari, nakrutka, solishtiruv, grafik.
4. **PR 5** — buxgalteriya o'qish, kontragent, hujjat nazorati, narx manbalari, Disk (Codex PR-5).
5. **PR 6** — tashqi tomonlar (buyurtmachi, texnadzor, laboratoriya, yetkazuvchi, subpudratchi), kadrlar, kurs; yuk birjasi/haydovchi — alohida ADR.
