-- 20270116000001_t2_bitta_f2_qoidasi_v1
-- Voqea (egasi, 2026-11-19): bir obyektda bir oy uchun IKKITA F-2 qoralama bor edi (asosiy + «TAXMINIY-... (prorab tasdig'i kutilmoqda)»),
-- ba'zi qatorlari bir xil qator_id; ikkalasi texnadzorga ketdi. Qoida: obyekt x oy = TO'G'RI BITTA F-2 (storno/korrektirovka istisno).
-- 1) _t2_f2_taxminiy_v1: raqam/izoh «taxminiy / prorab tasdig'i» belgisi -> tashqi paketga hech qachon kirmaydi.
-- 2) _t2_f2_oy_takror_v1: bir obyekt+oy da bekor qilinmagan >1 F-2 (korrektirovka/almashtiruvchi akt hisobga olinmaydi).
-- 3) t2_f2_oy_takror_v1 (RPC, o'qish) + t2_f2_oylik_paket_v1 (takror/taxminiy belgilari bilan) — paket yig'ish rad etadi.
-- 4) t2_forma3_yarat_v1 (langar bilan): takror bo'lsa FORMA3_F2_TAKROR (akt idlari bilan).
-- 5) t2_f2_qoralama_yangila_v1 + t2_akt_yarat_v2 (langar bilan): boshqa QORALAMA F-2 (shu obyekt+oy) bilan bir xil qator_id -> F2_OY_QATOR_TAKROR.
-- Pul summalari o'zgarmaydi. Applied: YO'Q (L0 qo'llaydi: avval ROLLBACK sinov).
-- versiya: texnik (t2_qator o'qilmaydi; faqat akt/akt_qator).

create or replace function public._t2_f2_taxminiy_v1(p_raqam text, p_izoh text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_raqam, '') ~* '(taxminiy|prorab)' or coalesce(p_izoh, '') ~* 'prorab\s+tasdig'
$$;

create or replace function public._t2_f2_oy_takror_v1(p_obyekt_ids bigint[], p_oy date, p_akt_ids bigint[] default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('obyekt_id', g.obyekt_id, 'oy', to_char(g.oy, 'YYYY-MM'), 'akt_ids', to_jsonb(g.ids),
                                                'taxminiy_ids', to_jsonb(g.tx)) order by g.obyekt_id, g.oy), '[]'::jsonb)
  from (
    select a.obyekt_id, date_trunc('month', a.oy)::date as oy, array_agg(a.id order by a.id) as ids,
           coalesce(array_agg(a.id order by a.id) filter (where public._t2_f2_taxminiy_v1(a.raqam, a.izoh)), '{}'::bigint[]) as tx
      from public.t2_akt a
     where a.tur = 'f2' and a.holat <> 'bekor' and coalesce(a.lifecycle_status, '') not in ('cancelled', 'superseded')
       and (p_obyekt_ids is null or a.obyekt_id = any(p_obyekt_ids))
       and (p_oy is null or date_trunc('month', a.oy) = date_trunc('month', p_oy))
       and a.correction_of_akt_id is null
       and not exists (select 1 from public.t2_akt_correction_link l where l.replacement_akt_id = a.id)
       -- storno F-2 (qatorlari raw_snapshot.source = 'storno') — bir oyda ikkinchi F-2 bo'lishi qoidaga muvofiq.
       and not exists (select 1 from public.t2_akt_qator s where s.akt_id = a.id and s.raw_snapshot->>'source' = 'storno')
     group by 1, 2
    having count(*) > 1
  ) g
  where p_akt_ids is null or exists (select 1 from public.t2_akt z where z.id = any(p_akt_ids) and z.obyekt_id = g.obyekt_id
                                      and date_trunc('month', z.oy)::date = g.oy)
$$;

-- O'qish RPC: UI (F-2 ro'yxati bannerlari) uchun.
create or replace function public.t2_f2_oy_takror_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_ids bigint[], p_oy date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare v_ob bigint[];
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  select coalesce(array_agg(o.id), '{}') into v_ob from public.t2_obyekt o
   where o.kompaniya_id = p_kompaniya_id and (p_obyekt_ids is null or o.id = any(p_obyekt_ids));
  return jsonb_build_object('ok', true, 'takrorlar', public._t2_f2_oy_takror_v1(v_ob, p_oy));
end $fn$;

-- Paket RPC: har obyektga 'takror' (bir oyda >1 F-2) va har aktga 'taxminiy' belgisi qo'shiladi; qolgani o'zgarmagan.
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
           'takror', public._t2_f2_oy_takror_v1(array[ob.id], v_oy),
           'aktlar', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'raqam', a.raqam, 'holat', a.holat, 'hujjat_jami', a.hujjat_jami,
                                                                  'taxminiy', public._t2_f2_taxminiy_v1(a.raqam, a.izoh)) order by a.id)
                                 from public.t2_akt a where a.obyekt_id = ob.id and a.tur = 'f2' and a.oy >= v_oy and a.oy <= v_oy_oxiri), '[]'::jsonb)
         ) order by ob.nom, ob.id), '[]'::jsonb)
    into v_res from public.t2_obyekt ob where ob.id = any(v_ob);
  return jsonb_build_object('ok', true, 'oy', to_char(v_oy, 'YYYY-MM'), 'shartnoma', v_sh, 'obyektlar', v_res);
end $fn$;

-- Qator_id kesishuvi: shu obyekt+oy dagi BOSHQA qoralama F-2 larda bir xil qator (storno qatorlari hisobga olinmaydi). Yo'q bo'lsa NULL.
create or replace function public._t2_f2_qator_kesish_v1(p_obyekt_id bigint, p_oy date, p_qatorlar jsonb, p_akt_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('akt_ids', to_jsonb(array_agg(distinct aq.akt_id)), 'qator_ids', to_jsonb(array_agg(distinct aq.qator_id)))
    from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
   where a.tur = 'f2' and a.holat = 'qoralama' and a.obyekt_id = p_obyekt_id
     and date_trunc('month', a.oy) = date_trunc('month', p_oy)
     and a.id is distinct from p_akt_id
     and coalesce(aq.raw_snapshot->>'source', '') <> 'storno'
     and aq.qator_id in (select (x->>'qator_id')::bigint from jsonb_array_elements(p_qatorlar) x
                          where nullif(x->>'qator_id', '') is not null and coalesce(x->'raw_snapshot'->>'source', x->>'source', '') <> 'storno')
  having count(*) > 0
$$;

-- Langarlar (mavjud funksiya tanasiga aynan 1 marta qo'shiladi; topilmasa — to'xtaydi).
do $y$
declare d text; a text; b text;
begin
  -- t2_f2_qoralama_yangila_v1
  d := replace(pg_get_functiondef('public.t2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)'::regprocedure), E'\r\n', E'\n');
  if position('bitta_f2_qoidasi_20270116' in d) > 0 then raise exception 'BITTA_F2: yangila allaqachon yangilangan'; end if;
  a := E'if public._t2_f2_takror_xato(p_qatorlar) then\n    return jsonb_build_object(''ok'', false, ''code'', ''DUPLICATE_F2_SOURCE_LINE'');\n  end if;';
  if (length(d) - length(replace(d, a, ''))) <> length(a) then raise exception 'BITTA_F2: yangila langari aynan 1 marta topilmadi'; end if;
  d := replace(d, a, a || E'\n'
    || E'  -- bitta_f2_qoidasi_20270116: shu obyekt+oy da boshqa qoralama F-2 bilan bir xil qator -> ikki marta hisob.\n'
    || E'  if public._t2_f2_qator_kesish_v1(v_akt.obyekt_id, v_akt.oy, p_qatorlar, p_akt_id) is not null then\n'
    || E'    return jsonb_build_object(''ok'', false, ''code'', ''F2_OY_QATOR_TAKROR'',\n'
    || E'      ''xabar'', ''Bu obyektda shu oy uchun boshqa F-2 qoralamada bir xil qatorlar bor. Obyekt x oy = bitta F-2: avval ortiqcha qoralamani bekor qiling yoki birlashtiring.'',\n'
    || E'      ''kesish'', public._t2_f2_qator_kesish_v1(v_akt.obyekt_id, v_akt.oy, p_qatorlar, p_akt_id));\n'
    || E'  end if;');
  execute d;

  -- t2_akt_yarat_v2
  d := replace(pg_get_functiondef('public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)'::regprocedure), E'\r\n', E'\n');
  if position('bitta_f2_qoidasi_20270116' in d) > 0 then raise exception 'BITTA_F2: yarat_v2 allaqachon yangilangan'; end if;
  if (length(d) - length(replace(d, a, ''))) <> length(a) then raise exception 'BITTA_F2: yarat_v2 langari aynan 1 marta topilmadi'; end if;
  d := replace(d, a, a || E'\n'
    || E'  -- bitta_f2_qoidasi_20270116: shu obyekt+oy da boshqa qoralama F-2 bilan bir xil qator -> ikki marta hisob.\n'
    || E'  if public._t2_f2_qator_kesish_v1(p_obyekt_id, p_oy, p_qatorlar, null) is not null then\n'
    || E'    return jsonb_build_object(''ok'', false, ''code'', ''F2_OY_QATOR_TAKROR'',\n'
    || E'      ''xabar'', ''Bu obyektda shu oy uchun boshqa F-2 qoralamada bir xil qatorlar bor. Obyekt x oy = bitta F-2: mavjud qoralamani yangilang.'',\n'
    || E'      ''kesish'', public._t2_f2_qator_kesish_v1(p_obyekt_id, p_oy, p_qatorlar, null));\n'
    || E'  end if;');
  execute d;

  -- t2_forma3_yarat_v1
  d := replace(pg_get_functiondef('public.t2_forma3_yarat_v1(bigint,bigint,bigint,bigint,date,date,bigint[],text,uuid)'::regprocedure), E'\r\n', E'\n');
  if position('bitta_f2_qoidasi_20270116' in d) > 0 then raise exception 'BITTA_F2: forma3 allaqachon yangilangan'; end if;
  b := E'  -- 20261211000000: bitta F2 ikki marta Forma 3 ga kirmaydi.';
  if (length(d) - length(replace(d, b, ''))) <> length(b) then raise exception 'BITTA_F2: forma3 langari aynan 1 marta topilmadi'; end if;
  d := replace(d, b, E'  -- bitta_f2_qoidasi_20270116: obyekt x oy da bekor qilinmagan >1 F-2 (korrektirovkadan tashqari) bo''lsa Forma 3 yaratilmaydi.\n'
    || E'  if public._t2_f2_oy_takror_v1(null, null, p_akt_ids) <> ''[]''::jsonb then\n'
    || E'    return jsonb_build_object(''ok'',false,''code'',''FORMA3_F2_TAKROR'',\n'
    || E'      ''xato'',''Bu obyekt/oy uchun bir nechta F-2 bor (taxminiy qoralama bo''''lishi mumkin). Avval ortiqcha F-2 ni bekor qiling'',\n'
    || E'      ''takrorlar'', public._t2_f2_oy_takror_v1(null, null, p_akt_ids));\n'
    || E'  end if;\n' || b);
  execute d;
end $y$;

revoke all on function public._t2_f2_taxminiy_v1(text, text) from public, anon, authenticated;
revoke all on function public._t2_f2_oy_takror_v1(bigint[], date, bigint[]) from public, anon, authenticated;
revoke all on function public._t2_f2_qator_kesish_v1(bigint, date, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.t2_f2_oy_takror_v1(bigint, bigint, bigint[], date) from public, anon, authenticated;
grant execute on function public.t2_f2_oy_takror_v1(bigint, bigint, bigint[], date) to service_role;
revoke all on function public.t2_f2_oylik_paket_v1(bigint, bigint, bigint, date) from public, anon, authenticated;
grant execute on function public.t2_f2_oylik_paket_v1(bigint, bigint, bigint, date) to service_role;

comment on function public._t2_f2_taxminiy_v1(text, text) is 'F-2 raqam/izoh «taxminiy / prorab tasdig''i» belgisi. versiya: texnik';
comment on function public._t2_f2_oy_takror_v1(bigint[], date, bigint[]) is 'Obyekt x oy da bekor qilinmagan >1 F-2 (korrektirovkasiz). versiya: texnik';
comment on function public._t2_f2_qator_kesish_v1(bigint, date, jsonb, bigint) is 'Boshqa qoralama F-2 bilan bir xil qator_id kesishuvi. versiya: texnik';
comment on function public.t2_f2_oy_takror_v1(bigint, bigint, bigint[], date) is 'Bir oyda >1 F-2 bo''lgan obyektlar (UI banner). versiya: texnik';
