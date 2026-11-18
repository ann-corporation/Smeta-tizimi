-- T2-OYLIK-PAKET-TEZ-001 - Shartnoma oylik paketi: sahifa BITTA tez so'rov bilan ochiladi; paket tokeni - BITTA yechim, hujjat bo'yicha dedup.
-- Muammo (egasi): sahifa ochilganda brauzer har obyektning to'liq smetasini o'qib, tayyorgarlik bayroqlari (fakt/M-29) uchun har obyektga
-- alohida so'rov yuborardi; paket yig'ilganda esa HAR hujjat uchun alohida token chaqiruvi ketardi.
--   * t2_f2_oylik_paket_v1 - shartnoma + oy: obyektlar -> oy aktlari + fakt aktlar soni + M-29 holati (STABLE, GET /api/sb). Summa YO'Q:
--     summa faqat serverning yagona yadrosidan (t2_f2_portfel_summa_v1 -> _t2_summa_paket_v1), brauzerda hisob yo'q.
--   * t2_token_yangi_xeshlar_v1 - berilgan hujjat xeshlaridan shu kompaniyada HALI to'lanmaganlari (takrorlar ham tushadi).
--   * t2_token_sarfla_v1 - 20261213200000 dagi tana + p_meta.fayl_xeshlar (fayl_yacheykalar bilan bir xil uzunlik): bitta chaqiruvda faqat
--     YANGI hujjatlar to'lanadi, avval to'langanlari (va qaytarilmaganlari) bepul; yangi xeshlar meta.fayl_xeshlar_yangi ga yoziladi.
--     operation_id bo'yicha idempotent, minus balans yo'q, narx formulasi o'zgarmagan (har yangi fayl narxining yig'indisi).

create or replace function public.t2_f2_oylik_paket_v1(p_kompaniya_id bigint, p_actor_id bigint, p_shartnoma_id bigint, p_oy date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare v_oy date; v_oy_oxiri date; v_ob bigint[]; v_res jsonb; v_sh jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  if p_shartnoma_id is null or p_oy is null then return jsonb_build_object('ok', false, 'code', 'KESIM_KERAK'); end if;
  v_oy := date_trunc('month', p_oy)::date;
  v_oy_oxiri := (v_oy + interval '1 month')::date - 1;
  select jsonb_build_object('id', s.id, 'raqam', s.raqam, 'nom', s.nom) into v_sh
    from public.t2_shartnoma s where s.id = p_shartnoma_id and s.kompaniya_id = p_kompaniya_id;
  if v_sh is null then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOT_FOUND'); end if;
  select coalesce(array_agg(o.obyekt_id order by o.obyekt_id), '{}') into v_ob
    from public._t2_shartnoma_obyektlari_v1(p_shartnoma_id) o
    join public.t2_obyekt ob on ob.id = o.obyekt_id and ob.kompaniya_id = p_kompaniya_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ob.id, 'nom', ob.nom,
           'fakt_soni', (select count(*) from public.t2_akt f
                          where f.obyekt_id = ob.id and f.tur = 'fakt' and f.holat <> 'bekor'
                            and coalesce(f.oy, f.sana) >= v_oy and coalesce(f.oy, f.sana) <= v_oy_oxiri),
           'm29', case when exists (select 1 from public.t2_m29_hujjat m where m.obyekt_id = ob.id and m.davr = v_oy and m.holat = 'bajarildi') then 'bajarildi' else 'yoq' end,
           'aktlar', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'raqam', a.raqam, 'holat', a.holat, 'hujjat_jami', a.hujjat_jami) order by a.id)
                                 from public.t2_akt a where a.obyekt_id = ob.id and a.tur = 'f2' and a.oy >= v_oy and a.oy <= v_oy_oxiri), '[]'::jsonb)
         ) order by ob.nom, ob.id), '[]'::jsonb)
    into v_res from public.t2_obyekt ob where ob.id = any(v_ob);
  return jsonb_build_object('ok', true, 'oy', to_char(v_oy, 'YYYY-MM'), 'shartnoma', v_sh, 'obyektlar', v_res);
end $fn$;

revoke all on function public.t2_f2_oylik_paket_v1(bigint, bigint, bigint, date) from public, anon, authenticated;
grant execute on function public.t2_f2_oylik_paket_v1(bigint, bigint, bigint, date) to service_role;

-- Hali to'lanmagan xeshlar (kirish tartibi saqlanadi, takrori bir marta). To'langan = shu kompaniyada, shu amalda, qaytarilmagan sarf harakati:
-- eski yo'l (meta.xesh) yoki paket yo'li (meta.fayl_xeshlar_yangi).
create or replace function public.t2_token_yangi_xeshlar_v1(p_kompaniya_id bigint, p_amal text, p_xeshlar text[]) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare v_tolangan text[]; v_out text[] := '{}'; x text;
begin
  if p_xeshlar is null or cardinality(p_xeshlar) = 0 then return '{}'; end if;
  select coalesce(array_agg(distinct z.e), '{}') into v_tolangan from (
    select h.meta->>'xesh' as e from public.t2_token_harakat h
     where h.kompaniya_id = p_kompaniya_id and h.tur = 'sarf' and h.amal = p_amal and h.meta->>'xesh' = any(p_xeshlar)
       and not exists (select 1 from public.t2_token_harakat q where q.tur = 'qaytarish' and q.bogliq_operation_id = h.operation_id)
    union all
    select y.e from public.t2_token_harakat h
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(h.meta->'fayl_xeshlar_yangi') = 'array' then h.meta->'fayl_xeshlar_yangi' else '[]'::jsonb end) as y(e)
     where h.kompaniya_id = p_kompaniya_id and h.tur = 'sarf' and h.amal = p_amal and jsonb_typeof(h.meta->'fayl_xeshlar_yangi') = 'array' and y.e = any(p_xeshlar)
       and not exists (select 1 from public.t2_token_harakat q where q.tur = 'qaytarish' and q.bogliq_operation_id = h.operation_id)) z;
  foreach x in array p_xeshlar loop
    if x is null or x = any(v_tolangan) or x = any(v_out) then continue; end if;
    v_out := v_out || x;
  end loop;
  return v_out;
end $fn$;

revoke all on function public.t2_token_yangi_xeshlar_v1(bigint, text, text[]) from public, anon, authenticated;
grant execute on function public.t2_token_yangi_xeshlar_v1(bigint, text, text[]) to service_role;

create or replace function public.t2_token_sarfla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_amal text, p_birlik_soni numeric,
  p_operation_id uuid, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev public.t2_token_harakat%rowtype; v_h jsonb; v_narx numeric; v_balans numeric; v_xesh text := nullif(p_meta->>'xesh', '');
  v_fy numeric[]; v_fx text[]; v_yangi text[]; v_yy numeric[] := '{}'; v_qolgan text[]; v_i int; v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into v_prev from public.t2_token_harakat where operation_id = p_operation_id;
  if found then
    if v_prev.kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_BAND'); end if;
    return jsonb_build_object('ok', true, 'takror', true, 'sarflandi', -v_prev.miqdor, 'balans', public.t2_token_balans(p_kompaniya_id));
  end if;
  if jsonb_typeof(v_meta->'fayl_yacheykalar') = 'array' and jsonb_array_length(v_meta->'fayl_yacheykalar') between 1 and 2000 then
    v_fy := array(select e.value::numeric from jsonb_array_elements_text(v_meta->'fayl_yacheykalar') as e);
    v_h := public.t2_token_hisobla_paket_v1(p_amal, v_fy);
  else
    v_h := public.t2_token_hisobla_v2(p_amal, p_birlik_soni);
  end if;
  if v_h is null then return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_token:' || p_kompaniya_id, 0));
  -- PAKET: hujjat bo'yicha dedup. fayl_xeshlar[i] = fayl_yacheykalar[i] hujjatining xeshi; faqat to'lanmagan (va takrorlanmagan) hujjatlar to'lanadi.
  if v_fy is not null and jsonb_typeof(v_meta->'fayl_xeshlar') = 'array' and jsonb_array_length(v_meta->'fayl_xeshlar') = cardinality(v_fy) then
    v_fx := array(select e.value from jsonb_array_elements_text(v_meta->'fayl_xeshlar') as e);
    v_yangi := public.t2_token_yangi_xeshlar_v1(p_kompaniya_id, p_amal, v_fx);
    if cardinality(v_yangi) = 0 then
      return jsonb_build_object('ok', true, 'sarflandi', 0, 'bepul_takror', true, 'hisob', v_h, 'balans', public.t2_token_balans(p_kompaniya_id));
    end if;
    v_qolgan := v_yangi;
    for v_i in 1 .. cardinality(v_fx) loop
      if v_fx[v_i] = any(v_qolgan) then
        v_yy := v_yy || v_fy[v_i];
        v_qolgan := array_remove(v_qolgan, v_fx[v_i]); -- takror xesh ikkinchi marta hisoblanmaydi
      end if;
    end loop;
    v_h := public.t2_token_hisobla_paket_v1(p_amal, v_yy);
    if v_h is null then return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
    v_meta := v_meta || jsonb_build_object('fayl_xeshlar_yangi', to_jsonb(v_yangi), 'fayl_yacheykalar', to_jsonb(v_yy));
  end if;
  v_narx := (v_h->>'token')::numeric;
  -- Bir xil hujjat (mazmun xeshi) shu kompaniyada allaqachon to'langan va qaytarilmagan bo'lsa — qayta to'lov yo'q.
  if v_xesh is not null and exists (
       select 1 from public.t2_token_harakat h
        where h.kompaniya_id = p_kompaniya_id and h.tur = 'sarf' and h.amal = p_amal and h.meta->>'xesh' = v_xesh
          and not exists (select 1 from public.t2_token_harakat q where q.tur = 'qaytarish' and q.bogliq_operation_id = h.operation_id)) then
    return jsonb_build_object('ok', true, 'sarflandi', 0, 'bepul_takror', true, 'hisob', v_h, 'balans', public.t2_token_balans(p_kompaniya_id));
  end if;
  v_balans := public.t2_token_balans(p_kompaniya_id);
  if v_narx > 0 and v_balans < v_narx then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_YETMAYDI', 'kerak', v_narx, 'balans', v_balans, 'hisob', v_h);
  end if;
  if v_narx > 0 then
    insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, birlik_soni, meta, operation_id)
    values (p_kompaniya_id, p_actor_id, -v_narx, 'sarf', p_amal, p_birlik_soni, v_meta || jsonb_build_object('hisob', v_h), p_operation_id);
  end if;
  return jsonb_build_object('ok', true, 'sarflandi', v_narx, 'hisob', v_h, 'balans', v_balans - v_narx);
end $$;
