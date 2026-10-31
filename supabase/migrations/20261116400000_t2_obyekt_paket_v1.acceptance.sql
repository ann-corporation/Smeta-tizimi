-- Acceptance: 20261116400000 — obyekt paketi. BEGIN … ROLLBACK (faqat o'qiydi).
--   P0 huquq: faqat service_role; STABLE + SECURITY DEFINER; probe bor.
--   P1 dekod qilingan paket = t2_daraxt (ikki tomonga EXCEPT, qator ustunlari) va = t2_qator_holat (faqat faol,
--      xom ustunlar + mijoz hosila formulalari: smeta_*, qoldiq_*, f2_mumkin_*) — eng katta 3 obyekt + almashtirilgan
--      qatorli 2 obyekt. rev = t2_obyekt_rev.rev; soni = faol qatorlar soni.
--   P2 a'zo bo'lmagan aktor rad etiladi (42501).
begin;
do $acc$
declare
  v_a bigint; v_o bigint; v_j jsonb; v_p jsonb; r record; v_begona bigint; v_rad boolean;
begin
  if has_function_privilege('authenticated', 'public.t2_obyekt_paket_v1(bigint,bigint)', 'execute')
     or has_function_privilege('anon', 'public.t2_obyekt_rev_v1(bigint,bigint)', 'execute') then raise exception 'P0: anon/authenticated chaqira oladi'; end if;
  if not has_function_privilege('service_role', 'public.t2_obyekt_paket_v1(bigint,bigint)', 'execute') then raise exception 'P0: service_role chaqira olmaydi'; end if;
  if (select provolatile from pg_proc where oid = 'public.t2_obyekt_paket_v1(bigint,bigint)'::regprocedure) <> 's'
     or not (select prosecdef from pg_proc where oid = 'public.t2_obyekt_paket_v1(bigint,bigint)'::regprocedure) then
    raise exception 'P0: paket STABLE SECURITY DEFINER emas';
  end if;

  select f.id into v_a from public.t2_foydalanuvchi f where f.holat = 'faol' and public.t2_platforma_superadmin(f.id) order by f.id limit 1;
  if v_a is null then raise notice 'superadmin aktor yo''q — funksional tekshiruv o''tkazib yuborildi'; return; end if;

  for v_o in
    (select obyekt_id from public.t2_qator where versiya_holat = 'faol' group by obyekt_id order by count(*) desc limit 3)
    union
    (select obyekt_id from public.t2_qator where versiya_holat = 'almashtirilgan' group by obyekt_id order by count(*) desc limit 2)
  loop
    v_j := public.t2_obyekt_paket_v1(v_o, v_a)::jsonb;
    v_p := public.t2_obyekt_rev_v1(v_o, v_a)::jsonb;
    if (v_j->>'format') <> 't2-paket/1' or (v_j->>'obyekt_id')::bigint <> v_o then raise exception 'P1 %: format/obyekt_id', v_o; end if;
    if (v_j->>'rev')::bigint is distinct from (select rev from public.t2_obyekt_rev where obyekt_id = v_o)
       or (v_p->>'rev') <> (v_j->>'rev') or (v_p->>'meta_rev') <> (v_j->>'meta_rev') then raise exception 'P1 %: rev mos emas', v_o; end if;
    if (v_j->>'soni')::int <> (select count(*) from public.t2_qator where obyekt_id = v_o and versiya_holat = 'faol') then raise exception 'P1 %: soni', v_o; end if;
    with pk as (select v_j j),
    l as (select
       array(select e from jsonb_array_elements_text(j->'lugat'->'nom') with ordinality t(e, o) order by o) nom,
       array(select e from jsonb_array_elements_text(j->'lugat'->'kod') with ordinality t(e, o) order by o) kod,
       array(select e from jsonb_array_elements_text(j->'lugat'->'birlik') with ordinality t(e, o) order by o) birlik,
       array(select e from jsonb_array_elements_text(j->'lugat'->'kat') with ordinality t(e, o) order by o) kat,
       array(select e from jsonb_array_elements_text(j->'lugat'->'tur') with ordinality t(e, o) order by o) tur
      from pk),
    c as (select (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'id') with ordinality t(e, o))::bigint[] id,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'ota_id') with ordinality t(e, o))::bigint[] ota_id,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'daraja') with ordinality t(e, o))::smallint[] daraja,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'tartib') with ordinality t(e, o))::int[] tartib,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'tur') with ordinality t(e, o))::int[] tur,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'kat') with ordinality t(e, o))::int[] kat,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'kod') with ordinality t(e, o))::int[] kod,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'nom') with ordinality t(e, o))::int[] nom,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'birlik') with ordinality t(e, o))::int[] birlik,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'hajm') with ordinality t(e, o))::numeric[] hajm,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'narx') with ordinality t(e, o))::numeric[] narx,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'summa') with ordinality t(e, o))::numeric[] summa,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'norma') with ordinality t(e, o))::numeric[] norma,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'narx_usul') with ordinality t(e, o)) narx_usul,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'versiya') with ordinality t(e, o))::int[] versiya,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'qoshimcha') with ordinality t(e, o))::int[] qoshimcha,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'q'->'zamena') with ordinality t(e, o))::int[] zamena,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'h'->'fakt_hajm') with ordinality t(e, o))::numeric[] fakt_hajm,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'h'->'fakt_summa') with ordinality t(e, o))::numeric[] fakt_summa,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'h'->'f2_hajm') with ordinality t(e, o))::numeric[] f2_hajm,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'h'->'f2_summa') with ordinality t(e, o))::numeric[] f2_summa,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'h'->'f2_summa_nomalum') with ordinality t(e, o))::bigint[] f2_summa_nomalum,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'h'->'direct_fakt_hajm') with ordinality t(e, o))::numeric[] direct_fakt_hajm,
       (select array_agg(e order by o) from jsonb_array_elements_text(j->'h'->'fakt_manbasi') with ordinality t(e, o))::int[] fakt_manbasi,
       (select coalesce(jsonb_object_agg(k, v), '{}') from jsonb_each_text(j->'q'->'xom_qator') t(k, v)) xq,
       (select coalesce(jsonb_object_agg(k, v), '{}') from jsonb_each_text(j->'h'->'almashtirilgan_hajm') t(k, v)) ah,
       j->'h'->'almashtirilgan_summa' asm,
       (j->>'soni')::int soni
      from pk),
    xq as (select k::bigint id, v::int x from c, jsonb_each_text(c.xq) t(k, v)),
    ah as (select k::bigint id, v::numeric x from c, jsonb_each_text(c.ah) t(k, v)),
    asm as (select k::bigint id, v::numeric x from c, jsonb_each_text(c.asm) t(k, v)),
    dq as (select c.id[i] id, c.ota_id[i] ota_id, c.daraja[i] daraja, c.tartib[i] tartib, l.tur[c.tur[i] + 1] tur, l.kat[c.kat[i] + 1] kat,
                  l.kod[c.kod[i] + 1] kod, l.nom[c.nom[i] + 1] nom, l.birlik[c.birlik[i] + 1] birlik, c.hajm[i] hajm, c.narx[i] narx,
                  c.summa[i] summa, c.norma[i] norma, c.narx_usul[i] narx_usul, c.versiya[i] versiya, c.qoshimcha[i] = 1 qoshimcha,
                  c.zamena[i] = 1 zamena, xq.x xom_qator
             from c cross join l cross join generate_series(1, c.soni) i left join xq on xq.id = c.id[i]),
    dh as (select c.id[i] qator_id, c.hajm[i] smeta_hajm, c.summa[i] smeta_summa, c.fakt_hajm[i] fakt_hajm, c.fakt_summa[i] fakt_summa,
                  c.f2_hajm[i] f2_hajm, c.f2_summa[i] f2_summa, c.f2_summa_nomalum[i] f2_summa_nomalum, c.direct_fakt_hajm[i] direct_fakt_hajm,
                  case c.fakt_manbasi[i] when 1 then 'BL_NORMA' else 'DIRECT' end fakt_manbasi,
                  coalesce(ah.x, 0) almashtirilgan_hajm, case when asm.id is null then 0 else asm.x end almashtirilgan_summa
             from c cross join generate_series(1, c.soni) i left join ah on ah.id = c.id[i] left join asm on asm.id = c.id[i]),
    dh2 as (select dh.*, smeta_hajm - f2_hajm - almashtirilgan_hajm qoldiq_hajm, smeta_summa - f2_summa - coalesce(almashtirilgan_summa, 0) qoldiq_summa,
                   greatest(fakt_hajm - f2_hajm, 0) f2_mumkin_hajm, greatest(fakt_summa - f2_summa, 0) f2_mumkin_summa from dh),
    ref as materialized (select id, ota_id, daraja, tartib, tur, kat, kod, nom, birlik, hajm, narx, summa, norma, narx_usul, versiya, qoshimcha, zamena, xom_qator
              from public.t2_daraxt where obyekt_id = (select (j->>'obyekt_id')::bigint from pk)),
    refh as materialized (select qator_id, smeta_hajm, smeta_summa, fakt_hajm, fakt_summa, f2_hajm, f2_summa, f2_summa_nomalum, direct_fakt_hajm, fakt_manbasi,
                    almashtirilgan_hajm, almashtirilgan_summa, qoldiq_hajm, qoldiq_summa, f2_mumkin_hajm, f2_mumkin_summa
               from public.t2_qator_holat where obyekt_id = (select (j->>'obyekt_id')::bigint from pk) and versiya_holat = 'faol')
    select (select count(*) from dq) n, (select count(*) from ref) n_ref,
           (select count(*) from (select * from dq except select * from ref) a) q_paket_minus_ref,
           (select count(*) from (select * from ref except select * from dq) b) q_ref_minus_paket,
           (select count(*) from (select * from dh2 except select * from refh) d) h_paket_minus_ref,
           (select count(*) from (select * from refh except select * from dh2) e) h_ref_minus_paket,
           (select count(*) from ah) alm, (select count(*) from dh where fakt_manbasi = 'BL_NORMA') bl_norma
    into r;
    if r.n <> r.n_ref or r.q_paket_minus_ref <> 0 or r.q_ref_minus_paket <> 0 or r.h_paket_minus_ref <> 0 or r.h_ref_minus_paket <> 0 then
      raise exception 'P1 %: paket <> t2_daraxt/t2_qator_holat: %', v_o, row_to_json(r);
    end if;
    raise notice 'P1 obyekt %: % qator, EXCEPT 0/0/0/0 (almashtirilgan % ta, BL_NORMA % ta)', v_o, r.n, r.alm, r.bl_norma;
  end loop;

  -- P2: a'zo bo'lmagan oddiy foydalanuvchi.
  select f.id into v_begona from public.t2_foydalanuvchi f
   where f.holat = 'faol' and not public.t2_platforma_superadmin(f.id)
     and not exists (select 1 from public.t2_azolik a join public.t2_obyekt o on o.kompaniya_id = a.kompaniya_id
                      where a.foydalanuvchi_id = f.id and a.holat = 'faol' and o.id = v_o)
   limit 1;
  if v_begona is not null then
    v_rad := false;
    begin perform public.t2_obyekt_paket_v1(v_o, v_begona); exception when insufficient_privilege then v_rad := true; end;
    if not v_rad then raise exception 'P2: begona aktor paketni oldi'; end if;
    v_rad := false;
    begin perform public.t2_obyekt_rev_v1(v_o, v_begona); exception when insufficient_privilege then v_rad := true; end;
    if not v_rad then raise exception 'P2: begona aktor probe oldi'; end if;
  end if;
  raise notice 'ACCEPT OK: 20261116400000_t2_obyekt_paket_v1';
end $acc$;
rollback;