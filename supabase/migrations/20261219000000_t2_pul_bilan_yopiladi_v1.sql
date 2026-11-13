-- 20261219000000 - PUL BO'YICHA YOPILADIGAN ISH + SMETA JAMI JUFTLIGI (asl / joriy).
-- Egasi 2026-11-13:
--  (1) «Smeta jami» — asosiy raqam ASL smeta (qo'shimcha/zamena kirmaydi), joriy smeta (ular bilan) yonida kichik. Nakopitelniy javobiga
--      jami.smeta_asl / jami.smeta_joriy (server summa paketlari: _t2_summa_paket_v1 'smeta' / 'smeta_joriy') qo'shiladi — yangi formula yo'q.
--  (2) Pul bo'yicha yopiladigan qator: birlik «сум»/«сўм»/«so'm»/«sum»/«UZS» VA narx = 1 (hajm = pul summasi). Bunday qatorda hajm/narx
--      farqi hisoblanmaydi: row.narx_variance_summa / jami_baseline_summa / jami_actual_summa = NULL (qo'llanmaydi, 0 emas); jami.baseline_summa
--      va jami.narx_variance_summa ularni chiqarib tashlaydi (nopok ~1e20 yo'qoladi); bajarilish — yopilgan pul foizi.
--      Tasdiqlangan aktlar va ma'lumot O'ZGARTIRILMAYDI. Predikat frontend bilan bir xil: lib/hisob-yadro/pul-bilan-yopiladi.ts.
-- t2_nakopitelniy_v2: joriy prod ta'rifi (pg_get_functiondef) asosida; avvalgi ta'rif t2_nakopitelniy_v2_pre_20261219000000 sifatida saqlanadi (rollback).

create or replace function public.t2_pul_bilan_yopiladi_v1(p_birlik text, p_narx numeric)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $f$
  select p_narx is not null and p_narx = 1
     and regexp_replace(lower(coalesce(p_birlik, '')), '[\s.''’ʻʼ‘`]', '', 'g') in ('сум', 'сўм', 'som', 'sum', 'uzs')
$f$;

revoke all on function public.t2_pul_bilan_yopiladi_v1(text, numeric) from public, anon, authenticated;
grant execute on function public.t2_pul_bilan_yopiladi_v1(text, numeric) to service_role;

-- Avvalgi ta'rifni saqlash (bir marta).
do $s$
declare d text;
begin
  if to_regprocedure('public.t2_nakopitelniy_v2_pre_20261219000000(bigint,bigint,date,integer,boolean,integer)') is null then
    d := pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
    d := replace(d, 'public.t2_nakopitelniy_v2(', 'public.t2_nakopitelniy_v2_pre_20261219000000(');
    execute d;
    revoke all on function public.t2_nakopitelniy_v2_pre_20261219000000(bigint,bigint,date,integer,boolean,integer) from public, anon, authenticated;
    grant execute on function public.t2_nakopitelniy_v2_pre_20261219000000(bigint,bigint,date,integer,boolean,integer) to service_role;
  end if;
end $s$;

CREATE OR REPLACE FUNCTION public.t2_nakopitelniy_v2(p_obyekt_id bigint, p_actor_id bigint, p_davr date DEFAULT NULL::date, p_limit integer DEFAULT 500, p_faqat_faol boolean DEFAULT true, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_rol text; v_davr date; v_obnom text; v_loyiha bigint;
  v_lim integer := least(greatest(coalesce(p_limit,500),1),5000);
  v_off integer := greatest(coalesce(p_offset,0),0);
  v_faol boolean := coalesce(p_faqat_faol,true);
  v_qatorlar jsonb; v_jami jsonb := null; v_davrlar jsonb; v_qcount integer;
  v_pending numeric := 0; v_olindi integer; v_keyingi boolean;
  v_nak jsonb := null;
  v_asl jsonb := null; v_joriy jsonb := null;
begin
  select kompaniya_id, nom, loyiha_id into v_komp, v_obnom, v_loyiha from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);  -- raises 42501

  v_davr := date_trunc('month', coalesce(
              p_davr,
              (select max(a.oy) from public.t2_akt a where a.obyekt_id = p_obyekt_id and a.tur='f2' and a.holat='tasdiqlangan'),
              (select max(a.oy) from public.t2_akt a where a.obyekt_id = p_obyekt_id and a.tur='f2'),
              now()::date))::date;

  select
    coalesce(jsonb_agg(d.r order by d.tartib, d.id), '[]'::jsonb), count(*)
  into v_qatorlar, v_olindi
  from (
    select q.tartib, q.id, jsonb_build_object(
      'qator_id', q.id, 'tartib', q.tartib, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik,
      'tur', q.tur, 'kat', q.kat, 'versiya_holat', q.versiya_holat, 'qoshimcha', q.qoshimcha, 'zamena', q.zamena,
      'smeta_hajm', coalesce(zr.v, q.hajm), 'asl_smeta_hajm', q.hajm, 'smeta_narx', q.narx, 'smeta_summa', q.summa,
      /* hisob_yadro_v2 */ 'fakt_hajm', coalesce(fh.fakt_hajm,0), 'fakt_summa', coalesce(fh.fakt_summa,0),
      'oldingi_hajm',  coalesce(p.oldingi_hajm,0),
      'oldingi_summa', coalesce(p.oldingi_summa,0),
      'joriy_hajm',    coalesce(p.joriy_hajm,0),
      'joriy_summa',   coalesce(p.joriy_summa,0),
      'joriy_qoralama_summa', coalesce(p.joriy_qoralama_summa,0),
      'jami_hajm',  coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0),
      'jami_summa', coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0),
      'f2_summa_nomalum', coalesce(p.oldingi_nom,0) + coalesce(p.joriy_nom,0),
      'f2_mumkin_hajm', coalesce(fh.fakt_hajm,0) - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)),
      'almashtirilgan_hajm', coalesce(al.v,0),
      'qoldiq_hajm',  case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0) + coalesce(al.v,0) else coalesce(zr.v, q.hajm, 0) end - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) - coalesce(al.v,0),
      'almashtirilgan_summa', public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),
      'qoldiq_summa', case when zr.v is not null and q.change_type is distinct from 'REPLACEMENT' and q.versiya_holat is distinct from 'almashtirilgan'
        then case when q.hajm <> 0 and q.summa is not null then q.summa / q.hajm * (zr.v - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) - coalesce(al.v,0)) end
        else case when q.versiya_holat = 'almashtirilgan' then coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0) + coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0) else coalesce(case when zr.v is not null and q.hajm <> 0 and q.summa is not null then q.summa * zr.v / q.hajm else q.summa end, 0) end - (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)) - coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0) end,
      /* pul_bilan_yopiladi_v1 */ 'pul_bilan', public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx),
      'jami_baseline_summa', case when public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx) then null else coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0) end,
      'jami_actual_summa',   case when public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx) then null else p.jami_actual_summa end,
      'narx_variance_summa', case when public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx) then null else
        (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0))
        - (coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0)) end,
      'bajarilish_foiz', case when public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)
        then case when coalesce(q.summa, 0) <> 0 then round((coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)) / q.summa * 100, 1) end
        when coalesce(zr.v, q.hajm, 0) <> 0 then round((coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) / coalesce(zr.v, q.hajm) * 100, 1) end
    ) as r
    from (
      select * from public.t2_qator b
      where b.obyekt_id = p_obyekt_id
      order by b.tartib, b.id
      offset case when v_faol then 0 else v_off end
      limit case when v_faol then null else v_lim + 1 end
    ) q
    left join lateral (
      select
        sum(aq.hajm)  filter (where a.tur='fakt') as fakt_hajm,
        sum(aq.summa) filter (where a.tur='fakt') as fakt_summa,
        sum(aq.hajm)  filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr) as oldingi_hajm,
        sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr) as oldingi_summa,
        count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr
                           and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\\s+ТРУДА\\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as oldingi_nom,
        sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr) as oldingi_baseline,
        sum(aq.hajm)  filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_hajm,
        sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_summa,
        count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr
                           and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\\s+ТРУДА\\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as joriy_nom,
        sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_baseline,
        sum(aq.summa) filter (where a.tur='f2' and a.holat='qoralama' and a.oy = v_davr) as joriy_qoralama_summa,
        count(*) filter (where a.tur='f2' and a.holat='qoralama' and a.oy = v_davr
                           and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\\s+ТРУДА\\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as qoralama_nom,
        case when count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and aq.actual_narx is null) > 0
             then null
             else sum(aq.hajm * aq.actual_narx) filter (where a.tur='f2' and a.holat='tasdiqlangan')
        end as jami_actual_summa
      from public.t2_akt_qator aq
      join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
      where aq.qator_id = q.id
    ) p on true left join (select h.qator_id, h.fakt_hajm, h.fakt_summa from public._t2_qator_holat_v2(array[p_obyekt_id]) h) fh on fh.qator_id = q.id
    left join lateral (select case when exists (select 1 from public.t2_qator zz where zz.replaces_line_id = q.id and zz.replaces_line_id is not null) or exists (select 1 from public.t2_qator zz where zz.replaces_line_id = q.ota_id and zz.replaces_line_id is not null) then public.t2_almashtirilgan_hajm(q.id) else 0::numeric end as v) al on true
    left join lateral (select case when (q.change_type = 'REPLACEMENT' and q.replaces_line_id is not null and q.almashtirish_hajm is null)
        or (q.tur in ('rs','mat','ob') and q.ota_id is not null and exists (select 1 from public.t2_qator zp where zp.id = q.ota_id and zp.change_type = 'REPLACEMENT' and zp.replaces_line_id is not null and zp.almashtirish_hajm is null))
        then public.t2_zamena_reja_hajm(q.id) end as v) zr on true
    where ((not v_faol and (q.versiya_holat = 'faol' or coalesce(p.oldingi_hajm,0) <> 0 or coalesce(p.joriy_hajm,0) <> 0 or coalesce(fh.fakt_hajm,0) <> 0 or coalesce(p.joriy_qoralama_summa,0) <> 0)) or coalesce(al.v,0) <> 0 or coalesce(p.oldingi_hajm,0) <> 0 or coalesce(p.joriy_hajm,0) <> 0
           or coalesce(p.joriy_qoralama_summa,0) <> 0 or coalesce(fh.fakt_hajm,0) <> 0 or q.qoshimcha or q.zamena)
    order by q.tartib, q.id
    offset case when v_faol then v_off else 0 end
    limit v_lim + 1
  ) d;

  v_keyingi := v_olindi > v_lim;
  if v_keyingi then
    v_qatorlar := v_qatorlar - (jsonb_array_length(v_qatorlar) - 1);
  end if;

  select count(*) into v_qcount from public.t2_qator where obyekt_id = p_obyekt_id and versiya_holat = 'faol'; -- versiya_faollashtir_v1

  if v_off = 0 then
    if to_regclass('public.t2_smeta_ozgarish') is not null then
      execute 'select coalesce(sum(delta_summa),0) from public.t2_smeta_ozgarish where obyekt_id=$1 and holat=''qoralama'''
        into v_pending using p_obyekt_id;
    end if;

    with pa as (
      select aq.qator_id,
          sum(aq.summa) filter (where a.tur='fakt') as fakt_summa,
          sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr) as oldingi_summa,
          count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <  v_davr
                             and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\\s+ТРУДА\\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as oldingi_nom,
          -- pul bo'yicha yopiladigan qator baseline/farqqa kirmaydi (hajm = pul, narx = 1)
          sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy < v_davr and not public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)) as oldingi_baseline,
          sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr) as joriy_summa,
          count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr
                             and q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\\s+ТРУДА\\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as joriy_nom,
          sum(aq.baseline_summa) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy = v_davr and not public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)) as joriy_baseline,
          sum(aq.summa) filter (where a.tur='f2' and a.holat='qoralama' and a.oy = v_davr) as joriy_qoralama_summa,
          -- narx farqi asosi: pul bo'yicha yopiladigan qatorsiz tasdiqlangan F2 (oy <= davr) summasi va qatorlar soni
          sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <= v_davr and not public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)) as farq_summa,
          count(*) filter (where a.tur='f2' and a.holat='tasdiqlangan' and a.oy <= v_davr and not public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)) as farq_soni
      from public.t2_qator q
      join public.t2_akt_qator aq on aq.qator_id = q.id
      join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
      where q.obyekt_id = p_obyekt_id
      group by aq.qator_id
    ), agg as (
      select
        coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol'),0) as smeta_summa,
        count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null and q.versiya_holat = 'faol') as smeta_summa_nomalum,
        coalesce((select sum(h.fakt_summa) from public._t2_qator_holat_v2(array[p_obyekt_id]) h where not exists (select 1 from public.t2_qator c where c.ota_id = h.qator_id)),0) as fakt_summa,
        coalesce(sum(x.oldingi_summa),0) as oldingi_summa,
        coalesce(sum(x.joriy_summa),0)   as joriy_summa,
        coalesce(sum(x.joriy_qoralama_summa),0) as joriy_qoralama_summa,
        coalesce(sum(x.oldingi_summa),0) + coalesce(sum(x.joriy_summa),0) as jami_summa,
        coalesce(sum(x.oldingi_nom),0) as oldingi_nom,
        coalesce(sum(x.joriy_nom),0)   as joriy_nom,
        coalesce(sum(x.oldingi_baseline),0) + coalesce(sum(x.joriy_baseline),0) as baseline_summa,
        coalesce(sum(x.farq_summa),0) as farq_summa,
        coalesce(sum(x.farq_soni),0) as farq_soni,
        count(*) filter (where q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol' and public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)) as pul_bilan_soni,
        sum(q.summa) filter (where q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol' and public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)) as pul_bilan_summa
      from public.t2_qator q
      left join pa x on x.qator_id = q.id
      where q.obyekt_id = p_obyekt_id
    )
    select jsonb_build_object(
      'smeta_summa', smeta_summa,
      'smeta_summa_asos', 'barglar',
      'smeta_summa_nomalum', smeta_summa_nomalum,
      'fakt_summa', fakt_summa,
      'oldingi_summa', oldingi_summa,
      'joriy_tasdiqlangan_summa', joriy_summa,
      'joriy_qoralama_summa', joriy_qoralama_summa,
      'jami_tasdiqlangan_summa', jami_summa,
      'jami_tasdiqlangan_malum_summa', jami_summa,
      'f2_summa_nomalum', oldingi_nom + joriy_nom,
      'qoldiq_summa', smeta_summa - jami_summa - (select coalesce(sum(public.t2_almashtirilgan_summa_hisob(public.t2_almashtirilgan_hajm(o.id), o.hajm, o.narx, o.summa)),0)
        from public.t2_qator o where o.obyekt_id = p_obyekt_id and o.tur in ('rs','mat','ob') and o.versiya_holat = 'faol'
          and (exists (select 1 from public.t2_qator zz where zz.replaces_line_id = o.id and zz.replaces_line_id is not null)
               or exists (select 1 from public.t2_qator zz where zz.replaces_line_id = o.ota_id and zz.replaces_line_id is not null))),
      'f2_mumkin_summa', fakt_summa - jami_summa,
      'baseline_summa', baseline_summa,
      -- narx farqi: pul bo'yicha yopiladigan qatorlarsiz; asos qatori yo'q — NULL (qo'llanmaydi), 0 emas
      'narx_variance_summa', case when farq_soni > 0 then farq_summa - baseline_summa end,
      'pul_bilan_soni', pul_bilan_soni,
      'pul_bilan_summa', pul_bilan_summa,
      'pending_ozgarish_delta', v_pending,
      'bajarilish_foiz', case when smeta_summa <> 0 then round(jami_summa / smeta_summa * 100, 1) end)
      into v_jami from agg;

    if to_regclass('public.t2_obyekt_nakrutka') is not null then
      execute $q$
        select jsonb_build_object(
          'pryamye', round(n.pryamye, 2),
          'itogo4', round(n.itogo4, 2),
          'nds', round(n.nds, 2),
          'nds_foiz', case when coalesce(n.itogo4,0) <> 0 then round(n.nds / n.itogo4 * 100, 2) end,
          'vsego', round(n.vsego, 2))
        from public.t2_obyekt_nakrutka n where n.obyekt_id = $1 limit 1 $q$
        into v_nak using p_obyekt_id;
    end if;
    v_jami := v_jami || jsonb_build_object('smeta_nakrutka', v_nak);

    -- Smeta jami juftligi (egasi 2026-11-13): ASL (qo'shimcha/zamena kirmaydi) va JORIY (ular bilan) — yagona summa paketi yo'li; yo'q — NULL (noma'lum).
    select p.paket into v_asl from public._t2_summa_paket_kesh_v1(array[p_obyekt_id], 'smeta') p limit 1;
    select p.paket into v_joriy from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta_joriy') p limit 1;
    v_jami := v_jami || jsonb_build_object('smeta_asl', v_asl, 'smeta_joriy', v_joriy);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'oy', to_char(a.oy,'YYYY-MM'), 'akt_id', a.id, 'raqam', a.raqam,
           'holat', a.holat, 'hujjat_jami', a.hujjat_jami, 'davr_muhr', a.davr_muhr,
           'revision_id', a.revision_id,
           'joriy', a.oy = v_davr, 'oldingi', a.oy < v_davr,
           'certified', a.holat = 'tasdiqlangan') order by a.oy, a.id), '[]'::jsonb)
    into v_davrlar
  from public.t2_akt a where a.obyekt_id = p_obyekt_id and a.tur = 'f2' and a.holat <> 'bekor';

  return jsonb_build_object(
    'ok', true, 'generated_at', now(),
    'obyekt', jsonb_build_object('id', p_obyekt_id, 'nom', v_obnom, 'kompaniya_id', v_komp, 'loyiha_id', v_loyiha),
    'davr', to_char(v_davr,'YYYY-MM'),
    'joriy_revision_id', (select id from public.t2_smeta_revision where obyekt_id=p_obyekt_id order by seq desc limit 1),
    'qatorlar', v_qatorlar,
    'qatorlar_jami', v_qcount,
    'qatorlar_korsatildi', jsonb_array_length(v_qatorlar),
    'offset', v_off,
    'limit', v_lim,
    'keyingi_offset', case when v_keyingi then v_off + v_lim end,
    'truncated', v_keyingi,
    'jami', v_jami,
    'davrlar', v_davrlar);
end $function$;

revoke all on function public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer) from public, anon, authenticated;
grant execute on function public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer) to service_role;
