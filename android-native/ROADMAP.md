# Android roadmap (after P5)

Audit of web features that field and office users need most and that are still web-fallback (opened in the authenticated WebView), by impact / effort.

| # | Feature | Impact | Effort | Notes |
| --- | --- | --- | --- | --- |
| done P5 | Full estimate tree (RZ -> BL -> RS/MAT/OB), search with parent path, fact entry from a BL row | very high | M | Room table `smeta_node`, filled by the object packet |
| done P5 | F-2 list + status + detail per object | high | S | `akt_reestr_obyekt_v1`; sums stay on the web (no QQS/markup split in the list) |
| done P5 | Boss panel (`rahbar_panel_v1`) | high | M | |
| 1 | F-2 PDF / Excel open | high | M | Needs server: add `/api/hujjat-ol` + `/api/hujjat-royxat` to the BFF allow-list and a binary download path in `ApiClient`; then `PdfRenderer` viewer |
| 2 | Documents (hujjatlar) list + PDF/image viewer | high | M | Same server work as above |
| 3 | Notifications center (full list, filters) | medium | S | Today shows only the last 5; `hujjat-aylanish?bolim=bildirishnomalar` already allowed |
| 4 | Per-row QQS / markup package in the tree | medium | M | Server would have to return a per-node sum package; today rows carry only the markup-free amount |
| 5 | Resource statement (resurs vedomost), M-29 | medium | L | Packet already has resources; needs aggregation read |
| 6 | Smeta editing (rows, prices, replacements) | medium | L | Web-only on purpose until offline conflict rules exist |
| 7 | Finance / payments entry, debtors drill-down | medium | L | Boss panel shows totals only |
| 8 | AOSR / executive documents | medium | L | |
| 9 | Delta sync for the packet (txid horizon) instead of full re-download | performance | M | ADR OBYEKT_PAKET_OFFLINE_DESKTOP_V1 section 1.5 |

## Round P8 (0.1.9)

Native now: warehouse (stock, receipts and issues lists, item card with history, fuzzy Latin/Cyrillic search, typed and voice commands with a server-parsed preview), company F-2 registry, cumulative statement per object (files from the server document engine), fact acceptance (usta drafts, PIN step-up through the API client), debtors drill-down with the per-object boss panel, resource statement. Hub duplicate (Director console / Boss panel) removed.

Still open: texnadzor acceptance for the external party (needs /api/tomon + nazorat in the mobile BFF), row-level cumulative table (needs /api/hujjat-nazorat in the BFF), POST /api/ombor-buyruq server contract (the app codes against an assumed shape), profile photo / sessions / notification settings (need /api/profil actions in the BFF allow-list), voice command server endpoint in the BFF allow-list.

## Round P10 (0.1.10)

Native now: Settings (photo pick/crop/upload/remove via /api/mobil/avatar -> R2 r2Yoz, name/phone, language, theme, per-type notification switches + Telegram bot prefs, PIN/biometrics, active session + sign out other devices with device re-enrolment, cache, about/update check, log out) and texnadzor acceptance (/api/tomon taqdimlar + f2_tekshiruv + nazorat_qaror, server step-up PIN). BFF allow-list: profil GET/yangila/boshqa_sessiyalar_chiqish, tomon (nazorat sections/decisions), telegram (status + sozlama).

Still open: a real list of other sessions/devices (needs a self-service device list RPC), avatar shown to other users (people lists), row-level cumulative table.
