-- ZAMENA «UMUMIY QOZON» v1 (egasi 2026-11-08).
-- Muammo: zamena qatorining hajmi (t2_qator.hajm) birinchi kiritishdagi hajm bo'lib qoladi; keyingi F2/fakt yozuvlari
-- shu kichik hajmdan oshib «minus» qoldiq beradi va asl qator hajmiga bog'lanmaydi. Asl qatorning narxi 0 (pul bola
-- resurslarda) bo'lsa almashtirilgan summa 0 chiqib, aslning pul qoldig'i kamaymaydi.
-- Qoida:
--   1) Asl qator va uning zamenalari BITTA hajm qozonini bo'lishadi = asl smeta hajmi (aslning birligida).
--      Birlik bir xil va almashtirish_hajm NULL bo'lgan zamenaning SAMARALI reja hajmi =
--        greatest( asl.hajm - aslning o'z tasdiqlangan F2 - BOSHQA zamenalar qoplagani , zamenaning o'z hajmi ).
--      Birlik farqli yoki almashtirish_hajm kiritilgan -> o'zgarmaydi (zamena.hajm; mavjud proporsional qoida).
--      Zamena ishining BOLA resurslari (rs/mat/ob): bajarilish FOIZI ishnikiga TENG (egasi 2026-11-08):
--        f = min(ish_progress / ish_reja, 1); f > 0 va bola_progress > 0 -> bola reja = bola_progress / f;
--        aks holda bola reja = bola.hajm × ish_reja / ish.hajm. Bola qoldiq summa = summa / hajm × qoldiq hajm.
--      t2_qator.hajm O'ZGARMAYDI -- samarali hajm holat/nakopitelniy qatlamida hisoblanadi (t2_zamena_reja_hajm).
--   2) Pul: asl narxi 0 yoki NULL, summasi != 0 bo'lsa almashtirilgan summa = alm * summa / hajm (narx=0 -> NULL kabi).
--   3) t2_ish_abc_saqla_v1 'replacement': shu asl qatorga shu kod+birlikdagi faol zamena allaqachon bo'lsa YANGI qator
--      yaratilmaydi -- mavjud zamena qayta ishlatiladi, faqat fakt qo'shiladi (hajm tegilmaydi).
-- Asl smeta qatorlari O'ZGARMAYDI; hajm bloklanmaydi; NULL != 0.
-- t2_qator_holat / t2_nakopitelniy_v2 joriy (prod) ta'rifdan replace() bilan o'zgartiriladi -- langar topilmasa EXCEPTION.
begin;

-- 1) Zamenaning samarali reja hajmi (o'z birligida). NULL = qoida qo'llanmaydi (q.hajm ishlatiladi).
create or replace function public.t2_zamena_reja_hajm(p_qator_id bigint) returns numeric
language plpgsql stable set search_path = public, pg_temp set plan_cache_mode = force_generic_plan as $fn$
declare z record; v_rem numeric; v_boshqa numeric; bb record; v_bl numeric; v_f numeric; v_bola_pr numeric;
begin
  -- Zamena ISH (bl) ning BOLA resursi (rs/mat/ob, o'zi zamena emas): bajarilish FOIZI ishnikiga TENG (egasi 2026-11-08).
  --   f = least(ish_progress / ish_reja, 1);  f > 0 va bola_progress > 0 -> reja = bola_progress / f
  --   (bola qoldig'i ishniki bilan bir xil ulushda; soxta ostatka to'qilmaydi);
  --   aks holda reja = bola.hajm × ish_reja / ish.hajm (ish.hajm <= 0/NULL yoki bola.hajm NULL -> o'zgarmaydi).
  --   progress = max(sof F2, fakt) -- t2_zamena_qoplash.progress_hajm bilan aynan bir xil.
  select c.hajm as bola_hajm, p.id as bl_id, p.hajm as bl_hajm into bb
    from public.t2_qator c join public.t2_qator p on p.id = c.ota_id
   where c.id = p_qator_id and c.tur in ('rs', 'mat', 'ob') and c.change_type is distinct from 'REPLACEMENT'
     and p.tur = 'bl' and p.change_type = 'REPLACEMENT' and p.replaces_line_id is not null;
  if found then
    v_bl := public.t2_zamena_reja_hajm(bb.bl_id);
    if v_bl is null then return null; end if;
    select case when v_bl > 0 then least(zq.progress_hajm / v_bl, 1) end into v_f
      from public.t2_zamena_qoplash zq where zq.zamena_qator_id = bb.bl_id;
    select greatest(
             coalesce(sum(coalesce(aq.certified_quantity, aq.hajm)) filter (where a.tur = 'f2' and (a.holat = 'tasdiqlangan'
               or (a.holat <> all (array['bekor', 'rad']) and coalesce(a.lifecycle_status, 'draft') <> all (array['cancelled', 'rejected', 'superseded'])
                   and (aq.raw_snapshot ->> 'source') = 'storno'))), 0),
             coalesce(sum(aq.hajm) filter (where a.tur = 'fakt' and a.holat <> 'bekor'), 0))
      into v_bola_pr
      from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
     where aq.qator_id = p_qator_id;
    if coalesce(v_f, 0) > 0 and coalesce(v_bola_pr, 0) > 0 then return v_bola_pr / v_f; end if;
    if bb.bola_hajm is null or bb.bl_hajm is null or bb.bl_hajm <= 0 then return null; end if;
    return greatest(bb.bola_hajm * v_bl / bb.bl_hajm, bb.bola_hajm);
  end if;
  select zq.asl_qator_id, zq.zamena_hajm, zq.almashtirish_hajm, zq.ayni_birlik, o.hajm as asl_hajm
    into z
    from public.t2_zamena_qoplash zq join public.t2_qator o on o.id = zq.asl_qator_id
   where zq.zamena_qator_id = p_qator_id;
  if not found or z.almashtirish_hajm is not null or not coalesce(z.ayni_birlik, false)
     or z.asl_hajm is null or z.asl_hajm <= 0 or (z.zamena_hajm is not null and z.zamena_hajm < 0) then
    return null;
  end if;
  v_rem := greatest(z.asl_hajm - coalesce((
             select sum(coalesce(aq.certified_quantity, aq.hajm))
               from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
              where aq.qator_id = z.asl_qator_id and a.tur = 'f2' and a.holat = 'tasdiqlangan'), 0), 0);
  -- Boshqa zamenalar qoplagani (aslning birligida) -- t2_almashtirilgan_oz_hajm dagi qoida bilan aynan bir xil.
  select coalesce(sum(case when b.almashtirish_hajm is not null and coalesce(b.zamena_hajm, 0) > 0
                             then b.progress_hajm / b.zamena_hajm * b.almashtirish_hajm
                           when b.almashtirish_hajm is null and b.ayni_birlik then b.progress_hajm
                           when b.almashtirish_hajm is null and coalesce(b.zamena_hajm, 0) > 0
                             then least(b.progress_hajm / b.zamena_hajm, 1) * z.asl_hajm
                           else 0::numeric end), 0)
    into v_boshqa
    from public.t2_zamena_qoplash b
   where b.asl_qator_id = z.asl_qator_id and b.zamena_qator_id <> p_qator_id;
  return greatest(v_rem - v_boshqa, coalesce(z.zamena_hajm, 0));
end $fn$;
revoke all on function public.t2_zamena_reja_hajm(bigint) from public, anon, authenticated;
grant execute on function public.t2_zamena_reja_hajm(bigint) to service_role;
comment on function public.t2_zamena_reja_hajm(bigint) is
  'Zamena «umumiy qozon» (2026-11-08): birlik bir xil, almashtirish_hajm NULL zamenaning samarali reja hajmi = greatest(asl.hajm - asl F2 - boshqa zamenalar, zamena.hajm). NULL = qo''llanmaydi. versiya: texnik (bitta qator id bo''yicha hisoblaydi; versiya filtri chaqiruvchi view t2_qator_holat/t2_nakopitelniy_v2 da).';

-- 2) Narx qoidasi: narx 0 lekin summa != 0 (pul bolalarda) -> summa/hajm.
create or replace function public.t2_almashtirilgan_summa_hisob(p_alm numeric, p_hajm numeric, p_narx numeric, p_summa numeric) returns numeric
language sql immutable set search_path = public, pg_temp as $fn$
  select case when coalesce(p_alm, 0) = 0 then 0::numeric
              when p_narx is not null and not (p_narx = 0 and coalesce(p_summa, 0) <> 0) then p_alm * p_narx
              when p_hajm is not null and p_hajm <> 0 and p_summa is not null then p_alm * p_summa / p_hajm end
$fn$;
comment on function public.t2_almashtirilgan_summa_hisob(numeric, numeric, numeric, numeric) is
  'Almashtirilgan summa: narx 0 lekin summa <> 0 bo''lsa summa/hajm. versiya: texnik (sof hisob, t2_qator o''qimaydi).';

-- 3) t2_qator_holat: zamena smeta/qoldiq hajmi samarali reja bo'yicha; almashtirilgan summa narx=0 qoidasi.
do $do$
declare d text; n text;
begin
  d := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  n := d;
  n := regexp_replace(n, 'ELSE q\.hajm\s+END AS smeta_hajm', 'ELSE COALESCE(zr.v, q.hajm) END AS smeta_hajm');
  n := replace(n, 'ELSE q.hajm - d.f2_hajm - al.v', 'ELSE COALESCE(zr.v, q.hajm) - d.f2_hajm - al.v');
  n := replace(n, 'ELSE q.summa - d.f2_summa_malum - COALESCE(als.s, 0::numeric)',
                  'ELSE CASE WHEN zr.v IS NOT NULL AND q.change_type IS DISTINCT FROM ''REPLACEMENT''::text THEN CASE WHEN q.hajm <> 0::numeric AND q.summa IS NOT NULL THEN q.summa / q.hajm * (zr.v - d.f2_hajm - al.v) ELSE NULL::numeric END'
               || ' ELSE CASE WHEN zr.v IS NOT NULL AND q.hajm <> 0::numeric AND q.summa IS NOT NULL THEN q.summa * zr.v / q.hajm ELSE q.summa END - d.f2_summa_malum - COALESCE(als.s, 0::numeric) END');
  n := replace(n, 'WHEN q.narx IS NOT NULL THEN al.v * q.narx',
                  'WHEN q.narx IS NOT NULL AND NOT (q.narx = 0::numeric AND COALESCE(q.summa, 0::numeric) <> 0::numeric) THEN al.v * q.narx');
  n := regexp_replace(n, '\) al\s+CROSS JOIN LATERAL \( SELECT',
                      ') al' || E'\n     CROSS JOIN LATERAL ( SELECT CASE WHEN (q.change_type = ''REPLACEMENT''::text AND q.replaces_line_id IS NOT NULL AND q.almashtirish_hajm IS NULL) OR (q.tur = ANY (ARRAY[''rs''::text, ''mat''::text, ''ob''::text]) AND q.ota_id IS NOT NULL AND (EXISTS ( SELECT 1 FROM t2_qator zp WHERE zp.id = q.ota_id AND zp.change_type = ''REPLACEMENT''::text AND zp.replaces_line_id IS NOT NULL AND zp.almashtirish_hajm IS NULL))) THEN t2_zamena_reja_hajm(q.id) ELSE NULL::numeric END AS v) zr' || E'\n     CROSS JOIN LATERAL ( SELECT');
  if n = d or position('COALESCE(zr.v, q.hajm) END AS smeta_hajm' in n) = 0
     or position('COALESCE(zr.v, q.hajm) - d.f2_hajm - al.v' in n) = 0
     or position('NOT (q.narx = 0::numeric AND COALESCE(q.summa, 0::numeric) <> 0::numeric) THEN al.v * q.narx' in n) = 0
     or position('t2_zamena_reja_hajm(q.id) ELSE NULL::numeric END AS v) zr' in n) = 0
     or position('THEN q.summa * zr.v / q.hajm ELSE q.summa END - d.f2_summa_malum' in n) = 0
     or position('q.summa / q.hajm * (zr.v - d.f2_hajm - al.v)' in n) = 0 then
    raise exception 'ZAMENA_QOZON: t2_qator_holat langari topilmadi (view ta''rifi o''zgargan)';
  end if;
  execute 'create or replace view public.t2_qator_holat as ' || rtrim(n, E'; \n');
end $do$;

-- 4) t2_nakopitelniy_v2: «по смете» hajm, qoldiq hajm va bajarilish % zamena uchun samarali reja bo'yicha; asl_smeta_hajm kaliti.
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
  n := d;
  n := replace(n, $a$'smeta_hajm', q.hajm,$a$, $b$'smeta_hajm', coalesce(zr.v, q.hajm), 'asl_smeta_hajm', q.hajm,$b$);
  n := replace(n, $a$else coalesce(q.hajm,0) end - (coalesce(p.oldingi_hajm,0)$a$, $b$else coalesce(zr.v, q.hajm, 0) end - (coalesce(p.oldingi_hajm,0)$b$);
  n := regexp_replace(n, $a$case when coalesce\(q\.hajm,0\) <> 0\s+then round\(\(coalesce\(p\.oldingi_hajm,0\) \+ coalesce\(p\.joriy_hajm,0\)\) / q\.hajm \* 100, 1\) end$a$,
                      $b$case when coalesce(zr.v, q.hajm, 0) <> 0 then round((coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) / coalesce(zr.v, q.hajm) * 100, 1) end$b$);
  n := replace(n, $a$else coalesce(q.summa,0) end - (coalesce(p.oldingi_summa,0)$a$,
                  $b$else coalesce(case when zr.v is not null and q.hajm <> 0 and q.summa is not null then q.summa * zr.v / q.hajm else q.summa end, 0) end - (coalesce(p.oldingi_summa,0)$b$);
  -- bola resurs: qoldiq summa = summa / hajm × qoldiq hajm (ishniki bilan bir xil ulush; NULL-xavfsiz)
  n := replace(n, $a$'qoldiq_summa', case when q.versiya_holat$a$,
                  $b$'qoldiq_summa', case when zr.v is not null and q.change_type is distinct from 'REPLACEMENT' and q.versiya_holat is distinct from 'almashtirilgan'
        then case when q.hajm <> 0 and q.summa is not null then q.summa / q.hajm * (zr.v - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) - coalesce(al.v,0)) end
        else case when q.versiya_holat$b$);
  n := regexp_replace(n, $a$,(\s*)'jami_baseline_summa'$a$, $b$ end,\1'jami_baseline_summa'$b$);
  n := replace(n, ') al on true', ') al on true' || E'\n    left join lateral (select case when (q.change_type = ''REPLACEMENT'' and q.replaces_line_id is not null and q.almashtirish_hajm is null)' ||
                  E'\n        or (q.tur in (''rs'',''mat'',''ob'') and q.ota_id is not null and exists (select 1 from public.t2_qator zp where zp.id = q.ota_id and zp.change_type = ''REPLACEMENT'' and zp.replaces_line_id is not null and zp.almashtirish_hajm is null))' ||
                  E'\n        then public.t2_zamena_reja_hajm(q.id) end as v) zr on true');
  if position($a$'smeta_hajm', coalesce(zr.v, q.hajm), 'asl_smeta_hajm', q.hajm,$a$ in n) = 0
     or position('else coalesce(zr.v, q.hajm, 0) end' in n) = 0
     or position('/ coalesce(zr.v, q.hajm) * 100, 1) end' in n) = 0
     or position('public.t2_zamena_reja_hajm(q.id) end as v) zr on true' in n) = 0
     or position('then q.summa * zr.v / q.hajm else q.summa end, 0) end' in n) = 0
     or position($x$,0) end,$x$ in n) = 0
     or position('q.summa / q.hajm * (zr.v - (coalesce(p.oldingi_hajm,0)' in n) = 0 then
    raise exception 'ZAMENA_QOZON: t2_nakopitelniy_v2 langari topilmadi (funksiya ta''rifi o''zgargan)';
  end if;
  execute n;
end $do$;

-- 5) t2_ish_abc_saqla_v1 'replacement': mavjud zamenani qayta ishlatish (takror kiritish = faqat fakt qo'shiladi).
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.t2_ish_abc_saqla_v1(bigint,bigint,bigint,text,bigint,bigint,jsonb,jsonb,numeric,date,text,uuid,integer)'::regprocedure);
  n := d;
  -- o'zgaruvchilar
  n := replace(n, $a$v_fakt jsonb; v_manba text; v_norma numeric; v_rtur text; v_fakt_q jsonb := '[]'::jsonb;$a$,
                  $b$v_fakt jsonb; v_manba text; v_norma numeric; v_rtur text; v_fakt_q jsonb := '[]'::jsonb;
  v_mavjud public.t2_qator%rowtype; v_qayta boolean := false; v_bola bigint; v_yangi_res integer := 0;$b$);
  -- yaratishdan oldin: shu aslga shu kod+birlik (kodsiz bo'lsa nom) faol zamena bormi
  n := replace(n, $a$  if v_ota is null then return jsonb_build_object('ok', false, 'code', 'PARENT_REQUIRED'); end if;
  v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
    'command', p_command,$a$,
                  $b$  if v_ota is null then return jsonb_build_object('ok', false, 'code', 'PARENT_REQUIRED'); end if;
  -- zamena_qozon_v1 (egasi 2026-11-08): takror zamena -> mavjud qator, faqat fakt qo'shiladi (hajm tegilmaydi).
  if p_command = 'replacement' and p_almashtirilayotgan_qator_id is not null then
    select z.* into v_mavjud from public.t2_qator z
     where z.replaces_line_id = p_almashtirilayotgan_qator_id and z.obyekt_id = p_obyekt_id and z.kompaniya_id = p_kompaniya_id
       and z.change_type = 'REPLACEMENT' and coalesce(z.versiya_holat, 'faol') = 'faol'
       and coalesce(nullif(btrim(z.kod), ''), '') = coalesce(nullif(btrim(p_ish->>'kod'), ''), '')
       and z.birlik_key is not distinct from public.t2_birlik_key(btrim(p_ish->>'birlik'))
       and (nullif(btrim(z.kod), '') is not null or upper(btrim(coalesce(z.nom, ''))) = upper(btrim(p_ish->>'nom')))
     order by z.id limit 1 for update;
    if found then v_qayta := true; end if;
  end if;
  if v_qayta then
    v_id := v_mavjud.id;
    v_add := jsonb_build_object('ok', true, 'qator_id', v_id, 'change_id', v_mavjud.change_id, 'qayta_ishlatildi', true);
  else
  v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
    'command', p_command,$b$);
  n := replace(n, $a$    'kod', nullif(btrim(coalesce(p_ish->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
  v_id := (v_add->>'qator_id')::bigint;$a$,
                  $b$    'kod', nullif(btrim(coalesce(p_ish->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
  v_id := (v_add->>'qator_id')::bigint;
  end if;$b$);
  -- resurs: qayta ishlatishda mavjud bolaga (kod+birlik+tur) fakt; topilmasa yangi bola resurs.
  n := replace(n, $a$      v_rtur := case when v_norma is not null then 'rs' when v_kat = 'ОБ' then 'ob' else 'mat' end;
      v_res := $a$,
                  $b$      v_rtur := case when v_norma is not null then 'rs' when v_kat = 'ОБ' then 'ob' else 'mat' end;
      v_bola := null;
      if v_qayta then
        select b.id into v_bola from public.t2_qator b
         where b.ota_id = v_id and b.tur = v_rtur
           and coalesce(nullif(btrim(b.kod), ''), '') = coalesce(nullif(btrim(v_r->>'kod'), ''), '')
           and b.birlik_key is not distinct from public.t2_birlik_key(btrim(v_r->>'birlik'))
           and upper(btrim(coalesce(b.nom, ''))) = upper(btrim(v_r->>'nom'))
         order by b.id limit 1;
      end if;
      if v_bola is not null then
        if v_rtur <> 'rs' then v_fakt_q := v_fakt_q || jsonb_build_array(jsonb_build_object('qator_id', v_bola, 'hajm', v_hajm)); end if;
        continue;
      end if;
      v_yangi_res := v_yangi_res + 1;
      v_res := $b$);
  n := replace(n, $a$    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_id and tur in ('rs', 'mat', 'ob'))
     where id = v_id;$a$,
                  $b$    if not v_qayta or v_yangi_res > 0 then
    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_id and tur in ('rs', 'mat', 'ob'))
     where id = v_id;
    end if;$b$);
  -- natija + takror operatsiya himoyasi (addrepl_command qatori yozilmagan bo'lsa)
  n := replace(n, $a$  return jsonb_build_object('ok', true, 'qator_id', v_id, 'resurs_ids', to_jsonb(v_ids), 'bolim_id', v_ota, 'change_id', v_add->'change_id');$a$,
                  $b$  if v_qayta then
    insert into public.t2_addrepl_command values (p_operation_id, p_actor_id, p_kompaniya_id,
      jsonb_build_object('command', 'replacement_qayta', 'qator_id', v_id, 'asl_qator_id', p_almashtirilayotgan_qator_id),
      jsonb_build_object('ok', true, 'qator_id', v_id, 'qayta_ishlatildi', true), now())
    on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'qator_id', v_id, 'resurs_ids', to_jsonb(v_ids), 'bolim_id', v_ota, 'change_id', v_add->'change_id',
                            'qayta_ishlatildi', v_qayta);$b$);
  if position('v_qayta := true' in n) = 0 or position('v_id := (v_add->>''qator_id'')::bigint;
  end if;' in n) = 0 or position('v_yangi_res := v_yangi_res + 1;' in n) = 0
     or position('if not v_qayta or v_yangi_res > 0 then' in n) = 0 or position('''replacement_qayta''' in n) = 0
     or position('v_mavjud public.t2_qator%rowtype' in n) = 0 then
    raise exception 'ZAMENA_QOZON: t2_ish_abc_saqla_v1 langari topilmadi (funksiya ta''rifi o''zgargan)';
  end if;
  execute n;
end $do$;

commit;
