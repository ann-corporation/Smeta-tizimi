-- 20261114700000 — SMETA VERSIYASINI FAOLLASHTIRISH (L0 §A, 2026-10-29; PR claude/smeta-versiya-faollashtir).
--
-- MUAMMO: F2/fakt bog'langan obyektda ekspertiza smetasi yozilmaydi — import guard (SMETA_ALREADY_EXISTS), tozalash
-- bloklangan (asl smeta const, F2 muhrlangan), AddRepl esa bitta-bitta narxsiz qoralama qator yaratadi.
--
-- YECHIM (mavjud infratuzilma ustiga, dublikat yo'q):
--   * t2_qator.versiya_holat ('faol' | 'almashtirilgan') + almashtirgan_versiya_id. Eski qatorlar O'CHIRILMAYDI va
--     maydonlari o'zgarmaydi (muhr, F2/fakt akt_qator bog'lanishi, tarix — o'z joyida); faqat holat belgisi.
--   * Eski smeta t2_smeta_versiya (tur 'dastlabki') sifatida saqlanadi: pozitsiyalari (bl + rz ostidagi mustaqil mat/ob)
--     t2_smeta_versiya_pozitsiya ga, yangi (faol) qatorlar bilan moslik t2_smeta_versiya_moslik ga — mavjud ma'no
--     bilan: pozitsiya = versiya (eski), qator = joriy (yangi); 'ochirilgan' = eski bor, yangida yo'q (qurilgan bo'lsa —
--     mavjud da'vo oqimi); 'yangi' = faqat yangida. Bu pereraschet ro'yxati.
--   * Yangi qatorlar MAVJUD import yakunlovchi bilan yoziladi (t2_smeta_import_yakunla_unlocked_v1: kat_hujjat_blok,
--     norma, ierarxiya, rollup, audit) — parallel insert yo'q.
--   * Faqat SMETA hajmi/summasi «faol» filtrini oladi: obyekt jami (t2_obyekt_jami), ustama (t2_obyekt_nakrutka),
--     Nakopitelniy smeta jami va qoldig'i. BAJARILGAN (F2/fakt) hamma qatorlar bo'yicha qoladi — almashtirilgan
--     qatordagi tasdiqlangan F2 «avvalgi versiya bo'yicha bajarilgan» bo'lib bir marta sanaladi (pul yo'qolmaydi,
--     ikki marta sanalmaydi); almashtirilgan qator qoldig'i 0.
--   * Almashtirilgan qatorga YANGI akt_qator (fakt/F2) yozilmaydi (trigger).
-- F2 bog'liqsiz obyektlar natijasi O'ZGARMAYDI: barcha qatorlar sukut bilan 'faol'.
begin;

-- ───────────── 1. Ustunlar ─────────────
alter table public.t2_qator add column if not exists versiya_holat text not null default 'faol';
alter table public.t2_qator add column if not exists almashtirgan_versiya_id bigint references public.t2_smeta_versiya(id);
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_qator_versiya_holat_ck') then
    alter table public.t2_qator add constraint t2_qator_versiya_holat_ck
      check (versiya_holat in ('faol','almashtirilgan') and ((versiya_holat = 'almashtirilgan') = (almashtirgan_versiya_id is not null)));
  end if;
end $c$;
create index if not exists t2_qator_almashtirilgan_ix on public.t2_qator(obyekt_id) where versiya_holat = 'almashtirilgan';
comment on column public.t2_qator.versiya_holat is
  'faol — amaldagi smeta; almashtirilgan — t2_smeta_versiya_faollashtir_v1 bilan yangi versiya bilan almashtirilgan (o''chirilmaydi, F2/fakt tarixi saqlanadi; smeta jamilariga kirmaydi).';

-- ───────────── 2. View / funksiya patchlari (anchor — aynan bir marta) ─────────────
do $p$
declare d text; v text;
  procedure_ text;
begin
  -- 2.1 t2_obyekt_jami — faqat faol qatorlar
  v := pg_get_viewdef('public.t2_obyekt_jami'::regclass, true);
  if (length(v) - length(replace(v, 'WHERE q.obyekt_id = o.id) a ON true', ''))) <> length('WHERE q.obyekt_id = o.id) a ON true') then
    raise exception 'ANCHOR_NOT_FOUND_ONCE: t2_obyekt_jami';
  end if;
  execute 'create or replace view public.t2_obyekt_jami as ' ||
    replace(v, 'WHERE q.obyekt_id = o.id) a ON true', 'WHERE q.obyekt_id = o.id AND q.versiya_holat = ''faol''::text) a ON true');

  -- 2.2 t2_obyekt_nakrutka — kategoriya jamilari faqat faol qatorlardan
  v := pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true);
  d := $a$WHERE q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])
          GROUP BY q.obyekt_id$a$;
  if (length(v) - length(replace(v, d, ''))) <> length(d) then raise exception 'ANCHOR_NOT_FOUND_ONCE: t2_obyekt_nakrutka'; end if;
  execute 'create or replace view public.t2_obyekt_nakrutka as ' ||
    replace(v, d, $b$WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.versiya_holat = 'faol'::text
          GROUP BY q.obyekt_id$b$);

  -- 2.3 t2_qator_holat — versiya_holat ustuni (oxiriga; frontend faol filtrini qo'yadi)
  v := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  d := $a$t2_almashtirilgan_summa_hisob(al.v, q.hajm, q.narx, q.summa) AS almashtirilgan_summa
   FROM t2_qator q$a$;
  if (length(v) - length(replace(v, d, ''))) <> length(d) then raise exception 'ANCHOR_NOT_FOUND_ONCE: t2_qator_holat'; end if;
  execute 'create or replace view public.t2_qator_holat as ' ||
    replace(v, d, $b$t2_almashtirilgan_summa_hisob(al.v, q.hajm, q.narx, q.summa) AS almashtirilgan_summa,
    q.versiya_holat
   FROM t2_qator q$b$);

  -- 2.3b t2_daraxt — smeta daraxti (smeta/fakt/F2 tayyorlash/RES vedomost sahifalari) faqat faol versiya
  v := pg_get_viewdef('public.t2_daraxt'::regclass, true);
  d := 'JOIN t2_obyekt o ON o.id = q.obyekt_id;';
  if (length(v) - length(replace(v, d, ''))) <> length(d) then raise exception 'ANCHOR_NOT_FOUND_ONCE: t2_daraxt'; end if;
  execute 'create or replace view public.t2_daraxt as ' ||
    replace(v, d, E'JOIN t2_obyekt o ON o.id = q.obyekt_id\n  WHERE q.versiya_holat = ''faol''::text;');

  -- 2.4 t2_nakopitelniy_v2 — smeta jami/qoldiq faqat faol; bajarilgan hamma qatorlardan; almashtirilgan qoldig'i 0
  select pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure) into d;
  if position('versiya_faollashtir_v1' in d) > 0 then raise exception 'ALREADY_PATCHED: t2_nakopitelniy_v2'; end if;
  foreach procedure_ in array array[
    $x$'tur', q.tur, 'kat', q.kat,$x$,
    $x$'qoldiq_hajm',  coalesce(q.hajm,0)$x$,
    $x$'qoldiq_summa', coalesce(q.summa,0)$x$,
    $x$where (not v_faol or$x$,
    $x$coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob')),0) as smeta_summa,$x$,
    $x$count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null) as smeta_summa_nomalum,$x$,
    $x$select count(*) into v_qcount from public.t2_qator where obyekt_id = p_obyekt_id;$x$,
    $x$from public.t2_qator o where o.obyekt_id = p_obyekt_id and o.tur in ('rs','mat','ob')$x$
  ] loop
    if (length(d) - length(replace(d, procedure_, ''))) <> length(procedure_) then
      raise exception 'ANCHOR_NOT_FOUND_ONCE: t2_nakopitelniy_v2: %', procedure_;
    end if;
  end loop;
  d := replace(d, $x$'tur', q.tur, 'kat', q.kat,$x$, $x$'tur', q.tur, 'kat', q.kat, 'versiya_holat', q.versiya_holat,$x$);
  d := replace(d, $x$'qoldiq_hajm',  coalesce(q.hajm,0)$x$,
    $x$'qoldiq_hajm',  case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0) + coalesce(al.v,0) else coalesce(q.hajm,0) end$x$);
  d := replace(d, $x$'qoldiq_summa', coalesce(q.summa,0)$x$,
    $x$'qoldiq_summa', case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0) + coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0) else coalesce(q.summa,0) end$x$);
  d := replace(d, $x$where (not v_faol or$x$,
    $x$where ((not v_faol and (q.versiya_holat = 'faol' or coalesce(p.oldingi_hajm,0) <> 0 or coalesce(p.joriy_hajm,0) <> 0 or coalesce(p.fakt_hajm,0) <> 0 or coalesce(p.joriy_qoralama_summa,0) <> 0)) or$x$);
  d := replace(d, $x$coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob')),0) as smeta_summa,$x$,
    $x$coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol'),0) as smeta_summa,$x$);
  d := replace(d, $x$count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null) as smeta_summa_nomalum,$x$,
    $x$count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null and q.versiya_holat = 'faol') as smeta_summa_nomalum,$x$);
  d := replace(d, $x$select count(*) into v_qcount from public.t2_qator where obyekt_id = p_obyekt_id;$x$,
    $x$select count(*) into v_qcount from public.t2_qator where obyekt_id = p_obyekt_id and versiya_holat = 'faol'; -- versiya_faollashtir_v1$x$);
  d := replace(d, $x$from public.t2_qator o where o.obyekt_id = p_obyekt_id and o.tur in ('rs','mat','ob')$x$,
    $x$from public.t2_qator o where o.obyekt_id = p_obyekt_id and o.tur in ('rs','mat','ob') and o.versiya_holat = 'faol'$x$);
  execute d;

  -- 2.5 import yakunlovchi guard: faqat FAOL qatorlar «smeta bor» hisoblanadi (faollashtirish shu yakunlovchini chaqiradi)
  select pg_get_functiondef('public.t2_smeta_import_yakunla_unlocked_v1(bigint,bigint,bigint)'::regprocedure) into d;
  procedure_ := $x$if exists (select 1 from public.t2_qator where obyekt_id = v_sessiya.obyekt_id) then$x$;
  if (length(d) - length(replace(d, procedure_, ''))) <> length(procedure_) then raise exception 'ANCHOR_NOT_FOUND_ONCE: yakunla guard'; end if;
  execute replace(d, procedure_, $x$if exists (select 1 from public.t2_qator where obyekt_id = v_sessiya.obyekt_id and versiya_holat = 'faol') then$x$);
end $p$;

-- ───────────── 3. Almashtirilgan qatorga yangi akt_qator yo'q ─────────────
create or replace function public.t2_akt_qator_versiya_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.t2_qator q where q.id = new.qator_id and q.versiya_holat = 'almashtirilgan') then
    raise exception 'QATOR_ALMASHTIRILGAN: qator % yangi smeta versiyasi bilan almashtirilgan — fakt/F2 faqat faol qatorlarga', new.qator_id
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists t2_akt_qator_versiya_guard_trg on public.t2_akt_qator;
create trigger t2_akt_qator_versiya_guard_trg before insert on public.t2_akt_qator
  for each row execute function public.t2_akt_qator_versiya_guard();

-- ───────────── 4. RPC ─────────────
create or replace function public.t2_smeta_versiya_faollashtir_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_qatorlar jsonb, p_manba jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '600s' as $$
declare
  v_prev jsonb; v_versiya bigint; v_sess bigint; v_n integer; v_eski integer; v_res jsonb; v_rev bigint;
  v_bolak integer; v_moslik jsonb; v_out jsonb; v_manba jsonb := coalesce(p_manba, '{}'::jsonb);
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  perform public.t2_smeta_import_ruxsat(p_kompaniya_id, p_actor_id);
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || '{"takror":true}'::jsonb; end if;
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok',false,'code','OBJECT_ACCESS_DENIED');
  end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 then
    return jsonb_build_object('ok',false,'code','ROWS_REQUIRED');
  end if;
  if jsonb_typeof(v_manba) <> 'object' then return jsonb_build_object('ok',false,'code','MANBA_INVALID'); end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x where coalesce(x->>'tur','') not in ('rz','bl','rs','mat','ob')) then
    return jsonb_build_object('ok',false,'code','ROW_TYPE_INVALID');
  end if;
  if exists (select 1 from (select x->>'local_id' l, count(*) n from jsonb_array_elements(p_qatorlar) x group by 1) d where d.l is null or d.l = '' or d.n > 1) then
    return jsonb_build_object('ok',false,'code','DUPLICATE_LOCAL_ID');
  end if;
  if (v_manba->>'source_document_id') is not null and not exists (
      select 1 from public.t2_document_registry d where d.id = (v_manba->>'source_document_id')::bigint
        and d.kompaniya_id = p_kompaniya_id and (d.obyekt_id is null or d.obyekt_id = p_obyekt_id)) then
    return jsonb_build_object('ok',false,'code','SOURCE_DOCUMENT_SCOPE_MISMATCH');
  end if;

  perform public.t2_smeta_import_object_lock_v1(p_obyekt_id);
  select count(*) into v_eski from public.t2_qator where obyekt_id = p_obyekt_id and versiya_holat = 'faol';
  if v_eski = 0 then return jsonb_build_object('ok',false,'code','NO_ACTIVE_SMETA','xato','Obyektda faol smeta yo''q — oddiy import ishlating'); end if;
  if exists (select 1 from public.t2_smeta_import_sessiya where obyekt_id = p_obyekt_id and holat = 'ochiq') then
    return jsonb_build_object('ok',false,'code','IMPORT_SESSION_OPEN');
  end if;
  select id into v_rev from public.t2_smeta_revision where obyekt_id = p_obyekt_id order by seq desc limit 1;

  -- 4.1 Eski smeta — versiya (tur 'dastlabki') + pozitsiyalar
  insert into public.t2_smeta_versiya(kompaniya_id, obyekt_id, nom, tur, manba_sana, manba_fayllar, manba_hujjat_id,
      bazaviy_revision_id, holat, izoh, actor_id, operation_id)
  values (p_kompaniya_id, p_obyekt_id,
      coalesce(nullif(btrim(v_manba->>'eski_nom'),''), 'Almashtirilgan smeta (faollashtirishdan oldin)'), 'dastlabki',
      null, '[]'::jsonb, null, v_rev, 'yuklanmoqda',
      left('faollashtirish: yangi manba ' || coalesce(v_manba->>'nom','—') || '; fayllar ' || coalesce((v_manba->'fayllar')::text,'[]'), 1000),
      p_actor_id, p_operation_id)
  returning id into v_versiya;

  insert into public.t2_smeta_versiya_pozitsiya(versiya_id, kompaniya_id, tartib, ls_nom, razdel, kod, nom, birlik, hajm, resurslar, manba)
  select v_versiya, p_kompaniya_id, (row_number() over (order by q.tartib, q.id))::integer,
         ild.nom, ota.nom, q.kod, coalesce(nullif(btrim(q.nom),''), '—'), q.birlik, q.hajm,
         coalesce((select jsonb_agg(jsonb_build_object('qator_id',r.id,'tur',r.tur,'kat',r.kat,'kod',r.kod,'nom',r.nom,'birlik',r.birlik,
                     'hajm',r.hajm,'norma',r.norma,'narx',r.narx,'summa',r.summa) order by r.tartib, r.id)
                   from public.t2_qator r where r.ota_id = q.id), '[]'::jsonb),
         jsonb_build_object('qator_id', q.id, 'tur', q.tur, 'narx', q.narx, 'summa', q.summa)
  from public.t2_qator q
  join public.t2_qator ota on ota.id = q.ota_id
  left join lateral (with recursive u(id, ota_id, nom) as (
                       select ota.id, ota.ota_id, ota.nom
                       union all select p.id, p.ota_id, p.nom from public.t2_qator p join u on p.id = u.ota_id)
                     select nom from u where ota_id is null limit 1) ild on true
  where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
    and (q.tur = 'bl' or (q.tur in ('mat','ob') and ota.tur = 'rz'));

  -- 4.2 Eski qatorlar — almashtirilgan (maydonlari o'zgarmaydi)
  update public.t2_qator set versiya_holat = 'almashtirilgan', almashtirgan_versiya_id = v_versiya
   where obyekt_id = p_obyekt_id and versiya_holat = 'faol';

  -- 4.3 Yangi qatorlar — mavjud import yakunlovchi
  insert into public.t2_smeta_import_sessiya(kompaniya_id, obyekt_id, actor_id, operation_id, source_document_id)
  values (p_kompaniya_id, p_obyekt_id, p_actor_id, md5(p_operation_id::text || ':faollashtir')::uuid, (v_manba->>'source_document_id')::bigint)
  returning id into v_sess;
  v_n := jsonb_array_length(p_qatorlar);
  for v_bolak in 0 .. ((v_n - 1) / 2000) loop
    insert into public.t2_smeta_import_bolak(sessiya_id, bolak, qatorlar, qator_soni)
    select v_sess, v_bolak, jsonb_agg(t.x order by t.o), count(*)
    from jsonb_array_elements(p_qatorlar) with ordinality t(x, o)
    where (t.o - 1) / 2000 = v_bolak;
  end loop;
  v_res := public.t2_smeta_import_yakunla_unlocked_v1(p_kompaniya_id, p_actor_id, v_sess);
  if coalesce(v_res->>'ok','') <> 'true' then
    raise exception 'FAOLLASHTIRISH_IMPORT_XATO: %', v_res using errcode = 'P0001';
  end if;
  if coalesce((v_res->>'rollup_kerak')::boolean, false) then perform public.t2_rollup(p_obyekt_id); end if;
  begin
    v_res := v_res || jsonb_build_object('muhr', public.t2_qator_muhr_ol_v1(p_obyekt_id, 'import', p_actor_id));
  exception when others then
    v_res := v_res || jsonb_build_object('muhr_xato', left(sqlerrm, 300));
  end;

  -- 4.4 Moslik (pereraschet): kod + nom + birlik (normallashtirilgan), takrorlar tartib bo'yicha juftlanadi.
  with yangi as (
    select q.id, q.kod, q.nom, q.birlik, q.hajm,
           concat_ws('|', upper(btrim(coalesce(q.kod,''))), public.t2_resurs_nom_kalit(q.nom), public.t2_resurs_birlik_kalit(q.birlik)) k,
           row_number() over (partition by upper(btrim(coalesce(q.kod,''))), public.t2_resurs_nom_kalit(q.nom), public.t2_resurs_birlik_kalit(q.birlik) order by q.tartib, q.id) rn
    from public.t2_qator q join public.t2_qator ota on ota.id = q.ota_id
    where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol' and (q.tur = 'bl' or (q.tur in ('mat','ob') and ota.tur = 'rz'))
  ), eski as (
    select p.id, p.hajm,
           concat_ws('|', upper(btrim(coalesce(p.kod,''))), public.t2_resurs_nom_kalit(p.nom), public.t2_resurs_birlik_kalit(p.birlik)) k,
           row_number() over (partition by upper(btrim(coalesce(p.kod,''))), public.t2_resurs_nom_kalit(p.nom), public.t2_resurs_birlik_kalit(p.birlik) order by p.tartib) rn
    from public.t2_smeta_versiya_pozitsiya p where p.versiya_id = v_versiya
  ), juft as (
    select e.id pid, y.id qid, e.hajm eh, y.hajm yh, y.kod, y.nom, y.birlik from eski e join yangi y on y.k = e.k and y.rn = e.rn
  ), ins as (
    insert into public.t2_smeta_versiya_moslik(versiya_id, kompaniya_id, pozitsiya_id, qator_id, holat, ishonch, usul,
        eski_hajm, joriy_hajm, joriy_kod, joriy_nom, joriy_birlik)
    select v_versiya, p_kompaniya_id, j.pid, j.qid,
           case when j.eh is null or j.yh is null then 'noaniq' when j.yh = j.eh then 'ozgarmagan' when j.yh < j.eh then 'kamaygan' else 'oshgan' end,
           100, 'kod_nom_birlik', j.eh, j.yh, j.kod, j.nom, j.birlik
    from juft j
    union all
    select v_versiya, p_kompaniya_id, e.id, null, 'ochirilgan', 100, 'kod_nom_birlik', e.hajm, null, null, null, null
    from eski e where not exists (select 1 from juft j where j.pid = e.id)
    union all
    select v_versiya, p_kompaniya_id, null, y.id, 'yangi', 100, 'kod_nom_birlik', null, y.hajm, y.kod, y.nom, y.birlik
    from yangi y where not exists (select 1 from juft j where j.qid = y.id)
    returning holat
  )
  select coalesce(jsonb_object_agg(holat, n), '{}'::jsonb) into v_moslik from (select holat, count(*) n from ins group by holat) s;

  update public.t2_smeta_versiya set holat = 'tayyor', yangilandi = now(),
         pozitsiya_soni = (select count(*) from public.t2_smeta_versiya_pozitsiya where versiya_id = v_versiya)
   where id = v_versiya;

  begin perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id);
  exception when others then raise warning 't2_smeta_versiya_faollashtir_v1: signal refresh (non-fatal): %', sqlerrm; end;
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_versiya_faollashtir', 'smeta', p_obyekt_id,
    format('versiya_id=%s (almashtirilgan); eski_faol=%s; yangi=%s; manba=%s', v_versiya, v_eski, v_res->>'qator_soni', left(coalesce(v_manba->>'nom',''),200)),
    'actor:' || p_actor_id, null);

  v_out := jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'almashtirilgan_versiya_id', v_versiya,
    'almashtirilgan_qator_soni', v_eski, 'yangi_qator_soni', (v_res->>'qator_soni')::integer, 'moslik', v_moslik, 'import', v_res);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'smeta_versiya_faollashtir', v_out);
  return v_out;
end $$;

revoke all on function public.t2_smeta_versiya_faollashtir_v1(bigint,bigint,bigint,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.t2_smeta_versiya_faollashtir_v1(bigint,bigint,bigint,jsonb,jsonb,uuid) to service_role;
revoke all on function public.t2_akt_qator_versiya_guard() from public, anon, authenticated;

commit;
