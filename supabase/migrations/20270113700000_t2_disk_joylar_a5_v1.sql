-- Disk A5: qolgan hujjat joylari. (1) obyektsiz (kompaniya darajasidagi) hujjat turlari `kompaniya_<nom>` Kompaniya diskida «Kompaniya hujjatlari» papkasiga tushadi
-- (ilgari loyihasiz hujjat «Biriktirilmagan» ga tushardi - buxgalteriya/HR hujjatlari u yerga tegishli emas); (2) tur papkalarining Diskdagi nomi (yangi turlar).
-- Faqat ikkita funksiya almashtiriladi (A1 dagi asl nusxa + minimal o'zgarish); mavjud ma'lumotga TEGILMAYDI. Faqat service_role.
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

create or replace function public._t2_disk_yol_v1(p_kompaniya bigint, p_loyiha bigint, p_shartnoma bigint, p_obyekt bigint, p_daraja text, p_tur text, p_oy text, p_actor bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_l bigint := p_loyiha; v_o bigint := p_obyekt; v_s bigint := p_shartnoma; v_f bigint; v_kalit text; v_nom text; v_ol bigint;
begin
  if v_o is not null then
    select o.loyiha_id into v_ol from public.t2_obyekt o where o.id = v_o and o.kompaniya_id = p_kompaniya;
    if not found then v_o := null; else v_l := coalesce(v_l, v_ol); end if;
  end if;
  if v_l is not null and not exists (select 1 from public.t2_loyiha l where l.id = v_l and l.kompaniya_id = p_kompaniya) then v_l := null; end if;
  -- A5: kompaniya darajasidagi hujjat (obyektsiz, loyihasiz): Kompaniya hujjatlari -> Tur -> Oy
  if v_l is null and lower(coalesce(p_tur, '')) like 'kompaniya\_%' then
    v_kalit := 'kompaniya'; v_f := public._t2_disk_papka_v1(p_kompaniya, null, 'Kompaniya hujjatlari', v_kalit, p_actor);
    v_kalit := v_kalit || '/tur:' || lower(btrim(p_tur)); v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, public._t2_disk_tur_nom_v1(p_tur), v_kalit, p_actor);
    if p_oy is not null and p_oy ~ '^\d{4}-\d{2}$' then v_kalit := v_kalit || '/oy:' || p_oy; v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, p_oy, v_kalit, p_actor); end if;
    return v_f;
  end if;
  if v_l is null then return public._t2_disk_papka_v1(p_kompaniya, null, 'Biriktirilmagan', 'biriktirilmagan', p_actor); end if;
  select l.nom into v_nom from public.t2_loyiha l where l.id = v_l;
  v_kalit := 'loyiha:' || v_l; v_f := public._t2_disk_papka_v1(p_kompaniya, null, v_nom, v_kalit, p_actor);
  if v_s is not null then
    select 'Shartnoma ' || chr(8470) || coalesce(nullif(btrim(s.raqam), ''), nullif(btrim(s.nom), ''), s.id::text) into v_nom from public.t2_shartnoma s where s.id = v_s and s.kompaniya_id = p_kompaniya;
    if found then v_kalit := v_kalit || '/shartnoma:' || v_s; v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, v_nom, v_kalit, p_actor); else v_s := null; end if;
  end if;
  if (p_daraja is distinct from 'shartnoma' or v_s is null) and v_o is not null then
    select o.nom into v_nom from public.t2_obyekt o where o.id = v_o;
    v_kalit := v_kalit || '/obyekt:' || v_o; v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, v_nom, v_kalit, p_actor);
  end if;
  v_kalit := v_kalit || '/tur:' || lower(coalesce(nullif(btrim(p_tur), ''), 'hujjat'));
  v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, public._t2_disk_tur_nom_v1(p_tur), v_kalit, p_actor);
  if p_oy is not null and p_oy ~ '^\d{4}-\d{2}$' then
    v_kalit := v_kalit || '/oy:' || p_oy; v_f := public._t2_disk_papka_v1(p_kompaniya, v_f, p_oy, v_kalit, p_actor);
  end if;
  return v_f;
end $$;

do $g$ declare s text; begin
  foreach s in array array['_t2_disk_tur_nom_v1(text)', '_t2_disk_yol_v1(bigint, bigint, bigint, bigint, text, text, text, bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', s);
    execute format('grant execute on function public.%s to service_role', s);
  end loop;
end $g$;