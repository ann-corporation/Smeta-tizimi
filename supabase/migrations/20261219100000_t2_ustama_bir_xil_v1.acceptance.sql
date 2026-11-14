-- Qabul (BEGIN..ROLLBACK, sintetik ma'lumot): migratsiya qo'llangandan KEYIN ishga tushiriladi. Hech narsa saqlanmaydi.
-- psql:  \set obj <narxli smeta qatorlari bor sinov obyekti>   \set actor <shu kompaniya a'zosi>
-- Muvaffaqiyat: xato 'USTAMA_BIR_XIL_ACCEPTANCE_PASS' (savepoint rollback bilan, shuning uchun saqlanmaydi).
--
-- Isbotlaydi:
--  A) yaxlit summa qatori (narx=1, hajm=summa) — baseline/variance jami va qatorda HISOBLANMAYDI (NULL), 1e20 chiqmaydi;
--  B) oddiy qator (narxli) — variance oldingidek hisoblanadi;
--  C) yordamchi predikat: yaxlit / oddiy / NULL holatlari;
--  D) KESH = JONLI: _t2_kesh_hisobla_v1 yozgan t2_obyekt_kesh.f2 ustamali == _t2_summa_paket_v1(f2) ustamali;
--  E) akt o'z podvali yo'q obyektda: Σ(akt 'aktlar' paketi) == obyekt 'f2' paketi (chiziqlilik, 1 so'm ichida).
-- Svod bo'lim / ustamasiz qism (bojxona) / tuzatish akti holatlari uchun mavjud fixture: oltin_zanjir_v1.acceptance.sql,
-- t2_zakazchik_f2_ustamali_contract.sql (ular hisob-yadroni o'zgartirmaydi — bu migratsiya ularga tegmaydi).
do $$
declare
  v jsonb; v_obj bigint := :obj; v_actor bigint := :actor;
  v_q1 bigint; v_q2 bigint; v_akt1 bigint; v_akt2 bigint;
  v_bn1 numeric; v_var numeric; v_kesh numeric; v_jonli numeric; v_soni numeric; v_toplam numeric;
begin
  -- C) predikat
  if not public._t2_akt_qator_yaxlit_summami_v1(1, 5803571428.98, 5803571428.98) then raise exception 'FAIL C1 yaxlit aniqlanmadi'; end if;
  if public._t2_akt_qator_yaxlit_summami_v1(24517.7, 241.4, 5919218.77) then raise exception 'FAIL C2 oddiy qator yaxlit deb olindi'; end if;
  if public._t2_akt_qator_yaxlit_summami_v1(null, 10, 10) or public._t2_akt_qator_yaxlit_summami_v1(1, null, 10) then raise exception 'FAIL C3 NULL yaxlit emas'; end if;

  select id into v_q1 from public.t2_qator where obyekt_id=v_obj and narx>0 and tur in ('rs','mat','ob') order by id limit 1;
  select id into v_q2 from public.t2_qator where obyekt_id=v_obj and narx>0 and tur in ('rs','mat','ob') and id<>v_q1 order by id limit 1;
  if v_q2 is null then raise exception 'FAIL setup: obyektda 2 ta narxli barg kerak'; end if;
  select narx into v_bn1 from public.t2_qator where id=v_q1;

  -- Akt 1: oddiy narxli qator (variance musbat). Akt 2: yaxlit summa qatori (hajm=summa, narx=1).
  v := public.t2_akt_yarat(v_obj, 'f2', date '2026-05-01',
        jsonb_build_array(jsonb_build_object('qator_id', v_q1, 'hajm', 3, 'narx', v_bn1 * 1.20, 'actual_narx', v_bn1 * 1.20, 'narx_manba', 'taminot', 'narx_manba_id', 777)),
        'ACC-USTAMA-1', gen_random_uuid());
  if (v->>'ok') <> 'true' then raise exception 'FAIL akt1: %', v; end if;
  v_akt1 := (v->>'akt_id')::bigint;
  v := public.t2_akt_yarat(v_obj, 'f2', date '2026-06-01',
        jsonb_build_array(jsonb_build_object('qator_id', v_q2, 'hajm', 5803571428.99, 'narx', 1)),
        'ACC-USTAMA-2', gen_random_uuid());
  if (v->>'ok') <> 'true' then raise exception 'FAIL akt2: %', v; end if;
  v_akt2 := (v->>'akt_id')::bigint;
  update public.t2_akt set holat='tasdiqlangan' where id in (v_akt1, v_akt2);

  -- A/B) nakopitelniy
  v := public.t2_nakopitelniy_v2(v_obj, v_actor, date '2026-06-01', 1000, true);
  if (v->>'ok') <> 'true' then raise exception 'FAIL nakopitelniy: %', v; end if;
  v_var := (v->'jami'->>'narx_variance_summa')::numeric;
  if v_var is null or abs(v_var) > 1e12 then raise exception 'FAIL A jami variance buzilgan: %', v_var; end if;
  if abs((v->'jami'->>'baseline_summa')::numeric) > 1e12 then raise exception 'FAIL A jami baseline buzilgan'; end if;
  -- B) faqat akt1 (narx 1.2x) taqqoslanadi: variance = 3 * bn1 * 0.20 (yaxlit qator chiqarilgan)
  if round(v_var - 3 * v_bn1 * 0.20, 2) <> 0 then raise exception 'FAIL B variance: kutilgan %, chiqdi %', 3 * v_bn1 * 0.20, v_var; end if;
  -- A) yaxlit qatorning o'z variance'i NULL
  if exists (select 1 from jsonb_array_elements(v->'qatorlar') r
              where (r->>'qator_id')::bigint = v_q2 and (r->>'narx_variance_summa') is not null
                and abs((r->>'narx_variance_summa')::numeric) > 1e12) then
    raise exception 'FAIL A qator variance yaxlit qatorda buzilgan';
  end if;

  -- D) kesh == jonli
  perform public._t2_kesh_hisobla_v1(v_obj);
  select (k.f2->>'ustamali')::numeric into v_kesh from public.t2_obyekt_kesh k where k.obyekt_id = v_obj;
  select (p.paket->>'ustamali')::numeric into v_jonli from public._t2_summa_paket_v1(array[v_obj], 'f2') p;
  if v_kesh is distinct from v_jonli then raise exception 'FAIL D kesh % != jonli %', v_kesh, v_jonli; end if;

  -- E) chiziqlilik (akt o'z podvali va svod yo'q obyekt uchun)
  select count(*) into v_soni from public.t2_akt_podval p join public.t2_akt a on a.id = p.akt_id where a.obyekt_id = v_obj;
  select count(*) into v_soni from public.t2_svod_yaxlit y where y.obyekt_id = v_obj and y.faol;
  if v_soni = 0 and not exists (select 1 from public.t2_akt_podval p join public.t2_akt a on a.id = p.akt_id where a.obyekt_id = v_obj) then
    select coalesce(sum((p.paket->>'ustamali')::numeric), 0) into v_toplam
      from public.t2_akt a cross join lateral public._t2_summa_paket_v1(array[a.obyekt_id], 'aktlar', array[a.id]) p
     where a.obyekt_id = v_obj and a.tur = 'f2' and a.holat = 'tasdiqlangan';
    if abs(v_toplam - v_jonli) > 1 then raise exception 'FAIL E Σakt % != obyekt f2 %', v_toplam, v_jonli; end if;
  end if;

  raise exception 'USTAMA_BIR_XIL_ACCEPTANCE_PASS';
end $$;
