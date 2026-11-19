# Yagona dizayn: komponentlar spetsifikatsiyasi

Egasi (2026-11-19): «Dizayn va stil platformalararo bir xil bo'lishi kerak.» Sayt (React + Tailwind + `fz-*`), Android va Windows (Compose, `android-native/ui-common`), Telegram bot — bitta manbadan.

## 1. Manba va generatsiya

| Narsa | Joyi |
|---|---|
| Yagona manba | `design/tokens.json` (rang tun/ganch, tipografiya, oraliq, radius, balandlik, holat ranglari/yorliqlari, navigatsiya, ikonka nomlari, raqam qoidalari) |
| Raqam namunalari | `design/fixtures/format.json` (TS va Kotlin testlari bir xil faylni o'qiydi) |
| Generator | `node scripts/gen-design-tokens.mjs` (yozadi) / `--check` (CI, eskirgan bo'lsa 1) |
| Sayt CSS | `frontend/src/dizayn/tokens.generated.css` — `main.tsx` da `firuza.css` dan OLDIN; `firuza.css` faqat sayt-ichki qatlam (veil, scrim, Tailwind alias, `fz-*`) |
| Sayt TS | `frontend/src/dizayn/tokens.generated.ts` |
| Kotlin | `android-native/ui-common/.../smeta/core/ui/DesignTokens.kt`; `QuraiTokens` va `QTheme` shundan oladi |
| Raqam formati | TS `frontend/src/lib/format-yagona.ts` ↔ Kotlin `shared/.../core/data/Format.kt` |

Qoida: yangi rang/o'lcham/yorliq — avval `tokens.json`, so'ng generator. Qo'lda `#hex`, `bg-[#..]`, `Color(0x..)`, `13.sp` yozilmaydi (tokenlar `--fs-*`, `DesignTokens.BODY`).

## 2. Tokenlar qisqacha

- Mavzu: Tun (asosiy, `:root`) va Ganch (`data-mavzu="ganch"`; Compose: `QuraiTheme(dark=false)`). Semantika: `bg, surface, surface-2, surface-3, border, border-strong, text, text-dim, text-mute, accent, accent-text, on-accent, ok, warn, danger, info` + `*-soft` to'ldirmalar, `kat-chel/mash/mat/ob` (ресурс toifalari).
- Tipografiya (px/line): sahifa sarlavhasi 19/24 · karta sarlavhasi 15/22 · matn va jadval 13/18 · yorliq 12/16 · chip 11/16. Shrift: IBM Plex Sans / Mono.
- Oraliq 4·8·12·16·20·24·32; radius 3·6·8·12; boshqaruv balandligi 28/32/40 (telefonda 44–48 touch); jadval qatori 32/40; keng maket ≥ 840 (sidebar + jadval), tor — pastki navigatsiya + ro'yxat.
- Ikonkalar: **lucide**; sayt `lucide-react` nomi = Compose `QIcons.<shu nom>` (generatsiya `tools/gen-lucide.cjs`). Yangi ikonka — ikkala tomonga bir xil nom bilan.

## 3. Raqam va summa

- «1 234 567,89»: guruh ajratgich NBSP, kasr vergul, pul 2 kasr, hajm ≤ 3 kasr (ortiqcha nol yo'q), foiz 1 kasr («12,3%»).
- Noma'lum (`null`/NaN) — «—», hech qachon 0. Nol — «0,00».
- Manfiy — `-` (jadval hisobotida qavs ruxsat: `FmtN`), qizil `danger`.
- Narx doim QQS siz. **Summa uchligi** har joyda shu tartibda: **QQS bilan** (birinchi, asosiy) → **Ustamali (QQS siz)** → **Ustamasiz (QQS siz)**.

## 4. Holat belgilari (status badge)

Ton: `neutral · ok · warn · danger · info · accent · frozen`. Matn va ton — `tokens.json > status`.

| F-2 holati | Yorliq | Ton |
|---|---|---|
| draft | Qoralama | neutral |
| submitted | Tekshirishga yuborilgan | warn |
| checked | Tekshirilgan | warn |
| approved | Tasdiqlangan | ok |
| rejected | Rad etilgan | danger |
| cancelled | Bekor qilingan | danger |
| superseded | Yangi tahrir bilan almashtirilgan | neutral |

Fakt (`qoralama/tasdiqlangan/rad/bekor`) va zayavka (`kutilmoqda/tasdiqlandi/yopildi/rad`) ham shu yerda. Telegram: ton → emoji (`ok ✅`, `warn ⏳`, `danger ❌`, `info ℹ️`, `neutral ▫️`).

## 5. Komponentlar: sayt ↔ Compose

| Vazifa | Sayt | Compose (`ui-common`) | Qoida |
|---|---|---|---|
| Tugma | `fz-btn` (`--primary/--ghost/--danger/--sm/--lg/--icon`) | `QButton(kind=QButtonKind…)`, `QIconButton` | Sahifada bitta primary; xavfli amal — danger; yuklanayotganda spinner, matn o'zgarmaydi |
| Kiritish | `input.fz-input` | `QInput`, `QSearchField`, `QDateField` | Balandlik `control-md` (telefon 44); xato — `danger` chegara + matn |
| Chip / holat | `fz-chip(--warn/--danger/--accent)`, `fz-stamp(--ok…)` | `QChip(tone=QTone.*)` | Matn = `status.*.label` |
| Karta | `fz-card` (+`__head/__title/__sub/__body`) | `QCard`, `QPanel` | Sarlavha 15/22 |
| Jadval | `fz-table` | `DataGrid` + `GridModel` (Windows, `desktop/DataGrid.kt`), `QListRow` ro'yxat (telefon) | Raqam ustunlari o'ngda, `tabular-nums`; sarlavha qotadi |
| Summa uchligi | `fz-kpi`/summa bloki | `QSumBlock(qqsBilan, ustamali, ustamasiz)` | §3 tartibi |
| Preview → Tasdiqlash | `fz-note` + `fz-btn--primary` «Tasdiqlash» | `QNote` + `QButton(Primary)` | Yozuv avval preview (dry-run), faqat «Tasdiqlash»dan keyin bajariladi; pul amalida jami ko'rsatiladi |
| Bo'sh holat | `fz-list` bo'sh blok | `QEmpty(text, icon, action)` | Nima qilish kerakligi bitta tugma |
| Xato | `fz-note--danger` | `QError(text, onRetry)` | «Qayta urinish» tugmasi; xom xato kodi yashirin |
| Eslatma | `fz-note(--warn/--info)` | `QNote(tone)` | |
| Yuklanish | skeleton | `QLoading`, `QSpinner` | |
| Dialog | modal | `QDialog` | |
| Toast | `toast` (sayt) | snackbar (Android) / `QNote` (Windows) | Muvaffaqiyat 3 s, xato qoladi |
| Sahifa sarlavhasi | `fz-pagehead` (`__title/__desc/__actions`) | `QPageHead(title, desc, actions)` | Sarlavha 19/24; chiqindi breadcrumb: Bo'lim › Sahifa |
| Tablar | `fz-tabs` | `QTabs` | |
| Bo'lim yorlig'i | `fz-kat--chel/mash/mat/ob` | `QColors.katChel…` | |
| Sana | — | `QDatePickerDialog`, `formatDate` | `dd.MM.yyyy` hamma joyda |

## 6. Navigatsiya (sayt = Android = Windows = Telegram)

Yetti ish joyi, aynan shu nom va tartibda (`tokens.json > nav`, sayt `ishJoyi.ts`):
**Bugun · Obyekt · Hujjatlar · Ta‘minot · Moliya · Tomonlar · Kompaniya.**
Sahifalar: Bugun (Bugun, Bildirishnomalar) · Obyekt (Obyektlar, Smeta, Narx manbalari, Fakt kiritish, F2, Nakopitelniy va F3, Naryad, M-29) · Hujjatlar (Disk, Hujjat aylanishi, Texnik nazorat) · Ta‘minot (Ta‘minot va sklad, Zayavkalar) · Moliya (Moliya va shartnomalar, Qarzdorlik) · Tomonlar · Kompaniya (Sozlamalar). Ilova bajarmagan bo'limni yashiradi, tartibni o'zgartirmaydi (`QNav.visible`).
Telegram doimiy menyu: Obyektlar, Bugun, Fakt kiritish, F-2, Hujjatlar, Tasdiqlar, Bildirishnomalar, Jarvis, Menyu. Ma'lum farq: botda «F-2», saytda «F2» — bot egasi bilan kelishib bittaga keltiriladi.

## 7. Tekshiruvlar

- `frontend`: `yagona-dizayn.test.ts` — generator eskirmaganligi, nav = ish joylari, F-2 yorliqlari = lifecycle yorliqlari, raqam namunalari.
- `:ui-common:desktopTest` `DesignTokensTest` — QNav = tokens.nav, palitra va holat yorliqlari.
- `:shared:test` `FormatFixtureTest` — bir xil `format.json`.
- CI: `node scripts/gen-design-tokens.mjs --check`.
