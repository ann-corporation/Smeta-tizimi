# Egasi talablari va qarorlari — 2026-10-26 (cloud sessiya, `claude/blissful-cannon-a0ja8l`)

> Manba: egasining shu kungi xabarlari (o'zbekcha, mazmuni aniq saqlangan). Obsidian `DECISIONS.md` / `PRODUCT_ROADMAP.md` /
> `IDEA_INBOX.md` ga ko'chirilishi kerak (mahalliy agent — cloud sessiyada anvar-brain reposiga ruxsat yo'q).
> Holat: ✅ bajarildi · 🟡 qisman · ⏳ navbatda · ❓ egasi qarori kutilmoqda.

## A. QARORLAR (egasi tanlagan — o'zgartirilmaydi)

| # | Qaror | Qayerda amalga oshirildi |
|---|---|---|
| Q1 | **Kompaniya faqat so'rov orqali ochiladi.** Ro'yxatdan o'tganda (email kod / Google / login-parol) faqat shaxsiy hisob; ishga kirish — taklif havolasi yoki STIR bilan so'rov → superadmin tasdiqlaydi. (Birinchi tanlov «1 ta shaxsiy ish joyi» xato bosilgan, egasi qayta tanladi.) | ✅ migratsiyalar `20261111450000_t2_kompaniya_ochish_cheklov_v1`, `20261111460000_t2_royxat_kompaniyasiz_v1` (prodda). So'rov cheklovlari: STIR majburiy, 1 ta kutilayotgan, 30 kunda 3 ta, STIR takrori rad. UI dagi «＋ ish joyi» tugmasini so'rov oynasiga almashtirish ⏳ |
| Q2 | **Imzochilar kompaniya darajasida EMAS** — loyiha / obyekt / razdel bo'yicha variant; har tomon (zakazchik, pudratchi, texnadzor…) o'z imzochisini o'zi tayinlaydi; bitta joyda to'ldirilgani hamma joyga tarqalib ketmasin; qo'lda yozilgan nomlar eslab qolinsin. | 🟡 kod `a10b6104` (push qilingan); migratsiya `20261111500000_t2_obyekt_imzochi_v1` prodga qo'llanmagan (Supabase tasdig'i kutilmoqda). Razdel konteksti hujjat sahifalariga hali ulanmagan |
| Q3 | Superadmin / Rahbar tez tugmalari login sahifasidan olib tashlanadi; login ideal — **email ga kod keladi, kod bilan kiriladi**. | ✅ PR #158 |
| Q4 | Gmail va login-parol hisoblari alohida bo'lishi «absurd» — **bitta hisob**. | ✅ hisob birlashtirish (profil xavfsizlik migratsiyasi), 4→183 birlashtirildi |
| Q5 | Mindmap alohida menyuda ham tursin, lekin **o'sha mindmapning o'zi rahbar panelida** ko'rinsin (kichik nusxa emas). | ✅ `459d1394` |
| Q6 | Ilova (Android/iOS/Windows) — **hozir shoshilinmaydi**. | — |

## B. TALABLAR (bajarilishi kerak)

### B1. Sozlamalar va biznes mantiq
- Uch qatlam: **tizim sozlamalari** (platforma — superadmin butun tizimni «vergulgacha» nazorat qiladi), **akkaunt sozlamalari** (shaxsiy), **kompaniya admin paneli** (kompaniyada hammasi shu yerdan boshqariladi). Zakazchik / pudratchi / loyihachi uchun **universal ekotizim**. — 🟡 Sozlamalar markazi (`/admin/sozlamalar`, 76 sozlama reestri) qurildi, lekin egasi: «hali tarqoq, biznes mantiq yo'q, kimga nima ko'rinishi va nimani nazorat qilishi berilmagan» → ❓ «kim nimani ko'radi / boshqaradi» matritsasi egasiga taqdim etildi, tasdiq kutilmoqda.
- **Oddiy foydalanuvchi tizim foydasini ko'rmasligi kerak.** Topildi: `/admin/tokenlar` har sarfning tannarxi va platforma foyda foizini mijozga ko'rsatadi. — ⏳ serverdan va UI dan olib tashlash.
- Kompaniya sozlamalari ichidagi «kompaniya ochish» oynasi — xohlagan odam tizimni to'ldirib tashlashi mumkin. — ✅ server cheklandi (Q1), UI ⏳.

### B2. Rahbar paneli (rahbar ko'zi bilan)
- Kirganda xunuk «kompaniya xaritasi», manbaga bog'lanmagan diagrammalar, yuzlab qatorli audit jurnali bo'lmasin. — 🟡 xarita almashtirildi (Q5); audit jurnali faqat tab ichida (kirishda yo'q) — tekshirildi.
- Tizim rahbarni **yuqoridan pastga yetaklab** tushuntirsin: portfel → obyekt → razdel → qator → hujjat.
- **Smeta, fakt, F2, mablag'** — har taraflama nazorat; **rentabellik** (smeta 100% bajarilganda qancha bo'ladi, hozir qancha), **yo'qotishlar**, **takliflar**.
- **Har bir tiyin uchun tasdiqlangan hujjat**: qaysi 1 so'm qayerdan keldi, qayerga ketyapti.
- Obyektga nima kerak / nima kerak emas.
- Holat (2026-10-26 tekshiruv): bazada to'lov 0, xarajat 0, faktura 1, kadr 0 — haqiqiy foydani hisoblab bo'lmaydi; panel buni «0» emas «kiritilmagan» deb ko'rsatishi va qayerga kiritishni aytishi kerak. `t2_pul_tahlil_v2` butun kompaniyada 19 s — tezlashtirish kerak. — ⏳

### B3. Summalarga ishonch (QO'POL XATO bo'lmasin)
- Misol: Amfiteatr — ekspertiza xulosasi **56 mlrd QQS bilan, 43 mlrd to'g'ridan-to'g'ri xarajat**, tizim **50 mlrd** ko'rsatadi; boshqa obyektlarda ham shunday. — ✅ 2026-10-27 bazadan tasdiqlandi (obyekt 151, «Amfiteatr va sahna»): pryamye 43,60 mlrd = ekspertiza 43; ИТОГО-4 (nakrutka, QQSsiz) 50,45 mlrd = tizimdagi «50»; QQS 12% 6,05 mlrd; ВСЕГО 56,50 mlrd = ekspertiza 56. Xato hisobda emas — yorliqda: «ИТОГО-4» QQSsiz ekani yozilmagan ⏳. Har summa yonida asos yozilishi kerak: ustamali/ustamasiz, QQSli/QQSsiz; ekspertiza bilan solishtirish uchun QQSli jami.
- 399 mlrd «primoy zatrat» — to'g'ri (399,35), lekin ~90 mlrd hujjatsiz qo'shimcha qatorlar bor (Stella 41, Sun'iy ko'l 47) — ❓ egasi ko'rib chiqishi kerak.
- Har joyda summa **ustamali + ustamasiz** (AGENTS.md 2b).

### B4. Mindmap — markaziy boshqaruv yuzasi
- «Har kim o'ziga tegishli qismni ko'ra olsin va boshqara olsin, to'liq nazorat; har funksiya professional; **har signal ideal asosli**; **kompaniya strukturasini shu mindmapda tuzsa bo'lsin**.»
- Reja (tekshiruv 2026-10-26):
  1. Ishonchli xarita — F2 faqat tasdiqlangan (hozir qoralamalar ham qo'shiladi), haqiqiy signallar (`t2_signal`, `t2_overbilling_radar`), shartnoma ma'lumotlari, tahrir faqat ruxsati borlarga, eski havolalar tuzatish. — 🟡 frontend ✅ `877d3b00`; SQL `20261111600000_t2_mindmap_grafi_v3` prodga qo'llanmagan (Supabase tasdig'i).
  2. Har kim o'z qismi — rol/obyekt bo'yicha filtr, moliyaviy ruxsatsizlarga summa yo'q, rahbar xaritadan obyekt ochadi. — ⏳
  3. Kompaniya tuzilmasi xaritada — bo'lim/brigada, xodim + rol, «obyektda PTO/prorab kim», taklif va rol berish xaritadan. — ⏳ (bo'lim/brigada jadvali yo'q)
  4. Tashqi tomonlar va imzochilar xaritada; eski tahrir kodini tozalash. — ⏳

### B5. Navigatsiya
- Hamma joyda Provodnik kabi **orqaga / oldinga** tugmalari. — ✅ `2e3071f3`

### B6. Avvalgi kunlardan davom etayotganlar
- Firuza dizayni (PR #150 merged), smeta/F2 qatorlari ko'rinishidan tushunarli, rahbar paneli mindmap + chartlar, ko'proq diagramma va animatsiya, burchakda akkaunt nazorati.

## C. EGASI QARORI KUTILAYOTGANLAR
1. «Kim nimani ko'radi / boshqaradi» matritsasi (platforma · kompaniya · loyiha/obyekt tomonlari · shaxsiy; kompaniya turiga qarab bo'limlar).
2. ~90 mlrd hujjatsiz qo'shimcha smeta qatorlari.
3. Anvar (7) va boss (3) hisoblarini birlashtirish (parolsiz — qo'lda).
4. Domen olish → Resend domen tasdig'i → `EMAIL_FROM`.
5. DB parolini almashtirish (chatda oshkor bo'lgan).
6. Supabase so'rovlarini tasdiqlash: «X shaxsiy» (id 177, sinovda xato ochilgan) ni o'chirish; imzochilar migratsiyasi; Amfiteatr tekshiruvi; mindmap grafi v3.
7. Cloud sessiyaga `ann-corporation/anvar-brain` (Obsidian) reposiga yozish ruxsati — shu fayl o'rniga to'g'ridan-to'g'ri Obsidian'ga yozish uchun.
