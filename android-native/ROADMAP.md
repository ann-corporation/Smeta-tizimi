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
