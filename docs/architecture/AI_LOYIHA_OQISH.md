# ADR — AI loyiha o'qish (Ish kartasi, 2-bosqich)

- **Holat:** Taklif. Prototip kodi bor, feature flag bilan, standart holatda **o'chiq**.
- **Sana:** 2026-11-05
- **Bog'liq:** 1-bosqich — Ish kartasi + narx tekshiruvi (`claude/ish-kartasi-narx-tekshiruv`, migratsiya `20261203000600_t2_ish_kartasi_v1`). AI platformasi: `T2_AI_TIZIM_V2.md`, `T2_AGENT_PLATFORM_V1.md`. Fayl haqiqati: `FILE_TRUTH_AND_SECONDARY_REPLICA_V1.md`.
- **Kod:** `frontend/src/lib/ai-loyiha/`, `frontend/functions/api/ai-loyiha.ts`.

## 1. Muammo

PTO ish kartasi va hajmlarni loyiha chizmalaridan (КЖ, АС/КМ, АР varaqlari) qo'lda yig'adi: plandagi uzunlik, tayanch qadami, element kesimlari, spetsifikatsiya jadvallari. Maqsad — AI varaqni **o'qiydi**, tizim raqamni **qayta hisoblaydi va solishtiradi**, inson tasdiqlaydi. Shundan keyin ish kartasi va hajmlar o'zi to'ladi.

Real keysda (egasi yuborgan to'siq chizmalari; repoga kirmaydi) uchta narsa aniq bo'ldi:

1. Varaqni rasm sifatida vision model bilan o'qish ishlaydi. Spetsifikatsiya jadvallari va o'lchamlar to'g'ri ko'chiriladi.
2. PDF matn qatlami har doim ham ishonchli emas. Ba'zi fayllarda kirill CID shrift bilan buziladi. Shuning uchun asosiy manba rasm, matn esa faqat yordamchi.
3. **Spetsifikatsiyani ko'chirish yetarli emas.** «Bir oraliq uchun» jadvalda oraliqning ikki uchidagi ustun yoki stakan sanaladi. Ular qo'shni oraliq bilan umumiy. Oddiy `oraliq qiymati × oraliqlar` hisobi tayanchlarni **ikki marta** sanaydi. Tizim umumiy elementlar haqida mulohaza qilishi shart.

## 2. Qaror — pipeline

```
PDF yuklash ─► (brauzer) pdf.js: sahifa → JPEG 2048 px + matn qatlami + sha256
            ─► /api/ai-loyiha (1 so'rov = 1 sahifa)
                 auth (fail-closed) → kompaniya (sessiyadan) → kesh (R2, fayl+sahifa+rasm xeshi)
                 → aiHisobli(vision model, strict JSON schema) → validator → sahifa kesishmasi
            ─► (brauzer) hamma sahifalar: kesishmaTekshir → tekshiruvlar + formula + ishonch
            ─► Ko'rib chiqish UI (varaq rasmi + element + dalil + formula + ogohlantirish)
            ─► Tasdiq → ish kartasi (manba='ai_loyiha') va hajmlar
```

### 2.1 Yuklash va saqlash
- Fayl mavjud kanonik yo'l orqali yuklanadi: `/api/hujjat-yukla` → `R2_CANONICAL`, sha256 va kompaniya bilan. Yangi saqlash yo'li ochilmaydi.
- AI keshi o'sha private bucket'da turadi: `ai-loyiha-kesh/k{kompaniya_id}/{fayl_sha256}/s{sahifa}.{varaq_turi}.{versiya}.json`. Kalit kompaniya bilan boshlanadi, shuning uchun boshqa kompaniya bu keshni o'qiy olmaydi.

### 2.2 Rendering — brauzerda (pdf.js)
- Cloudflare Workers'da canvas yo'q. CPU va xotira chegarasi ham bor: ko'p A1 varaqni serverda chizish chegaraga uriladi. Shuning uchun rendering **klientda** bo'ladi. `pdfjs-dist` allaqachon `pdf-parse` orqali o'rnatilgan edi; endi u xuddi shu versiyada (5.4.296) to'g'ridan-to'g'ri bog'liqlik.
- `pdf-sahifa.ts` dinamik import bilan yuklanadi, asosiy bundle'ga tushmaydi. Natija: uzun tomoni 2048 px bo'lgan JPEG (0,88). Vision modellar bundan kattasini baribir kichraytiradi, 1:100 varaqdagi raqamlar esa o'qiladi.
- Matn qatlami `getTextContent` bilan olinadi. `matnQatlamiBuzuqmi()` mojibake yoki kirill yo'qligini aniqlaydi. Buzilgan matn promptga **yuborilmaydi**.

### 2.3 Vision model
- Model `AI_LOYIHA_MODEL` env'dan olinadi. Standart qiymat `google/gemini-2.5-flash` (OpenRouter katalogida `vision=true`). Profil modeli vision bo'lmasligi mumkin, shuning uchun endpoint aniq modelni `req.model` orqali beradi. Admin katalogidagi `vision` bayrog'i go-live'da tekshiriladi (§6).
- Javob strict JSON Schema bo'yicha olinadi (`AI_LOYIHA_JSON_SCHEMA`), `temperature: 0`.
- Prompt modelni **o'qishga** majbur qiladi, hisoblashga emas. Qoidalar:
  - noma'lum qiymat `null` bo'ladi, hech qachon 0 emas;
  - mm metrga aylantiriladi;
  - oraliq jadvali qanday yozilgan bo'lsa, shunday ko'chiriladi;
  - jamlash ham, ko'paytirish ham qilinmaydi;
  - umumiy tayanch haqida izoh yoziladi.

### 2.4 Element sxemasi (`sxema.ts`)
Har element quyidagi maydonlarga ega:

| Maydon | Mazmuni |
|---|---|
| `marka`, `tur`, `nom` | marka, element turi, nomi |
| `kesim` | chizmadagi yozuv, masalan «□80×80×4» |
| `olcham_m`, `uzunlik_m` | o'lchamlar va uzunlik, metrda |
| `soni`, `miqdor`, `birlik` | soni, miqdori va birligi: m, m2, m3, kg, t, dona |
| `birlik_massa_kg` | bitta dona massasi |
| `doira` | `jami`, `bir_oraliq` yoki `bir_dona` |
| `tayanchga_tegishli` | ustun va uning stakani, ЗД, анкер, КП |
| `ota_marka` | yig'ma birlik tarkibi: С-4 sterjenlari, ЗД-3 detallari |
| `manba` | varaq, sahifa, pozitsiya, `jadvaldan` |
| `ishonch` | 0..1 |
| `izoh` | dalil uchun izoh |

Varaq darajasida: shtamp (`shifr`, `turi`) va `parametrlar` — umumiy uzunlik, tayanch qadami, yozilgan seksiyalar soni, yopiq yoki ochiq kontur, balandlik belgilari.

### 2.5 Validator (`validator.ts`, fail-closed)
- JSON bo'lmagan, `elementlar` siz yoki 200 dan ortiq elementli javob — xato (422).
- «0,6» va «2 400» kabi sonlar o'qiladi. Manfiy yoki NaN qiymat `null` bo'ladi, 0 emas.
- Birlik taxalluslari kanonik birlikka keltiriladi (п.м → m, шт → dona). Keltirilmasa — `null` + ogohlantirish.
- Element varaq ko'rsatmasa, sahifa shtampidagi shifr olinadi.
- Id `{fayl_sha[0..8]}:s{sahifa}-e{n}` ko'rinishida. Bir nechta PDF birga tekshirilganda ham noyob qoladi.

### 2.6 Kesishma tekshiruvi (`kesishma.ts`, deterministik)

| Kod | Qoida |
|---|---|
| `UZUNLIK_QADAM` / `…KARRALI_EMAS` | oraliqlar = L / qadam; tayanchlar: yopiq kontur → n, ochiq → n+1, noma'lum → ikkalasi |
| `ORALIQ_SONI_MOS` | varaqda yozilgan seksiyalar soni ↔ L / qadam (ikki varaq bir-birini tasdiqlaydi) |
| `PARAMETR_ZIDDIYAT` | varaqlar bir parametrda kelishmaydi → xato, hisob to'xtaydi |
| `TAYANCH_SONI` | «jami» ustun/stakan soni ↔ geometriya |
| **`IKKI_MARTA_SANALGAN`** | oraliq jadvalida S ta tayanch sanalgan → bitta tayanchga = qiymat / S; jami = shu × tayanchlar. ЗД yoki КП tarkibi ham shu qoidaga tushadi |
| `TAYANCH_KASR` | dona soni tayanchlarga butun bo'linmaydi → umumiy emas, oraliq detali |
| `TAYANCH_MOSLIGI` | ustunlar soni = stakanlar soni |
| `LENTA_ORALIQ` / `LENTA_STAKAN_AYIRILMAGAN` | stakanlar orasidagi lenta = qadam − stakan eni |
| `PROFIL_MASSA` | □a×b×t profil massasi ↔ 7850·A·L (±8 %; GOST radiusi hisobdan 3–5 % yengil) |
| `HAJM_OLCHAM` | m3 = o'lchamlar ko'paytmasi × soni |
| `BIRLIK_YOQ` / `BIRLIK_TURGA_MOS_EMAS` | birliksiz miqdor yoki turga mos kelmagan birlik |
| `OTA_TOPILMADI` | yig'ma birlik varaqda yo'q yoki uning soni o'qilmagan → tarkib hisoblanmaydi (0 emas) |
| `ISHONCH_PAST`, `MANBA_YOQ` | himoyalab bo'lmaydigan raqam |

Har element uchun `jami_soni`, `jami_miqdor` va **formula** chiqadi, masalan «2 / 2 × 301 = 301». Xato topilsa ishonch ≤ 0,3 ga, ogohlantirish topilsa ≤ 0,6 ga tushiriladi.

Sarlavha qatori «Ограждение ОГ-5 — N шт» bo'lsa va N = oraliqlar bo'lsa, uning tarkibi **bitta oraliq** uchun hisoblanadi.

### 2.7 Ko'rib chiqish UI (keyingi PR)
- Chap tomonda varaq rasmi turadi. Element tanlanganda shu sahifa va pozitsiya ko'rsatiladi; model bbox bermaydi, shuning uchun hozircha dalil varaq shifri + pozitsiya + jadval qatori.
- Har qatorda: o'qilgan qiymat (AI), tizim formulasi va jami qiymati, ishonch belgisi va tekshiruv xabarlari (`xabar.ts`, 4 til). Ishonch belgisi: yashil ≥ 0,8, sariq ≥ 0,6, qizil < 0,6.
- `tasdiq_kerak` qatorlarni (xato, ogohlantirish, past ishonch yoki hajm `null`) inson tasdiqlamaguncha saqlab bo'lmaydi. Tuzatilgan raqam taklif sifatida turadi, asl o'qilgan raqam esa yonida ko'rinadi. Shu tarzda egasi raqamni himoya qila oladi.

### 2.8 Ish kartasiga yozish
- `ishKartasiTakliflari()` har element uchun taklif tayyorlaydi: `{ manba: 'ai_loyiha', nom, marka, birlik, hajm, formula, dalil: {sahifa, varaq, pozitsiya, jadvaldan}, ishonch, tasdiq_kerak }`.
- Yozish faqat 1-bosqichning nomli RPC'si orqali bo'ladi (`t2_ish_kartasi_v1`). Tasdiq bo'lishi, operation_id va actor sessiyadan olinishi shart. Bu PR bazaga **hech narsa yozmaydi**.
- 1-bosqich sxemasida `manba` ustuni va dalil (`jsonb`) maydoni bo'lishi kerak. Agar ular bo'lmasa, `20261203000700_*` migratsiyasi kerak bo'ladi; hozircha u yozilmagan.

## 3. Narx va hisob (aiHisobli)
- Har model chaqiruvi `aiHisobli(env, actor, kompaniya, 'document_control', 'loyiha_oqish', …)` orqali o'tadi:
  - avval limit tekshiriladi (`t2_agent_sarf_tekshir_v1`): limit yo'q bo'lsa, AI chaqirilmaydi va 402 qaytadi;
  - keyin haqiqiy usage `t2_agent_sarf_yoz_v1` bilan yoziladi; u ustama va token yechishni ham bajaradi;
  - yangi narx formulasi yozilmaydi.
- Natija sxemaga mos kelmasa (422), model baribir ishlagan va pul to'langan — sarf yoziladi («Har ish pul ishlasin» qoidasi).
- **Kesh:** fayl, sahifa, rasm xeshi va versiya bir xil bo'lsa, model chaqirilmaydi va token yechilmaydi. Rasm xeshi mos kelmasa (boshqa brauzer boshqacha chizgan bo'lsa), sahifa qayta o'qiladi. Bu qasddan: kesh hech qachon boshqa rasmning natijasini bermaydi.
- **Bir sahifa narxi** (lokal o'lchov, gemini-2.5-flash, 2048 px): ~2–3 ming kirish va ~1,5–3,5 ming chiqish tokeni, ≈ **$0,004–0,010**, 7–15 s. Bunga mijoz ustamasi qo'shiladi (`_t2_agent_ustama_v1`). Zich A1 varaqda chiqish oshadi. `finish_reason=length` bo'lsa, 422 `KESILDI` qaytadi va varaqni bo'laklab yuborish kerak bo'ladi.

## 4. Xavfsizlik va maxfiylik
- `AI_LOYIHA_YOQILGAN !== '1'` bo'lsa, endpoint 404 qaytaradi, sessiya ham tekshirilmaydi. Klientda `VITE_AI_LOYIHA=1` ham kerak.
- Sessiya majburiy (401). Kompaniya `sessiyaKompaniya` orqali aniqlanadi: begona kompaniya — 403. `SCOPED_APIS` va middleware `document.read` + `company.read` ni tekshiradi. Aniq deny bo'lsa, AI orqali aylanib o'tib bo'lmaydi (`SCOPED_AI_REQUIRED`).
- Kirish tekshiruvlari:
  - faqat rasm qabul qilinadi (jpeg/png/webp), ≤ 6 MB;
  - server rasm sha256 ini qayta hisoblaydi va klient xeshi bilan solishtiradi;
  - sahifa raqami 1..500;
  - versiya mos kelmasa 409 (eski klient).
- Fayl va natija faqat private `R2_CANONICAL` da, kompaniya prefiksi bilan saqlanadi. Prompt, fayl va matn log'ga yozilmaydi: `AI_USAGE` faqat token va narxni yozadi.
- Repo PUBLIC: real chizmalar, ularning raqamlari va nomlari testlarga ham, hujjatga ham kirmaydi. Testlar sintetik.

## 5. Xato rejimlari va UI javobi

| Holat | Nima bo'ladi |
|---|---|
| Matn qatlami buzilgan | promptga yuborilmaydi, rasm o'qiladi |
| Model jami uzunlik o'rniga bitta oraliqni yoki panjara qadamini («Шаг 100») oladi | `PARAMETR_ZIDDIYAT` / `ORALIQ_SONI_MOS` xatosi; prompt bularni aniq ajratadi |
| Oraliq jadvali har oraliqqa 2 tayanch sanaydi | `IKKI_MARTA_SANALGAN`: tuzatilgan son va formula taklif qilinadi, tasdiq shart |
| Yig'ma birlik tarkibi (С-4 sterjenlari) oraliqqa to'g'ridan-to'g'ri ko'paytiriladi | `ota_marka` × ota soni; ota topilmasa `OTA_TOPILMADI`, natija `null` |
| Raqam noaniq yoki skan xira | `ISHONCH_PAST`; varaq rasmi yonida ko'rsatiladi |
| Birlik yo'q yoki g'alati | `BIRLIK_YOQ` / `BIRLIK_TURGA_MOS_EMAS` |
| Varaq juda zich, javob kesildi | 422 `KESILDI` → keyingi bosqichda varaq bo'laklarga bo'linadi (jadval zonasi alohida) |
| Byudjet yoki token yo'q | 402 + tushunarli xabar, model chaqirilmaydi |
| Provayder ishlamayapti | 502, umumiy xabar |

## 6. Go-live uchun kerak
1. Ko'rib chiqish UI va ish kartasiga yozish (1-bosqich RPC'si birlashgach). Sahifa joyi — mavjud Ish kartasi sahifasi; yangi dublikat sahifa yaratilmaydi.
2. Model tanlovini AI markazi katalogi bilan bog'lash: profil modeli `vision=true` bo'lsa o'sha, aks holda `AI_LOYIHA_MODEL`. 3–5 real varaqda Gemini 2.5 Flash va Pro (yoki Claude Sonnet) ni solishtirish.
3. Zich varaqlar uchun bo'laklash (spetsifikatsiya zonasini alohida, yuqori aniqlikda yuborish).
4. Prod env: `AI_LOYIHA_YOQILGAN=1`, `VITE_AI_LOYIHA=1`. Avval bitta kompaniyada beta.
5. `yangiliklar.json` yozuvi — faqat flag foydalanuvchiga yoqilganda.
6. Kesh tozalash siyosati (R2 lifecycle, masalan 180 kun).
