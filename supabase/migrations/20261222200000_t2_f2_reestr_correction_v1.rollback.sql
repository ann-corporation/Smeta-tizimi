-- Teskari: 20261222200000 dan oldingi (prod) funksiya tanalari aynan tiklanadi; yordamchi funksiya olib tashlanadi.
CREATE OR REPLACE FUNCTION public._t2_f2_reestr_avto_v1(p_akt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public._t2_f2_reestr_bekor_v1(p_akt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

drop function if exists public._t2_f2_reestr_oldingi_v1(bigint);
revoke all on function public._t2_f2_reestr_avto_v1(bigint) from public, anon, authenticated;
revoke all on function public._t2_f2_reestr_bekor_v1(bigint) from public, anon, authenticated;
comment on function public._t2_f2_reestr_avto_v1(bigint) is null;
comment on function public._t2_f2_reestr_bekor_v1(bigint) is null;
