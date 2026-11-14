-- 20261221810000 — F-2 AVTO PODVAL + AVTO REESTR (egasi qoidalari).
--
-- 1) F-2 qoralama yaratilganda obyektning SMETA PODVALIDAN nakrutka foizlari aktga yoziladi (t2_akt_podval, blok '',
--    manba 'smeta'): har F-2 o'z podvalini oladi, foizlar har doim smeta podvalidan (shartnomadan ustun).
--    Yozuv AFTER INSERT triggerda — F-2 yaratishning HAR yo'li (t2_akt_yarat_v2, korrektirovka, import, MCP) qamraladi.
--    Smeta podvali yo'q bo'lsa — QULF YO'Q, faqat ogohlantirish (t2_akt_yarat_v2 javobida 'podval'); podval yozilmaydi.
--    Mavjud yozuv hech qachon ustiga yozilmaydi (import/storno podvali o'z yo'lida t2_akt_podval_yoz_v1 bilan almashtiradi).
--    Eslatma: t2_akt_podval_yoz_v1 aktor ruxsatini (f2.prepare) talab qiladi; trigger aktorsiz ishlaydi, shuning uchun
--    xuddi shu qator shaklini yozuvchi ichki yordamchi _t2_akt_podval_smeta_v1 ishlatiladi (permission'siz, faqat smeta nk).
-- 2) F-2 tasdiqlanganda (holat -> tasdiqlangan; transition, import, har yo'l) reestrga (t2_f2_reestr_jami) yozuv tushadi:
--    summa server hisobidan _t2_summa_paket_v1(..,'aktlar',[akt]) (ustamali/QQS/QQS bilan); raqam = shartnoma reestrining
--    keyingi tartib raqami; korrektirovka (correction_of_akt_id) bo'lsa eski aktning reestr yozuvi YANGI aktga ko'chiriladi.
--    Qo'lda kiritilgan (kim <> 'avto:...') yozuvga tegilmaydi. Storno (manfiy hujjat_jami) aktlar reestrga yangi qator qo'shmaydi.
--    Bekor qilinganda: avto yozuv 'bekor'; qo'lda (rasmiy) yozuv akt_id=null bilan qoladi (reestrda bor, tizimda F2 yo'q);
--    tasdiqlangan almashtiruvchi akt bo'lsa — yozuv unga ko'chadi.
-- 3) t2_akt_yarat_v2 javobiga 'podval' qo'shiladi (pg_get_functiondef + replace; langar aynan 1 marta, aks holda XATO).
-- 4) Backfill (alohida migratsiya 20261221820000) va reestr to'ldirish funksiyasi t2_f2_reestr_toldir_v1 (faqat chaqirilganda).

create or replace function public._t2_akt_podval_smeta_v1(p_akt_id bigint, p_manba text default 'smeta', p_tasdiq boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_a public.t2_akt%rowtype; v_x jsonb; v_n integer;
begin
  if p_manba not in ('smeta', 'backfill') then return jsonb_build_object('ok', false, 'code', 'MANBA_NOTOGRI'); end if;
  select * into v_a from public.t2_akt where id = p_akt_id;
  if not found or v_a.tur <> 'f2' or v_a.kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;
  if v_a.holat <> 'qoralama' and not (p_tasdiq and v_a.holat = 'tasdiqlangan') then
    return jsonb_build_object('ok', false, 'code', 'AKT_QORALAMA_EMAS');
  end if;
  if exists (select 1 from public.t2_akt_podval p where p.akt_id = p_akt_id and p.blok = '') then
    return jsonb_build_object('ok', true, 'holat', 'bor');
  end if;
  v_x := public._t2_obyekt_nk_v1(v_a.obyekt_id);
  if v_x is null or v_x->>'nk_manba' is distinct from 'smeta_podvali' then
    return jsonb_build_object('ok', true, 'holat', 'yoq', 'ogohlantirish', 'SMETA_PODVALI_YOQ',
      'xabar', 'Obyektning smeta podvali topilmadi: nakrutka foizlari shartnoma/kompaniya/standart bo''yicha hisoblanadi.',
      'nk_manba', v_x->>'nk_manba');
  end if;
  insert into public.t2_akt_podval (akt_id, blok, kompaniya_id, obyekt_id, manba, ishora, nk, qatorlar, nds_foiz, masshtab, tekshiruv, actor_id)
  values (p_akt_id, '', v_a.kompaniya_id, v_a.obyekt_id, p_manba, 1, v_x->'nk', '[]'::jsonb, (v_x->'nk'->>'НДС')::numeric, 1,
          jsonb_build_object('avto', 'smeta_podvali', 'smeta_podval_id', v_x->'podval_id'), null)
  on conflict (akt_id, blok) do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.t2_audit_yoz(v_a.kompaniya_id, 'akt_podval_yoz', 'f2', v_a.obyekt_id,
      jsonb_build_object('akt_id', p_akt_id, 'blok', '', 'manba', p_manba, 'avto', true)::text, 'avto:podval', null);
  end if;
  return jsonb_build_object('ok', true, 'holat', case when v_n > 0 then 'yozildi' else 'bor' end, 'manba', p_manba);
end $f$;

-- Akt podvali holati (frontend/MCP ogohlantirishi uchun).
create or replace function public._t2_akt_podval_holat_v1(p_akt_id bigint)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select case when p.akt_id is not null
    then jsonb_build_object('bor', true, 'manba', p.manba)
    else jsonb_build_object('bor', false, 'ogohlantirish', 'SMETA_PODVALI_YOQ',
           'xabar', 'Obyektning smeta podvali topilmadi: nakrutka foizlari shartnoma/kompaniya/standart bo''yicha hisoblanadi.') end
  from (select 1) s left join public.t2_akt_podval p on p.akt_id = p_akt_id and p.blok = '';
$f$;

create or replace function public._t2_akt_podval_avto_trg_v1() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
begin
  begin
    perform public._t2_akt_podval_smeta_v1(new.id, 'smeta', false);
  exception when others then
    null; -- podval yozilmasa F-2 yaratish to'xtamaydi (ogohlantirish — t2_akt_yarat_v2 javobida)
  end;
  return null;
end $f$;

drop trigger if exists t2_akt_podval_avto on public.t2_akt;
create trigger t2_akt_podval_avto after insert on public.t2_akt
  for each row when (new.tur = 'f2' and new.holat = 'qoralama') execute function public._t2_akt_podval_avto_trg_v1();

-- ---- Reestr: tasdiqlanganda yozish ----
create or replace function public._t2_f2_reestr_avto_v1(p_akt_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare
  v_a public.t2_akt%rowtype; v_sh bigint; v_p jsonb; v_o public.t2_obyekt%rowtype; v_r public.t2_f2_reestr_jami%rowtype;
  v_us numeric; v_qs numeric; v_qb numeric; v_raqam text; v_davr text; v_matn text := U&'\0410\043A\0442\0438\0432\043D\043E';
  v_oylar text[] := array[U&'\042F\043D\0432\0430\0440\044C', U&'\0424\0435\0432\0440\0430\043B\044C', U&'\041C\0430\0440\0442',
    U&'\0410\043F\0440\0435\043B\044C', U&'\041C\0430\0439', U&'\0418\044E\043D\044C', U&'\0418\044E\043B\044C', U&'\0410\0432\0433\0443\0441\0442',
    U&'\0421\0435\043D\0442\044F\0431\0440\044C', U&'\041E\043A\0442\044F\0431\0440\044C', U&'\041D\043E\044F\0431\0440\044C', U&'\0414\0435\043A\0430\0431\0440\044C'];
  v_id bigint;
begin
  select * into v_a from public.t2_akt where id = p_akt_id;
  if not found or v_a.tur <> 'f2' or v_a.kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;
  if coalesce(v_a.hujjat_jami, 0) < 0 then
    return jsonb_build_object('ok', true, 'holat', 'storno_otkazildi'); -- storno: asl aktning reestr yozuvi o'z joyida
  end if;
  v_sh := coalesce(v_a.shartnoma_id, (select b.shartnoma_id from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
            where b.obyekt_id = v_a.obyekt_id and b.holat = 'faol' and s.holat <> 'bekor' order by b.shartnoma_id limit 1));
  if v_sh is null then return jsonb_build_object('ok', true, 'holat', 'shartnoma_yoq', 'ogohlantirish', 'REESTR_SHARTNOMA_YOQ'); end if;
  perform pg_advisory_xact_lock(hashtextextended('f2_reestr:' || v_sh, 0));
  if exists (select 1 from public.t2_f2_reestr_jami r where r.akt_id = p_akt_id and r.holat = 'faol') then
    return jsonb_build_object('ok', true, 'holat', 'bor'); -- qo'lda/oldindan bog'langan yozuvga tegilmaydi
  end if;
  begin perform public._t2_akt_podval_smeta_v1(p_akt_id, 'smeta', true); exception when others then null; end;
  select p.paket into v_p from public._t2_summa_paket_v1(array[v_a.obyekt_id], 'aktlar', array[p_akt_id]) p limit 1;
  -- summalar yadro (_t2_summa_paket_v1) natijasi: 2 xonaga yadroda yaxlitlangan, qayta hisoblanmaydi.
  v_us := nullif(v_p->>'ustamali', '')::numeric; v_qs := nullif(v_p->>'qqs', '')::numeric;
  v_qb := nullif(v_p->>'qqs_bilan', '')::numeric;
  if v_us is null and v_qb is null then return jsonb_build_object('ok', true, 'holat', 'summa_yoq', 'ogohlantirish', 'REESTR_SUMMA_YOQ'); end if;
  select * into v_o from public.t2_obyekt where id = v_a.obyekt_id;
  v_davr := v_oylar[extract(month from v_a.oy)::int] || ' ' || extract(year from v_a.oy)::int::text;

  -- Korrektirovka: eski aktning reestr yozuvi yangi aktga ko'chadi (raqam saqlanadi).
  if v_a.correction_of_akt_id is not null then
    select * into v_r from public.t2_f2_reestr_jami r where r.akt_id = v_a.correction_of_akt_id and r.holat = 'faol'
      and r.kompaniya_id = v_a.kompaniya_id order by r.id limit 1;
    if found then
      update public.t2_f2_reestr_jami set akt_id = p_akt_id, oy = v_a.oy, davr = v_davr, qqssiz = v_us, qqs = v_qs, qqs_bilan = v_qb,
             holat_matn = v_matn, versiya = versiya + 1, yangilandi = now(), kim = 'avto:koch:' || p_akt_id
       where id = v_r.id;
      return jsonb_build_object('ok', true, 'holat', 'kochirildi', 'reestr_id', v_r.id, 'raqam', v_r.raqam, 'qqs_bilan', v_qb);
    end if;
  end if;

  select (coalesce(max(r.raqam::bigint), 0) + 1)::text into v_raqam
    from public.t2_f2_reestr_jami r where r.shartnoma_id = v_sh and r.holat = 'faol' and r.raqam ~ '^[0-9]{1,15}$';
  insert into public.t2_f2_reestr_jami (kompaniya_id, shartnoma_id, akt_id, raqam, obyekt_ish, davr, oy, qqssiz, qqs, qqs_bilan, holat_matn, kim)
  values (v_a.kompaniya_id, v_sh, p_akt_id, v_raqam, nullif(left(coalesce(v_o.nom, ''), 500), ''), v_davr, v_a.oy, v_us, v_qs, v_qb, v_matn,
          'avto:' || p_akt_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'holat', 'yangi', 'reestr_id', v_id, 'raqam', v_raqam, 'qqs_bilan', v_qb);
exception when others then
  return jsonb_build_object('ok', false, 'code', 'REESTR_XATO', 'xato', left(sqlerrm, 300));
end $f$;

-- ---- Reestr: bekor qilinganda ----
create or replace function public._t2_f2_reestr_bekor_v1(p_akt_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_r public.t2_f2_reestr_jami%rowtype; v_n bigint; v_res jsonb;
begin
  select * into v_r from public.t2_f2_reestr_jami r where r.akt_id = p_akt_id and r.holat = 'faol' order by r.id limit 1;
  if not found then return jsonb_build_object('ok', true, 'holat', 'yoq'); end if;
  perform pg_advisory_xact_lock(hashtextextended('f2_reestr:' || v_r.shartnoma_id, 0));
  select a.id into v_n from public.t2_akt a where a.correction_of_akt_id = p_akt_id and a.holat = 'tasdiqlangan' and a.tur = 'f2'
    and not exists (select 1 from public.t2_f2_reestr_jami z where z.akt_id = a.id and z.holat = 'faol') order by a.id limit 1;
  if v_n is not null then
    v_res := public._t2_f2_reestr_avto_v1(v_n); -- correction_of_akt_id = shu akt: yozuv yangi aktga ko'chadi
    if coalesce(v_res->>'holat', '') = 'kochirildi' then return v_res; end if;
  end if;
  if coalesce(v_r.kim, '') like 'avto:%' then
    update public.t2_f2_reestr_jami set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = v_r.id;
    return jsonb_build_object('ok', true, 'holat', 'bekor', 'reestr_id', v_r.id);
  end if;
  update public.t2_f2_reestr_jami set akt_id = null, versiya = versiya + 1, yangilandi = now() where id = v_r.id;
  return jsonb_build_object('ok', true, 'holat', 'ajratildi', 'reestr_id', v_r.id);
exception when others then
  return jsonb_build_object('ok', false, 'code', 'REESTR_XATO', 'xato', left(sqlerrm, 300));
end $f$;

create or replace function public._t2_akt_reestr_avto_trg_v1() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_r jsonb;
begin
  if new.holat = 'tasdiqlangan' then v_r := public._t2_f2_reestr_avto_v1(new.id);
  elsif new.holat = 'bekor' then v_r := public._t2_f2_reestr_bekor_v1(new.id);
  end if;
  return null;
end $f$;

drop trigger if exists t2_akt_reestr_avto on public.t2_akt;
create trigger t2_akt_reestr_avto after update on public.t2_akt
  for each row when (new.tur = 'f2' and old.holat is distinct from new.holat and new.holat in ('tasdiqlangan', 'bekor'))
  execute function public._t2_akt_reestr_avto_trg_v1();

-- ---- Backfill yordamchilari (alohida chaqiriladi; tasdiqlangan aktlarga tegmaydi) ----
create or replace function public.t2_akt_podval_backfill_qoralama_v1(p_kompaniya_id bigint default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_a bigint; v_r jsonb; v_yozildi int := 0; v_yoq int := 0; v_xato int := 0; v_yoq_ids bigint[] := '{}';
begin
  for v_a in select a.id from public.t2_akt a
              where a.tur = 'f2' and a.holat = 'qoralama' and (p_kompaniya_id is null or a.kompaniya_id = p_kompaniya_id)
                and not exists (select 1 from public.t2_akt_podval p where p.akt_id = a.id and p.blok = '') order by a.id loop
    begin
      v_r := public._t2_akt_podval_smeta_v1(v_a, 'backfill', false);
      if v_r->>'holat' = 'yozildi' then v_yozildi := v_yozildi + 1;
      elsif v_r->>'holat' = 'yoq' then v_yoq := v_yoq + 1; v_yoq_ids := v_yoq_ids || v_a;
      else v_xato := v_xato + 1; end if;
    exception when others then v_xato := v_xato + 1; end;
  end loop;
  return jsonb_build_object('ok', true, 'yozildi', v_yozildi, 'smeta_podvali_yoq', v_yoq, 'xato', v_xato, 'podvalsiz_aktlar', to_jsonb(v_yoq_ids));
end $f$;

-- Tasdiqlangan, reestrda yo'q F-2 lar uchun reestr yozuvi (faqat qo'lda chaqiriladi; p_quruq=true — faqat hisob).
create or replace function public.t2_f2_reestr_toldir_v1(p_kompaniya_id bigint default null, p_quruq boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_a bigint; v_r jsonb; v_yangi int := 0; v_koch int := 0; v_otkaz int := 0; v_list jsonb := '[]'::jsonb;
begin
  for v_a in select a.id from public.t2_akt a
              where a.tur = 'f2' and a.holat = 'tasdiqlangan' and (p_kompaniya_id is null or a.kompaniya_id = p_kompaniya_id)
                and not exists (select 1 from public.t2_f2_reestr_jami r where r.akt_id = a.id and r.holat = 'faol')
                and coalesce(a.hujjat_jami, 0) >= 0 order by a.oy, a.id loop
    if p_quruq then
      v_list := v_list || jsonb_build_array(v_a);
    else
      v_r := public._t2_f2_reestr_avto_v1(v_a);
      if v_r->>'holat' = 'yangi' then v_yangi := v_yangi + 1;
      elsif v_r->>'holat' = 'kochirildi' then v_koch := v_koch + 1;
      else v_otkaz := v_otkaz + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'quruq', p_quruq, 'nomzodlar', v_list, 'yangi', v_yangi, 'kochirildi', v_koch, 'otkazildi', v_otkaz);
end $f$;

-- ---- t2_akt_yarat_v2 javobiga 'podval' ----
do $patch$
declare v_def text; v_new text; v_anchor constant text := '''arithmetic_mismatch_soni'', (';
begin
  select pg_get_functiondef('public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)'::regprocedure) into v_def;
  if v_def like '%_t2_akt_podval_holat_v1%' then return; end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 't2_akt_yarat_v2 langari aynan 1 marta topilmadi (drift)';
  end if;
  v_new := replace(v_def, v_anchor, '''podval'', public._t2_akt_podval_holat_v1(v_akt_id), ' || v_anchor);
  execute v_new;
end $patch$;

revoke all on function public._t2_akt_podval_smeta_v1(bigint, text, boolean) from public, anon, authenticated;
revoke all on function public._t2_akt_podval_holat_v1(bigint) from public, anon, authenticated;
revoke all on function public._t2_akt_podval_avto_trg_v1() from public, anon, authenticated;
revoke all on function public._t2_f2_reestr_avto_v1(bigint) from public, anon, authenticated;
revoke all on function public._t2_f2_reestr_bekor_v1(bigint) from public, anon, authenticated;
revoke all on function public._t2_akt_reestr_avto_trg_v1() from public, anon, authenticated;
revoke all on function public.t2_akt_podval_backfill_qoralama_v1(bigint) from public, anon, authenticated;
revoke all on function public.t2_f2_reestr_toldir_v1(bigint, boolean) from public, anon, authenticated;
grant execute on function public.t2_akt_podval_backfill_qoralama_v1(bigint) to service_role;
grant execute on function public.t2_f2_reestr_toldir_v1(bigint, boolean) to service_role;
