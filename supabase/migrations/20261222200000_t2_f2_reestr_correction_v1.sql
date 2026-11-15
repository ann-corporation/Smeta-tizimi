-- 20261222200000 -- F-2 reestr: korrektirovka eski aktning reestr yozuvini O'ZIGA oladi (ikkinchi qator ochmaydi).
--
-- Xato (prod mashqida): asl tasdiqlangan akt bekor qilinsa, uning reestr yozuvi akt_id=null (yetim) bo'lib qolardi;
-- keyin korrektirovka tasdiqlansa _t2_f2_reestr_avto_v1 yozuvni akt_id = correction_of_akt_id bo'yicha topa olmay,
-- YANGI 'avto:<id>' qator ochardi -> bitta imzolangan F-2 reestrda ikki marta.
-- Tuzatish:
--  (1) _t2_f2_reestr_avto_v1: asl akt zanjiri (correction_of_akt_id VA t2_akt_correction_link 'supersedes', ko'p bosqichli)
--      bo'yicha faol yozuv topilsa u yangi aktga ko'chadi, hech qachon ikkinchi qator ochilmaydi. Qo'lda kiritilgan yozuvning
--      raqam/oy/davr/summa/kim maydonlari saqlanadi (faqat akt_id); avto yozuvda summa/oy/davr yangilanadi.
--  (2) _t2_f2_reestr_bekor_v1: bekor qilinayotgan aktni hali yakunlanmagan (bekor emas) korrektirovka almashtirayotgan bo'lsa
--      yozuv akt_id bilan QOLADI (yetim qilinmaydi, avto yozuv 'bekor' qilinmaydi) -- korrektirovka tasdiqlanganda oladi.
--      Korrektirovka o'zi bekor bo'lsa va asl akt allaqachon bekor bo'lsa, qoldirilgan yozuv eski qoida bilan yopiladi.
-- Triggerlar o'zgarmaydi (faqat ikki funksiya tanasi).

create or replace function public._t2_f2_reestr_oldingi_v1(p_akt_id bigint)
returns bigint[] language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  -- p_akt_id ning barcha asl (almashtirilgan) aktlari: correction_of_akt_id va 'supersedes' bog'lanishi, zanjir bo'ylab.
  with recursive anc(id) as (
    select x.id from (
      select a.correction_of_akt_id as id from public.t2_akt a where a.id = p_akt_id
      union
      select l.original_akt_id from public.t2_akt_correction_link l where l.replacement_akt_id = p_akt_id
    ) x where x.id is not null
    union
    select y.id from anc join lateral (
      select a.correction_of_akt_id as id from public.t2_akt a where a.id = anc.id
      union
      select l.original_akt_id from public.t2_akt_correction_link l where l.replacement_akt_id = anc.id
    ) y on y.id is not null
  )
  select coalesce(array_agg(id), '{}'::bigint[]) from anc;
$f$;

create or replace function public._t2_f2_reestr_avto_v1(p_akt_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare
  v_a public.t2_akt%rowtype; v_sh bigint; v_p jsonb; v_o public.t2_obyekt%rowtype; v_r public.t2_f2_reestr_jami%rowtype;
  v_us numeric; v_qs numeric; v_qb numeric; v_raqam text; v_davr text; v_matn text := U&'\0410\043A\0442\0438\0432\043D\043E';
  v_oylar text[] := array[U&'\042F\043D\0432\0430\0440\044C', U&'\0424\0435\0432\0440\0430\043B\044C', U&'\041C\0430\0440\0442',
    U&'\0410\043F\0440\0435\043B\044C', U&'\041C\0430\0439', U&'\0418\044E\043D\044C', U&'\0418\044E\043B\044C', U&'\0410\0432\0433\0443\0441\0442',
    U&'\0421\0435\043D\0442\044F\0431\0440\044C', U&'\041E\043A\0442\044F\0431\0440\044C', U&'\041D\043E\044F\0431\0440\044C', U&'\0414\0435\043A\0430\0431\0440\044C'];
  v_id bigint; v_anc bigint[]; v_found boolean := false;
begin
  select * into v_a from public.t2_akt where id = p_akt_id;
  if not found or v_a.tur <> 'f2' or v_a.kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;
  if coalesce(v_a.hujjat_jami, 0) < 0 then
    return jsonb_build_object('ok', true, 'holat', 'storno_otkazildi'); -- storno: asl aktning reestr yozuvi o'z joyida
  end if;
  v_anc := public._t2_f2_reestr_oldingi_v1(p_akt_id);
  v_sh := coalesce(v_a.shartnoma_id, (select b.shartnoma_id from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
            where b.obyekt_id = v_a.obyekt_id and b.holat = 'faol' and s.holat <> 'bekor' order by b.shartnoma_id limit 1));
  if v_sh is null and cardinality(v_anc) > 0 then
    select r.shartnoma_id into v_sh from public.t2_f2_reestr_jami r
     where r.akt_id = any (v_anc) and r.holat = 'faol' and r.kompaniya_id = v_a.kompaniya_id order by r.id limit 1;
  end if;
  if v_sh is null then return jsonb_build_object('ok', true, 'holat', 'shartnoma_yoq', 'ogohlantirish', 'REESTR_SHARTNOMA_YOQ'); end if;
  perform pg_advisory_xact_lock(hashtextextended('f2_reestr:' || v_sh, 0));
  if exists (select 1 from public.t2_f2_reestr_jami r where r.akt_id = p_akt_id and r.holat = 'faol') then
    return jsonb_build_object('ok', true, 'holat', 'bor'); -- qo'lda/oldindan bog'langan yozuvga tegilmaydi
  end if;

  -- Korrektirovka: asl (almashtirilgan) akt zanjiridagi faol yozuv yangi aktga ko'chadi -- ikkinchi qator ochilmaydi.
  if cardinality(v_anc) > 0 then
    select * into v_r from public.t2_f2_reestr_jami r where r.akt_id = any (v_anc) and r.holat = 'faol'
      and r.kompaniya_id = v_a.kompaniya_id order by r.id limit 1;
    v_found := found;
    if v_found and coalesce(v_r.kim, '') not like 'avto:%' then
      -- qo'lda kiritilgan yozuv: raqam/oy/davr/summa/kim saqlanadi, faqat akt_id almashadi
      update public.t2_f2_reestr_jami set akt_id = p_akt_id, versiya = versiya + 1, yangilandi = now() where id = v_r.id;
      return jsonb_build_object('ok', true, 'holat', 'kochirildi', 'reestr_id', v_r.id, 'raqam', v_r.raqam, 'qqs_bilan', v_r.qqs_bilan);
    end if;
  end if;

  begin perform public._t2_akt_podval_smeta_v1(p_akt_id, 'smeta', true); exception when others then null; end;
  select p.paket into v_p from public._t2_summa_paket_v1(array[v_a.obyekt_id], 'aktlar', array[p_akt_id]) p limit 1;
  -- summalar yadro (_t2_summa_paket_v1) natijasi: 2 xonaga yadroda yaxlitlangan, qayta hisoblanmaydi.
  v_us := nullif(v_p->>'ustamali', '')::numeric; v_qs := nullif(v_p->>'qqs', '')::numeric;
  v_qb := nullif(v_p->>'qqs_bilan', '')::numeric;
  if v_us is null and v_qb is null then
    if v_found then -- summa hisoblanmadi: yozuv baribir ko'chadi (eski summa qoladi), ikkinchi qator ochilmaydi
      update public.t2_f2_reestr_jami set akt_id = p_akt_id, versiya = versiya + 1, yangilandi = now() where id = v_r.id;
      return jsonb_build_object('ok', true, 'holat', 'kochirildi', 'reestr_id', v_r.id, 'raqam', v_r.raqam, 'ogohlantirish', 'REESTR_SUMMA_YOQ');
    end if;
    return jsonb_build_object('ok', true, 'holat', 'summa_yoq', 'ogohlantirish', 'REESTR_SUMMA_YOQ');
  end if;
  select * into v_o from public.t2_obyekt where id = v_a.obyekt_id;
  v_davr := v_oylar[extract(month from v_a.oy)::int] || ' ' || extract(year from v_a.oy)::int::text;

  if v_found then
    -- avto yozuv: raqam saqlanadi, summa/oy/davr yangi aktdan yangilanadi
    update public.t2_f2_reestr_jami set akt_id = p_akt_id, oy = v_a.oy, davr = v_davr, qqssiz = v_us, qqs = v_qs, qqs_bilan = v_qb,
           holat_matn = v_matn, versiya = versiya + 1, yangilandi = now(), kim = 'avto:koch:' || p_akt_id
     where id = v_r.id;
    return jsonb_build_object('ok', true, 'holat', 'kochirildi', 'reestr_id', v_r.id, 'raqam', v_r.raqam, 'qqs_bilan', v_qb);
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

create or replace function public._t2_f2_reestr_bekor_v1(p_akt_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_r public.t2_f2_reestr_jami%rowtype; v_n bigint; v_res jsonb; v_orig bigint[]; v_a public.t2_akt%rowtype;
begin
  select * into v_r from public.t2_f2_reestr_jami r where r.akt_id = p_akt_id and r.holat = 'faol' order by r.id limit 1;
  if not found then
    -- Bekor bo'lgan akt korrektirovka bo'lsa: u o'zi yozuvni olmagan, asl akt esa allaqachon bekor bo'lib yozuvni (almashtirishni
    -- kutib) ushlab turgan bo'lishi mumkin. Boshqa tirik korrektirovka qolmagan bo'lsa -- yozuv eski qoida bilan yopiladi.
    v_orig := public._t2_f2_reestr_oldingi_v1(p_akt_id);
    if cardinality(v_orig) = 0 then return jsonb_build_object('ok', true, 'holat', 'yoq'); end if;
    select r.* into v_r from public.t2_f2_reestr_jami r join public.t2_akt o on o.id = r.akt_id
     where r.akt_id = any (v_orig) and r.holat = 'faol' and o.holat = 'bekor' order by r.id limit 1;
    if not found then return jsonb_build_object('ok', true, 'holat', 'yoq'); end if;
    perform pg_advisory_xact_lock(hashtextextended('f2_reestr:' || v_r.shartnoma_id, 0));
    if exists (select 1 from public.t2_akt c where c.tur = 'f2' and c.id <> p_akt_id and c.holat <> 'bekor'
                 and (c.correction_of_akt_id = v_r.akt_id or exists (select 1 from public.t2_akt_correction_link l
                        where l.original_akt_id = v_r.akt_id and l.replacement_akt_id = c.id))) then
      return jsonb_build_object('ok', true, 'holat', 'korrektirovka_kutilmoqda', 'reestr_id', v_r.id);
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('f2_reestr:' || v_r.shartnoma_id, 0));
    select a.id into v_n from public.t2_akt a where a.tur = 'f2' and a.holat = 'tasdiqlangan'
      and (a.correction_of_akt_id = p_akt_id or exists (select 1 from public.t2_akt_correction_link l
             where l.original_akt_id = p_akt_id and l.replacement_akt_id = a.id))
      and not exists (select 1 from public.t2_f2_reestr_jami z where z.akt_id = a.id and z.holat = 'faol') order by a.id limit 1;
    if v_n is not null then
      v_res := public._t2_f2_reestr_avto_v1(v_n); -- correction_of_akt_id = shu akt: yozuv yangi aktga ko'chadi
      if coalesce(v_res->>'holat', '') = 'kochirildi' then return v_res; end if;
    end if;
    -- Hali yakunlanmagan (bekor emas, tasdiqlanmagan) korrektirovka bor: yozuv yetim qilinmaydi, u tasdiqlanganda oladi.
    if exists (select 1 from public.t2_akt c where c.tur = 'f2' and c.id <> p_akt_id and c.holat not in ('bekor', 'tasdiqlangan')
                 and (c.correction_of_akt_id = p_akt_id or exists (select 1 from public.t2_akt_correction_link l
                        where l.original_akt_id = p_akt_id and l.replacement_akt_id = c.id))) then
      return jsonb_build_object('ok', true, 'holat', 'korrektirovka_kutilmoqda', 'reestr_id', v_r.id);
    end if;
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

revoke all on function public._t2_f2_reestr_oldingi_v1(bigint) from public, anon, authenticated;
revoke all on function public._t2_f2_reestr_avto_v1(bigint) from public, anon, authenticated;
revoke all on function public._t2_f2_reestr_bekor_v1(bigint) from public, anon, authenticated;

comment on function public._t2_f2_reestr_oldingi_v1(bigint) is 'F-2 korrektirovka zanjiri: asl aktlar id massivi. versiya: texnik';
comment on function public._t2_f2_reestr_avto_v1(bigint) is 'F-2 tasdiqlanganda reestr yozuvi; korrektirovka asl yozuvni oladi. versiya: texnik';
comment on function public._t2_f2_reestr_bekor_v1(bigint) is 'F-2 bekor qilinganda reestr yozuvi; kutilayotgan korrektirovka yozuvni yetim qilmaydi. versiya: texnik';