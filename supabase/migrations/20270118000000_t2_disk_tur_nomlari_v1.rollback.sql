-- Orqaga qaytarish: A5 dagi asl _t2_disk_tur_nom_v1.
create or replace function public._t2_disk_tur_nom_v1(p_tur text)
returns text language sql immutable as $$
  select case lower(regexp_replace(coalesce(p_tur, ''), '^kompaniya_', ''))
    when 'f2_hujjat' then 'F-2 hujjatlari' when 'f2_akt' then 'F-2 aktlari (import manbasi)' when 'f3' then 'F-3' when 'forma3' then 'F-3'
    when 'nakopitelniy' then 'Nakopitelniy' when 'slichitelniy' then 'Slichitelniy' when 'ostatka' then 'Ostatka' when 'm29' then 'M-29' when 'aosr' then 'AOSR'
    when 'smeta' then 'Smetalar' when 'smeta_lrv' then 'LRV' when 'smeta_res' then 'RES' when 'nashr' then 'Nashr qilingan hujjatlar'
    when 'warehouse_receipt' then 'Ombor kirimlari' when 'sverka' then 'Sverka' when 'shartnoma_oylik_paket' then 'Oylik paket' when 'shartnoma' then 'Shartnomalar'
    when 'hujjat' then 'Boshqa hujjatlar'
    when 'bajarilmadi' then 'Bajarilmadi ro''yxatlari' when 'loyiha_smeta_fakt' then 'Loyiha-smeta-fakt' when 'narx_dalil' then 'Narx asoslash' when 'narx_protokol' then 'Narx protokollari'
    when 'naryad' then 'Naryadlar' when 'obosnovanie' then 'Obosnovanie' when 'pereraschet' then 'Pereraschet' when 'resurs_vedomost' then 'Resurs vedomostlari'
    when 'smeta_dava' then 'Smeta bo''yicha da''vo' when 'moliya_tahlil' then 'Moliyaviy tahlil' when 'boshqaruv_hisobot' then 'Boshqaruv hisobotlari' when 'f2_portfel' then 'F-2 portfellari'
    when 'studio_hujjat' then 'Studio hujjatlari' when 'sverka_lrv_res' then 'LRV-RES sverkasi'
    when 'bux_hisobot' then 'Buxgalteriya hisoboti' when 'akt_sverki' then 'Akt-sverka' when 'kassa_order' then 'Kassa orderlari' when 'oborot_saldo' then 'Oborot-saldo vedomostlari' when 'sverka_tomon' then 'Tomonlar sverkasi'
    when 'ish_haqi' then 'Ish haqi vedomostlari' when 'tekshiruv_jurnal' then 'Tekshiruvlar jurnali' when 'rahbar_panel' then 'Rahbar paneli' when 'zakazchik_hisobot' then 'Buyurtmachi hisobotlari'
    when 'tender_bayonnoma' then 'Tender bayonnomalari' when 'qarzdorlik' then 'Qarzdorlik asosnomalari' when 'oferta' then 'Oferta' when 'sub_akt' then 'Subpudratchi aktlari'
    when 'hujjat_aylanish' then 'Hujjat aylanishi' when 'ombor_qoralama' then 'Ombor kirim qoralamalari' when 'shartnoma_svod' then 'Shartnomalar svodi'
    else left(coalesce(nullif(initcap(replace(regexp_replace(btrim(coalesce(p_tur, '')), '^kompaniya_', ''), '_', ' ')), ''), 'Boshqa hujjatlar'), 80) end $$;
