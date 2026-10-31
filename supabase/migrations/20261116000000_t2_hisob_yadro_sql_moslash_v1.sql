-- T2_HISOB_YADRO_SQL_MOSLASH v1 (egasi: «bitta model hamma joyda — ekran, Excel va baza tiyingacha bir xil»).
--
-- Server pul kaskadi TS hisob yadrosi (frontend/src/lib/hisob-yadro: podval.ts / kaskad.ts / yaxlit.ts) bilan AYNAN:
--   1. Kategoriyalar XOM (yaxlitlanmagan) kiradi.
--   2. Har foiz qatori = round(baza × % × 0.01, 2); baza — xom kategoriyalar yoki OLDINGI (yaxlitlangan) qatorlar.
--      Bo'lish (/100) o'rniga × 0.01: numeric ko'paytma aniq, bo'lish esa rscale bo'yicha kesiladi.
--   3. Har jami qatori = round(Σ, 2). Postgres round(numeric, 2) — yarmi noldan uzoqqa (= yadro yaxlit2).
--   4. skl_mat (baza МАТ+КАБ = mat − bez − mk) va skl_mk (baza М/К) — ALOHIDA yaxlitlanadigan qadamlar.
--      Moslik uchun chiqishdagi 'skl_mat' = ikkalasining yig'indisi; 'skl_mk' — alohida kalit.
--   5. Kiritilmagan foiz: yadroda null. Serverda nk har doim `t2_nakrutka_default_v1() || kompaniya || shartnoma || podval`
--      (_t2_obyekt_nk_v1, t2_nakrutka_koef_ol_v1, t2_obyekt_nakrutka view): sukut 11 kalitning hammasini beradi,
--      t2_nakrutka_koef.qiymat NOT NULL, podval faqat jsonb 'number' foizlarni beradi — ya'ni kalit hech qachon yo'q/null
--      emas. Shu sababli coalesce(…, 0) saqlandi (natija yadro bilan bir xil); faqat qo'lda berilgan to'liq bo'lmagan
--      p_nk da farq bo'lishi mumkin (hujjatlashtirilgan).
--   6. Kf (t2_nakrutka_koef_jadval_v1) — YAXLITLANMAGAN 1 so'mlik kaskad ВСЕГО (yadro podvalKf): ekran Kf = yadro Kf.
--   7. Yaxlit svod (egasi 2026-10-30): svod summasi QQS BILAN, НДС dan KEYIN: ВСЕГО = ishlar ВСЕГО + svod (aynan);
--      ИТОГО-4 (sarlavha) = ishlar ИТОГО-4 + round(svod/(1+QQS), 2) (bo'lim stavkasi bilan); НДС = ВСЕГО − ИТОГО-4.
--      Subpudrat / ustamasiz / kat noma'lum / svod summasiz bo'lim qismlari QQS SIZ, QQS dan OLDIN (yadro
--      'qqssiz_ustamadan_keyin' + nomalumQism): ИТОГО-4 ga qo'shiladi, faqat QQS oladi.
--
-- Funksiyalar:
--   _t2_r2_v1 (yangi)                 — ixtiyoriy yaxlitlash yordamchisi.
--   _t2_nakrutka_kaskad_v1 (yangi)    — standart podval kaskadi (yadro standartPodval + podvalBahola), yaxlitlash ixtiyoriy.
--   t2_nakrutka_hisobla_v1            — = _t2_nakrutka_kaskad_v1(…, true); chiqish kalitlari o'sha + 'skl_mk'.
--   t2_nakrutka_koef_jadval_v1        — yaxlitlanmagan Kf.
--   _t2_kaskad_yakun_v1 (yangi)       — yadro kaskad() yakuni: kat noma'lum + QQS siz qism (QQS dan oldin) va
--                                       QQS bilan svod (QQS dan keyin) — sarlavha ИТОГО-4 / НДС / ВСЕГО.
--   t2_nakrutka_yaxlit_qosh_v1        — avvalgi ma'no (QQS siz qism QQS dan oldin), yakun orqali; imzo o'zgarmadi.
--   t2_nakrutka_yaxlit_qosh_v2 (yangi)— obyekt svod xulosasi (t2_svod_yaxlit_obyekt_v1) bilan: yadro hisob() aynan.
--   t2_obyekt_nakrutka_v1, view t2_obyekt_nakrutka — v2 ga o'tdi (ustunlar o'zgarmadi).
--   _t2_summa_agg_v1                  — svq ga 'svod_qqs_bilan', 'svod_summa_qqssiz', 'svod_summa_soni' qo'shildi (faqat smeta).
--   _t2_summa_paket_hisob_v1          — yakun orqali; JSON shakli o'sha (+ 'yaxlit_qqs_bilan', ustama.skl_mk va h.).

-- ─────────────────────────────── 1. Yordamchi va kaskad ───────────────────────────────
create or replace function public._t2_r2_v1(p_x numeric, p_yaxlit boolean)
 returns numeric
 language sql
 immutable parallel safe
 set search_path to 'public', 'pg_temp'
as $function$
  select case when p_yaxlit is false then p_x else round(p_x, 2) end;
$function$;
revoke all on function public._t2_r2_v1(numeric, boolean) from public, anon, authenticated;
grant execute on function public._t2_r2_v1(numeric, boolean) to service_role;

create or replace function public._t2_nakrutka_kaskad_v1(p_cats jsonb, p_nk jsonb, p_yaxlit boolean default true)
 returns jsonb
 language plpgsql
 immutable parallel safe
 set search_path to 'public', 'pg_temp'
as $function$
declare
  y boolean := p_yaxlit is not false;
  chel numeric := coalesce((p_cats->>'chel')::numeric, 0);
  mash numeric := coalesce((p_cats->>'mash')::numeric, 0);
  mat  numeric := coalesce((p_cats->>'mat')::numeric, 0);
  ob   numeric := coalesce((p_cats->>'ob')::numeric, 0);
  mk   numeric := coalesce((p_cats->>'mk')::numeric, 0);
  kab  numeric := coalesce((p_cats->>'kab')::numeric, 0);
  bez  numeric := coalesce((p_cats->>'bez')::numeric, 0);
  -- coalesce(…, 0): server nk doim sukut || override (hamma kalit bor, NOT NULL) — yuqoridagi 5-band.
  k_transport_mat numeric := coalesce((p_nk->>'ТРАНСПОРТ_МАТЕРИАЛ')::numeric, 0);
  k_sklad_mat     numeric := coalesce((p_nk->>'СКЛАДСКИЕ_МАТЕРИАЛ')::numeric, 0);
  k_sklad_mk      numeric := coalesce((p_nk->>'СКЛАДСКИЕ_МК')::numeric, 0);
  k_transport_kab numeric := coalesce((p_nk->>'ТРАНСПОРТ_КАБЕЛЬ')::numeric, 0);
  k_prochie       numeric := coalesce((p_nk->>'ПРОЧИЕ_ПОДРЯДЧИК')::numeric, 0);
  k_transport_ob  numeric := coalesce((p_nk->>'ТРАНСПОРТ_ОБОРУД')::numeric, 0);
  k_zagot_ob      numeric := coalesce((p_nk->>'ЗАГОТ_СКЛАД_ОБОРУД')::numeric, 0);
  k_strah         numeric := coalesce((p_nk->>'СТРАХОВАНИЕ')::numeric, 0);
  k_risk          numeric := coalesce((p_nk->>'РИСК')::numeric, 0);
  k_nds           numeric := coalesce((p_nk->>'НДС')::numeric, 0);
  pryamye numeric; tr_mat numeric; skl_mat numeric; skl_mk numeric; tr_kab numeric;
  itogo1 numeric; prochie numeric; itogo2 numeric;
  tr_ob numeric; zag_ob numeric; itogo3 numeric;
  strax numeric; risk numeric; itogo4 numeric; nds numeric; vsego numeric;
begin
  -- Yadro standartPodval tartibi (mat — to'liq savat: МАТ + КАБ + М/К + БЕЗСКЛАД).
  pryamye := public._t2_r2_v1(chel + mash + mat + ob, y);                         -- Σ KATLAR
  tr_mat  := public._t2_r2_v1((mat - kab) * k_transport_mat * 0.01, y);           -- МАТ + М/К + БЕЗ СКЛАД
  skl_mat := public._t2_r2_v1((mat - bez - mk) * k_sklad_mat * 0.01, y);          -- МАТ + КАБ
  skl_mk  := public._t2_r2_v1(mk * k_sklad_mk * 0.01, y);                         -- М/К
  tr_kab  := public._t2_r2_v1(kab * k_transport_kab * 0.01, y);                   -- КАБ
  itogo1  := public._t2_r2_v1(pryamye - ob + tr_mat + skl_mat + skl_mk + tr_kab, y);
  prochie := public._t2_r2_v1(itogo1 * k_prochie * 0.01, y);
  itogo2  := public._t2_r2_v1(itogo1 + prochie, y);
  tr_ob   := public._t2_r2_v1(ob * k_transport_ob * 0.01, y);
  zag_ob  := public._t2_r2_v1(ob * k_zagot_ob * 0.01, y);
  itogo3  := public._t2_r2_v1(itogo2 + ob + tr_ob + zag_ob, y);
  strax   := public._t2_r2_v1(itogo3 * k_strah * 0.01, y);
  risk    := public._t2_r2_v1(itogo3 * k_risk * 0.01, y);
  itogo4  := public._t2_r2_v1(itogo3 + strax + risk, y);
  nds     := public._t2_r2_v1(itogo4 * k_nds * 0.01, y);
  vsego   := public._t2_r2_v1(itogo4 + nds, y);
  return jsonb_build_object(
    'pryamye', pryamye, 'chel', chel, 'mash', mash, 'mat', mat, 'ob', ob, 'kab', kab,
    'tr_mat', tr_mat, 'skl_mat', skl_mat + skl_mk, 'skl_mk', skl_mk, 'tr_kab', tr_kab,
    'itogo1', itogo1, 'prochie', prochie, 'itogo2', itogo2,
    'tr_ob', tr_ob, 'zag_ob', zag_ob, 'itogo3', itogo3,
    'strax', strax, 'risk', risk, 'itogo4', itogo4,
    'nds', nds, 'vsego', vsego);
end $function$;
revoke all on function public._t2_nakrutka_kaskad_v1(jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public._t2_nakrutka_kaskad_v1(jsonb, jsonb, boolean) to service_role;

create or replace function public.t2_nakrutka_hisobla_v1(p_cats jsonb, p_nk jsonb)
 returns jsonb
 language sql
 immutable parallel safe
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select public._t2_nakrutka_kaskad_v1(p_cats, p_nk, true);
$function$;

-- Kf — yaxlitlanmagan (yadro podvalKf): pul hisobi uchun aniq koeffitsient, ekran Kf = yadro Kf.
create or replace function public.t2_nakrutka_koef_jadval_v1(p_nk jsonb)
 returns jsonb
 language sql
 immutable parallel safe
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select jsonb_build_object(
    'ЧЕЛ',      (public._t2_nakrutka_kaskad_v1(jsonb_build_object('chel',1), p_nk, false)->>'vsego')::numeric,
    'МАШ',      (public._t2_nakrutka_kaskad_v1(jsonb_build_object('mash',1), p_nk, false)->>'vsego')::numeric,
    'МАТ',      (public._t2_nakrutka_kaskad_v1(jsonb_build_object('mat',1), p_nk, false)->>'vsego')::numeric,
    'ОБ',       (public._t2_nakrutka_kaskad_v1(jsonb_build_object('ob',1), p_nk, false)->>'vsego')::numeric,
    'М/К',      (public._t2_nakrutka_kaskad_v1(jsonb_build_object('mat',1,'mk',1), p_nk, false)->>'vsego')::numeric,
    'КАБ',      (public._t2_nakrutka_kaskad_v1(jsonb_build_object('mat',1,'kab',1), p_nk, false)->>'vsego')::numeric,
    'БЕЗСКЛАД', (public._t2_nakrutka_kaskad_v1(jsonb_build_object('mat',1,'bez',1), p_nk, false)->>'vsego')::numeric
  );
$function$;

-- ─────────────────────────────── 2. Kaskad yakuni (yadro kaskad()) ───────────────────────────────
-- p_nomalum      — kategoriyasi noma'lum summa (yadro nomalumQism): ИТОГО-4 ga ustamasiz, QQS undan keyin.
-- p_oldin        — QQS SIZ ustamasiz qism (yadro 'qqssiz_ustamadan_keyin'): subpudrat / ustamasiz / svod summasiz bo'lim.
-- p_keyin_qqs_bilan / p_keyin_qqssiz — QQS BILAN svod summasi (yadro 'qqsdan_keyin'), НДС dan keyin; null — yo'q.
-- Natija: p_h || sarlavha (itogo4 = ishlar + svod QQS siz, nds = ВСЕГО − ИТОГО-4, vsego = ishlar ВСЕГО + svod)
--         + 'ishlar_*' (podval qatorlari: ИТОГО-4/НДС ishlar + oldin qism), 'kaskad_*' (sof kaskad).
create or replace function public._t2_kaskad_yakun_v1(p_h jsonb, p_nomalum numeric, p_oldin numeric,
  p_keyin_qqs_bilan numeric, p_keyin_qqssiz numeric, p_nk jsonb)
 returns jsonb
 language plpgsql
 immutable parallel safe
 set search_path to 'public', 'pg_temp'
as $function$
declare
  k_nds numeric := coalesce((p_nk->>'НДС')::numeric, 0);
  v_nom numeric := case when coalesce(p_nomalum, 0) <> 0 then round(p_nomalum, 2) end;
  v_oldin numeric := round(coalesce(v_nom, 0) + coalesce(p_oldin, 0), 2);
  v_keyin boolean := p_keyin_qqs_bilan is not null;
  v_kb numeric := round(p_keyin_qqs_bilan, 2);
  v_ks numeric := round(p_keyin_qqssiz, 2);
  v_i4 numeric; v_nds numeric; v_vs numeric;
  i4w numeric; ndsw numeric; vsw numeric;
begin
  if p_h is null then return null; end if;
  if v_oldin = 0 and not v_keyin then return p_h; end if;
  v_i4 := (p_h->>'itogo4')::numeric; v_nds := (p_h->>'nds')::numeric; v_vs := (p_h->>'vsego')::numeric;
  i4w := round(v_i4 + v_oldin, 2);
  if v_oldin = 0 then
    ndsw := v_nds; vsw := v_vs;
  else
    ndsw := round(i4w * k_nds * 0.01, 2);
    vsw := round(i4w + ndsw, 2);
  end if;
  return p_h || jsonb_build_object(
    'kaskad_itogo4', p_h->'itogo4', 'kaskad_nds', p_h->'nds', 'kaskad_vsego', p_h->'vsego',
    'nomalum_qism', v_nom,
    'yaxlit_oldin', case when coalesce(p_oldin, 0) <> 0 then round(p_oldin, 2) end,
    'yaxlit_qqs_bilan', case when v_keyin then v_kb end,
    'ishlar_itogo4', i4w, 'ishlar_nds', ndsw, 'ishlar_vsego', vsw,
    'itogo4', case when v_keyin then round(i4w + v_ks, 2) else i4w end,
    'nds',    case when v_keyin then round(ndsw + v_kb - v_ks, 2) else ndsw end,
    'vsego',  case when v_keyin then round(vsw + v_kb, 2) else vsw end);
end $function$;
revoke all on function public._t2_kaskad_yakun_v1(jsonb, numeric, numeric, numeric, numeric, jsonb) from public, anon, authenticated;
grant execute on function public._t2_kaskad_yakun_v1(jsonb, numeric, numeric, numeric, numeric, jsonb) to service_role;

-- Avvalgi imzo va ma'no: p_qqssiz — QQS SIZ, ИТОГО-4 ga ustamasiz qo'shiladi, QQS bir marta (yadro 'qqssiz_ustamadan_keyin').
create or replace function public.t2_nakrutka_yaxlit_qosh_v1(p_h jsonb, p_qqssiz numeric, p_barglar numeric, p_nk jsonb)
 returns jsonb
 language plpgsql
 immutable parallel safe
 set search_path to 'public', 'pg_temp'
as $function$
declare v_pr numeric;
begin
  if p_h is null or p_qqssiz is null then return p_h; end if;
  -- Ustamasiz (yadro hisob().ustamasiz) = xom kategoriyalar + barglar, bir marta yaxlitlanadi.
  v_pr := coalesce((p_h->>'chel')::numeric + (p_h->>'mash')::numeric + (p_h->>'mat')::numeric + (p_h->>'ob')::numeric,
                   (p_h->>'pryamye')::numeric);
  return public._t2_kaskad_yakun_v1(p_h, 0, p_qqssiz, null, null, p_nk) || jsonb_build_object(
    'kaskad_pryamye', p_h->'pryamye',
    'kaskad_itogo4', p_h->'itogo4',
    'pryamye', round(v_pr + coalesce(p_barglar, 0), 2),
    'yaxlit', round(p_qqssiz, 2),
    'yaxlit_barglar', round(coalesce(p_barglar, 0), 2));
end $function$;

-- Obyekt svod xulosasi bilan (yadro hisob() + svodKesimYaxlit aynan; egasi 2026-10-31 — yagona model, paket bilan bir xil):
-- svod summasi bor bo'limlar — QQS bilan aynan, НДС dan keyin ('qqsdan_keyin');
-- qolgan yaxlit (svod summasiz bo'lim tarkibi — xom, QQS siz) — ИТОГО-4 ga, QQS jamidan ('qqssiz_ustamadan_keyin').
create or replace function public.t2_nakrutka_yaxlit_qosh_v2(p_h jsonb, p_yax jsonb, p_nk jsonb)
 returns jsonb
 language plpgsql
 immutable parallel safe
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_svq numeric; v_svs numeric; v_yax numeric; v_barg numeric; v_qolgan numeric; v_pr numeric;
begin
  if p_h is null or p_yax is null or jsonb_typeof(p_yax) <> 'object' then return p_h; end if;
  select round(coalesce(sum((b->>'svod_summa')::numeric), 0), 2), round(coalesce(sum((b->>'qqssiz')::numeric), 0), 2)
    into v_svq, v_svs
    from jsonb_array_elements(case when jsonb_typeof(p_yax->'bolimlar') = 'array' then p_yax->'bolimlar' else '[]'::jsonb end) b
   where jsonb_typeof(b->'svod_summa') = 'number';
  v_yax := coalesce((p_yax->>'qqssiz')::numeric, 0);
  v_barg := coalesce((p_yax->>'barglar')::numeric, 0);
  v_qolgan := v_yax - v_svs;
  v_pr := coalesce((p_h->>'chel')::numeric + (p_h->>'mash')::numeric + (p_h->>'mat')::numeric + (p_h->>'ob')::numeric,
                   (p_h->>'pryamye')::numeric);
  return public._t2_kaskad_yakun_v1(p_h, 0,
           case when abs(v_qolgan) < 0.005 then 0 else v_qolgan end,
           case when v_svq <> 0 or v_svs <> 0 then v_svq end,
           case when v_svq <> 0 or v_svs <> 0 then v_svs end, p_nk) || jsonb_build_object(
    'kaskad_pryamye', p_h->'pryamye',
    'pryamye', round(v_pr + v_barg, 2),
    'yaxlit', round(v_yax, 2),
    'yaxlit_barglar', round(v_barg, 2));
end $function$;
revoke all on function public.t2_nakrutka_yaxlit_qosh_v2(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.t2_nakrutka_yaxlit_qosh_v2(jsonb, jsonb, jsonb) to service_role;

-- ─────────────────────────────── 3. Obyekt nakrutka (RPC + view) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.t2_obyekt_nakrutka_v1(p_obyekt_id bigint, p_actor_id bigint, p_shartnoma_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_rol text; v_cats jsonb; v_nk_javob jsonb; v_shartnoma_id bigint := p_shartnoma_id;
  v_nk jsonb; v_podval_id bigint; v_podval_nk jsonb; v_manba text;
  v_yax jsonb; v_cats_kaskad jsonb; v_javob jsonb;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_shartnoma_id is null then
    select sb.shartnoma_id into v_shartnoma_id
    from public.t2_shartnoma_bog sb
    where sb.obyekt_id = p_obyekt_id and sb.holat = 'faol' limit 1;
  end if;

  select jsonb_build_object(
    'chel', coalesce(sum(summa) filter (where kat='ЧЕЛ'), 0),
    'mash', coalesce(sum(summa) filter (where kat='МАШ'), 0),
    'mat',  coalesce(sum(summa) filter (where kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0),
    'ob',   coalesce(sum(summa) filter (where kat='ОБ'), 0),
    'mk',   coalesce(sum(summa) filter (where kat='М/К'), 0),
    'kab',  coalesce(sum(summa) filter (where kat='КАБ'), 0),
    'bez',  coalesce(sum(summa) filter (where kat='БЕЗСКЛАД'), 0))
  into v_cats
  from public.t2_qator
  where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and versiya_holat = 'faol';

  v_nk_javob := public.t2_nakrutka_koef_ol_v1(v_komp, p_actor_id, v_shartnoma_id);
  v_nk := v_nk_javob->'koeffitsientlar';
  v_manba := case when v_shartnoma_id is not null and exists (
                    select 1 from public.t2_nakrutka_koef n where n.kompaniya_id = v_komp and n.shartnoma_id = v_shartnoma_id) then 'shartnoma'
                  when exists (select 1 from public.t2_nakrutka_koef n where n.kompaniya_id = v_komp and n.shartnoma_id is null) then 'kompaniya'
                  else 'sukut' end;
  select p.id, public.t2_nakrutka_podval_smeta_nk_v1(p.qatorlar) into v_podval_id, v_podval_nk
  from public.t2_nakrutka_podval p
  where p.obyekt_id = p_obyekt_id and p.kompaniya_id = v_komp and p.faol
  order by p.id desc limit 1;
  if v_podval_nk is not null and v_podval_nk <> '{}'::jsonb then
    v_nk := v_nk || v_podval_nk;
    v_manba := 'smeta_podvali';
  else
    v_podval_id := null;
  end if;

  v_yax := public.t2_svod_yaxlit_obyekt_v1(p_obyekt_id);
  if v_yax is null then
    return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id,
      'cats', v_cats, 'koeffitsientlar', v_nk,
      'nakrutka', public.t2_nakrutka_hisobla_v1(v_cats, v_nk),
      'jadval', public.t2_nakrutka_koef_jadval_v1(v_nk),
      'nk_manba', v_manba, 'nakrutka_podval_id', v_podval_id);
  end if;

  with recursive yr as (
    select y.qator_id as id from public.t2_svod_yaxlit y where y.obyekt_id = p_obyekt_id and y.faol
    union
    select q.id from public.t2_qator q join yr on q.ota_id = yr.id
  )
  select jsonb_build_object(
    'chel', coalesce(sum(summa) filter (where kat='ЧЕЛ'), 0),
    'mash', coalesce(sum(summa) filter (where kat='МАШ'), 0),
    'mat',  coalesce(sum(summa) filter (where kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0),
    'ob',   coalesce(sum(summa) filter (where kat='ОБ'), 0),
    'mk',   coalesce(sum(summa) filter (where kat='М/К'), 0),
    'kab',  coalesce(sum(summa) filter (where kat='КАБ'), 0),
    'bez',  coalesce(sum(summa) filter (where kat='БЕЗСКЛАД'), 0))
  into v_cats_kaskad
  from public.t2_qator q
  where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol'
    and not exists (select 1 from yr where yr.id = q.id);

  v_javob := jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id,
    'cats', v_cats, 'cats_kaskad', v_cats_kaskad, 'koeffitsientlar', v_nk,
    'nakrutka', public.t2_nakrutka_yaxlit_qosh_v2(public.t2_nakrutka_hisobla_v1(v_cats_kaskad, v_nk), v_yax, v_nk),
    'jadval', public.t2_nakrutka_koef_jadval_v1(v_nk),
    'nk_manba', v_manba, 'nakrutka_podval_id', v_podval_id,
    'svod_yaxlit', v_yax);
  return v_javob;
end $function$;

CREATE OR REPLACE VIEW public.t2_obyekt_nakrutka AS
 WITH RECURSIVE yr AS (
         SELECT y.id AS bolim_id,
            y.obyekt_id,
            y.qator_id AS id
           FROM t2_svod_yaxlit y
          WHERE y.faol
        UNION ALL
         SELECT yr.bolim_id,
            yr.obyekt_id,
            q.id
           FROM t2_qator q
             JOIN yr ON q.ota_id = yr.id
        ), yq AS (
         SELECT DISTINCT yr.id
           FROM yr
        ), kat AS (
         SELECT q.obyekt_id,
            COALESCE(sum(q.summa) FILTER (WHERE q.kat = 'ЧЕЛ'::text AND yq.id IS NULL), 0::numeric) AS chel,
            COALESCE(sum(q.summa) FILTER (WHERE q.kat = 'МАШ'::text AND yq.id IS NULL), 0::numeric) AS mash,
            COALESCE(sum(q.summa) FILTER (WHERE (q.kat = ANY (ARRAY['МАТ'::text, 'М/К'::text, 'КАБ'::text, 'БЕЗСКЛАД'::text])) AND yq.id IS NULL), 0::numeric) AS mat,
            COALESCE(sum(q.summa) FILTER (WHERE q.kat = 'ОБ'::text AND yq.id IS NULL), 0::numeric) AS ob,
            COALESCE(sum(q.summa) FILTER (WHERE q.kat = 'М/К'::text AND yq.id IS NULL), 0::numeric) AS mk,
            COALESCE(sum(q.summa) FILTER (WHERE q.kat = 'КАБ'::text AND yq.id IS NULL), 0::numeric) AS kab,
            COALESCE(sum(q.summa) FILTER (WHERE q.kat = 'БЕЗСКЛАД'::text AND yq.id IS NULL), 0::numeric) AS bez
           FROM t2_qator q
             LEFT JOIN yq ON yq.id = q.id
          WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.versiya_holat = 'faol'::text
          GROUP BY q.obyekt_id
        ), yax AS (
         SELECT o.obyekt_id,
            (o.x ->> 'qqssiz'::text)::numeric AS qqssiz,
            (o.x ->> 'barglar'::text)::numeric AS barglar,
            o.x
           FROM ( SELECT DISTINCT y.obyekt_id,
                    t2_svod_yaxlit_obyekt_v1(y.obyekt_id) AS x
                   FROM t2_svod_yaxlit y
                  WHERE y.faol) o
        ), bog AS (
         SELECT DISTINCT ON (b.obyekt_id) b.obyekt_id,
            b.shartnoma_id
           FROM t2_shartnoma_bog b
             JOIN t2_shartnoma s ON s.id = b.shartnoma_id
          WHERE b.holat = 'faol'::text AND s.holat <> 'bekor'::text
          ORDER BY b.obyekt_id, b.shartnoma_id
        ), effective AS (
         SELECT k.obyekt_id,
            b.shartnoma_id,
            k.chel,
            k.mash,
            k.mat,
            k.ob,
            k.mk,
            k.kab,
            k.bez,
            ((t2_nakrutka_default_v1() || COALESCE(company.nk, '{}'::jsonb)) || COALESCE(contract.nk, '{}'::jsonb)) || COALESCE(podval.nk, '{}'::jsonb) AS nk,
                CASE
                    WHEN podval.nk IS NOT NULL AND podval.nk <> '{}'::jsonb THEN 'smeta_podvali'::text
                    WHEN contract.nk IS NOT NULL THEN 'shartnoma'::text
                    WHEN company.nk IS NOT NULL THEN 'kompaniya'::text
                    ELSE 'sukut'::text
                END AS nk_manba,
                CASE
                    WHEN podval.nk IS NOT NULL AND podval.nk <> '{}'::jsonb THEN podval.id
                    ELSE NULL::bigint
                END AS nakrutka_podval_id
           FROM kat k
             JOIN t2_obyekt o ON o.id = k.obyekt_id
             LEFT JOIN bog b ON b.obyekt_id = k.obyekt_id
             LEFT JOIN LATERAL ( SELECT jsonb_object_agg(n.koef_kod, to_jsonb(n.qiymat)) AS nk
                   FROM t2_nakrutka_koef n
                  WHERE n.kompaniya_id = o.kompaniya_id AND n.shartnoma_id IS NULL) company ON true
             LEFT JOIN LATERAL ( SELECT jsonb_object_agg(n.koef_kod, to_jsonb(n.qiymat)) AS nk
                   FROM t2_nakrutka_koef n
                  WHERE n.kompaniya_id = o.kompaniya_id AND n.shartnoma_id = b.shartnoma_id) contract ON true
             LEFT JOIN LATERAL ( SELECT p.id,
                    t2_nakrutka_podval_smeta_nk_v1(p.qatorlar) AS nk
                   FROM t2_nakrutka_podval p
                  WHERE p.obyekt_id = k.obyekt_id AND p.kompaniya_id = o.kompaniya_id AND p.faol
                  ORDER BY p.id DESC
                 LIMIT 1) podval ON true
        ), calc AS (
         SELECT e.obyekt_id,
            e.shartnoma_id,
            e.chel,
            e.mash,
            e.mat,
            e.ob,
            e.mk,
            e.kab,
            e.bez,
            e.nk,
            e.nk_manba,
            e.nakrutka_podval_id,
            y.qqssiz AS yaxlit,
            y.barglar AS yaxlit_barglar,
            t2_nakrutka_yaxlit_qosh_v2(t2_nakrutka_hisobla_v1(jsonb_build_object('chel', e.chel, 'mash', e.mash, 'mat', e.mat, 'ob', e.ob, 'mk', e.mk, 'kab', e.kab, 'bez', e.bez), e.nk), y.x, e.nk) AS h,
            t2_nakrutka_koef_jadval_v1(e.nk) AS kf
           FROM effective e
             LEFT JOIN yax y ON y.obyekt_id = e.obyekt_id
        )
 SELECT obyekt_id,
    shartnoma_id,
    chel,
    mash,
    mat,
    ob,
    (h ->> 'pryamye'::text)::numeric AS pryamye,
    (h ->> 'tr_mat'::text)::numeric AS tr_mat,
    (h ->> 'skl_mat'::text)::numeric AS skl_mat,
    (h ->> 'tr_kab'::text)::numeric AS tr_kab,
    (h ->> 'itogo1'::text)::numeric AS itogo1,
    (h ->> 'prochie'::text)::numeric AS prochie,
    (h ->> 'itogo2'::text)::numeric AS itogo2,
    (h ->> 'tr_ob'::text)::numeric AS tr_ob,
    (h ->> 'zag_ob'::text)::numeric AS zag_ob,
    (h ->> 'itogo3'::text)::numeric AS itogo3,
    (h ->> 'strax'::text)::numeric AS strax,
    (h ->> 'risk'::text)::numeric AS risk,
    (h ->> 'itogo4'::text)::numeric AS itogo4,
    (h ->> 'nds'::text)::numeric AS nds,
    (h ->> 'vsego'::text)::numeric AS vsego,
    (kf ->> 'ЧЕЛ'::text)::numeric AS kf_chel,
    (kf ->> 'МАШ'::text)::numeric AS kf_mash,
    (kf ->> 'МАТ'::text)::numeric AS kf_mat,
    (kf ->> 'ОБ'::text)::numeric AS kf_ob,
    (kf ->> 'М/К'::text)::numeric AS kf_mk,
    (kf ->> 'КАБ'::text)::numeric AS kf_kab,
    (kf ->> 'БЕЗСКЛАД'::text)::numeric AS kf_bezsklad,
    mk,
    kab,
    nk_manba,
    nakrutka_podval_id,
    nk AS koeffitsientlar,
    yaxlit,
    yaxlit_barglar
   FROM calc c;

-- ─────────────────────────────── 4. Summa paketi ───────────────────────────────
-- Agg: svod summasi bor bo'limlar (faqat smeta o'lchovi) uchun QQS bilan summa va uning QQS siz qismi alohida.
CREATE OR REPLACE FUNCTION public._t2_summa_agg_v1(p_obyekt_ids bigint[], p_olchov text, p_akt_ids bigint[] DEFAULT NULL::bigint[], p_dan date DEFAULT NULL::date, p_gacha date DEFAULT NULL::date)
 RETURNS TABLE(obyekt_id bigint, agg jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with recursive
  bolim0 as (
    select y.id, y.obyekt_id, y.qator_id, y.turi, y.kontragent_nom, y.svod_summa, y.qqs_stavka
      from public.t2_svod_yaxlit y where y.faol and y.obyekt_id = any(p_obyekt_ids)
       and (p_olchov <> 'smeta' or exists (select 1 from public.t2_qator qq where qq.id = y.qator_id and qq.versiya_holat = 'faol'))
  ),
  yr as (
    select b.id as bolim_id, b.qator_id as id from bolim0 b
    union all
    select yr.bolim_id, q.id from public.t2_qator q join yr on q.ota_id = yr.id
  ),
  yb as (select distinct on (yr.id) yr.id, yr.bolim_id from yr order by yr.id, yr.bolim_id),
  ota as (select distinct q.ota_id as id from public.t2_qator q where q.obyekt_id = any(p_obyekt_ids) and q.ota_id is not null),
  miqdor as (
    select q.id as qator_id, q.summa as s, q.hajm as h, (q.summa is null and coalesce(q.hajm, 0) <> 0) as nom, null::numeric as osh
      from public.t2_qator q
     where p_olchov = 'smeta' and q.obyekt_id = any(p_obyekt_ids) and q.versiya_holat = 'faol'
    union all
    select h.qator_id, h.fakt_summa, h.fakt_hajm, (h.fakt_summa is null and coalesce(h.fakt_hajm, 0) <> 0),
           case when coalesce(h.f2_hajm, 0) > coalesce(h.smeta_hajm, 0) and h.smeta_narx is not null
                then (h.f2_hajm - coalesce(h.smeta_hajm, 0)) * h.smeta_narx end
      from public.t2_qator_holat h
     where p_olchov = 'fakt' and h.obyekt_id = any(p_obyekt_ids)
    union all
    select aq.qator_id, coalesce(aq.certified_amount, aq.summa), coalesce(aq.certified_quantity, aq.hajm, 0),
           (coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0), null::numeric
      from public.t2_akt a
      join public.t2_akt_qator aq on aq.akt_id = a.id
     where p_olchov in ('f2', 'f2_qoralama', 'aktlar')
       and a.obyekt_id = any(p_obyekt_ids)
       and case p_olchov
             when 'f2' then a.tur = 'f2' and a.holat = 'tasdiqlangan'
             when 'f2_qoralama' then a.tur = 'f2' and a.holat = 'qoralama'
             else a.id = any(coalesce(p_akt_ids, '{}'::bigint[])) end
       and (p_dan is null or a.oy >= p_dan)
       and (p_gacha is null or a.oy <= p_gacha)
  ),
  qm as (
    select m.qator_id, sum(m.s) as s, sum(m.h) as h, bool_or(m.nom) as nom_bor, sum(m.osh) as osh
      from miqdor m group by m.qator_id
  ),
  r as (
    select q.obyekt_id, q.id, q.tur, q.kat, coalesce(q.birlik, '') as birlik, qm.s, qm.h, qm.osh,
           (qm.nom_bor and q.tur not in ('rz', 'bl') and coalesce(q.nom, '') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ') as narxsiz,
           b.id as bolim_id, b.turi, b.kontragent_nom
      from qm
      join public.t2_qator q on q.id = qm.qator_id and q.obyekt_id = any(p_obyekt_ids)
      left join ota on ota.id = q.id
      left join yb on yb.id = q.id
      left join bolim0 b on b.id = yb.bolim_id
     where ota.id is null
  ),
  bs as (select r.bolim_id, sum(r.s) as s from r where r.bolim_id is not null group by r.bolim_id),
  svq as (
    select b.obyekt_id,
           sum(case when p_olchov = 'smeta' and b.svod_summa is not null then round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)
                    else coalesce(bs.s, 0) end) as qqssiz,
           -- Svod summasi (QQS BILAN, yakuniy) bor bo'limlar: yadro 'qqsdan_keyin' — НДС dan keyin aynan.
           sum(b.svod_summa) filter (where p_olchov = 'smeta' and b.svod_summa is not null) as summa_qqs_bilan,
           sum(round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)) filter (where p_olchov = 'smeta' and b.svod_summa is not null) as summa_qqssiz,
           count(*) filter (where p_olchov = 'smeta' and b.svod_summa is not null) as summa_soni
      from bolim0 b left join bs on bs.bolim_id = b.id
     where b.turi = 'svod'
     group by b.obyekt_id
  ),
  sub as (
    select x.obyekt_id, jsonb_agg(jsonb_build_object('kontragent', x.k, 'summa', x.summa) order by x.summa desc) as royxat
      from (select r.obyekt_id, coalesce(r.kontragent_nom, '—') as k, round(sum(r.s), 2) as summa
              from r where r.turi = 'subpudrat' group by 1, 2) x
     group by x.obyekt_id
  ),
  ag as (
    select r.obyekt_id,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'ЧЕЛ'), 0) as chel,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'МАШ'), 0) as mash,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0) as mat,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'ОБ'), 0) as ob,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'М/К'), 0) as mk,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'КАБ'), 0) as kab,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'БЕЗСКЛАД'), 0) as bez,
      coalesce(sum(r.s) filter (where r.bolim_id is null and (r.kat is null or r.kat not in ('ЧЕЛ','МАШ','МАТ','М/К','КАБ','БЕЗСКЛАД','ОБ'))), 0) as nomalum,
      coalesce(sum(r.s) filter (where r.turi = 'svod'), 0) as svod,
      coalesce(sum(r.s) filter (where r.turi = 'subpudrat'), 0) as subpudrat,
      coalesce(sum(r.s) filter (where r.turi = 'ustamasiz'), 0) as ustamasiz,
      coalesce(sum(r.h) filter (where r.bolim_id is null and r.kat = 'ЧЕЛ' and r.birlik ~ '^(ЧЕЛ|чел|Чел)'), 0) as chel_soat,
      coalesce(sum(r.h) filter (where r.bolim_id is null and r.kat = 'МАШ' and r.birlik ~ '^(МАШ|маш|Маш)'), 0) as mash_soat,
      coalesce(sum(r.h) filter (where r.bolim_id is null and r.kat = 'МАШ' and r.birlik ~ '^(ЧЕЛ|чел|Чел)'), 0) as mashinist_soat,
      count(*) filter (where r.narxsiz) as narxsiz_soni,
      count(*) filter (where r.s is not null and r.s <> 0) as qator_soni,
      sum(r.osh) filter (where r.osh > 0) as osh,
      count(*) filter (where r.osh > 0) as osh_soni
    from r group by r.obyekt_id
  )
  select o.id,
    jsonb_build_object('chel', coalesce(ag.chel, 0), 'mash', coalesce(ag.mash, 0), 'mat', coalesce(ag.mat, 0), 'ob', coalesce(ag.ob, 0),
      'mk', coalesce(ag.mk, 0), 'kab', coalesce(ag.kab, 0), 'bez', coalesce(ag.bez, 0), 'nomalum', coalesce(ag.nomalum, 0),
      'svod', coalesce(ag.svod, 0), 'svod_qqssiz', coalesce(svq.qqssiz, 0), 'subpudrat', coalesce(ag.subpudrat, 0), 'ustamasiz', coalesce(ag.ustamasiz, 0),
      'svod_qqs_bilan', coalesce(svq.summa_qqs_bilan, 0), 'svod_summa_qqssiz', coalesce(svq.summa_qqssiz, 0), 'svod_summa_soni', coalesce(svq.summa_soni, 0),
      'chel_soat', coalesce(ag.chel_soat, 0), 'mash_soat', coalesce(ag.mash_soat, 0), 'mashinist_soat', coalesce(ag.mashinist_soat, 0),
      'narxsiz_soni', coalesce(ag.narxsiz_soni, 0), 'qator_soni', coalesce(ag.qator_soni, 0),
      'subpudratchilar', coalesce(sub.royxat, '[]'::jsonb))
    || case when p_olchov = 'fakt' then jsonb_build_object('smetadan_oshgan', coalesce(ag.osh, 0), 'smetadan_oshgan_soni', coalesce(ag.osh_soni, 0))
            else '{}'::jsonb end
  from unnest(p_obyekt_ids) as o(id)
  left join ag on ag.obyekt_id = o.id
  left join svq on svq.obyekt_id = o.id
  left join sub on sub.obyekt_id = o.id;
$function$;

-- Paket hisobi = yadro kaskad(kat, standartPodval(nk), { nomalumQism: nomalum,
--   yaxlitlar: [{ bosqich: 'qqssiz_ustamadan_keyin', qqssiz: subpudrat + ustamasiz + svod summasiz qism }],
--   yaxlit: svod summasi bor bo'limlar ? { qqsBilan: Σ svod_summa, qqssiz: Σ round(svod_summa/(1+st), 2) } : null }).
-- JSON shakli avvalgidek (qqs_bilan, qqs, ustamali, ustamasiz, qqs_foiz, ustamasiz_qism, kesim, soat, …, ustama).
CREATE OR REPLACE FUNCTION public._t2_summa_paket_hisob_v1(p_agg jsonb, p_nk jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a jsonb := coalesce(p_agg, '{}'::jsonb);
  v_chel numeric := coalesce((a->>'chel')::numeric, 0);
  v_mash numeric := coalesce((a->>'mash')::numeric, 0);
  v_mat  numeric := coalesce((a->>'mat')::numeric, 0);
  v_ob   numeric := coalesce((a->>'ob')::numeric, 0);
  v_svod numeric := coalesce((a->>'svod')::numeric, 0);
  v_svod_qqssiz numeric := coalesce((a->>'svod_qqssiz')::numeric, (a->>'svod')::numeric, 0);
  v_sub  numeric := coalesce((a->>'subpudrat')::numeric, 0);
  v_ust  numeric := coalesce((a->>'ustamasiz')::numeric, 0);
  v_nom  numeric := coalesce((a->>'nomalum')::numeric, 0);
  -- Svod summasi (QQS bilan) bor bo'limlar; eski agg (kalitsiz) — hammasi QQS siz, QQS dan oldin (avvalgi ma'no).
  v_keyin boolean := coalesce((a->>'svod_summa_soni')::numeric, 0) > 0;
  v_kb numeric := case when coalesce((a->>'svod_summa_soni')::numeric, 0) > 0 then coalesce((a->>'svod_qqs_bilan')::numeric, 0) end;
  v_ks numeric := case when coalesce((a->>'svod_summa_soni')::numeric, 0) > 0 then coalesce((a->>'svod_summa_qqssiz')::numeric, 0) end;
  v_qism numeric; v_oldin numeric; h jsonb; k_nds numeric := coalesce((p_nk->>'НДС')::numeric, 0);
begin
  h := public.t2_nakrutka_hisobla_v1(jsonb_build_object('chel', v_chel, 'mash', v_mash, 'mat', v_mat, 'ob', v_ob,
         'mk', coalesce((a->>'mk')::numeric, 0), 'kab', coalesce((a->>'kab')::numeric, 0), 'bez', coalesce((a->>'bez')::numeric, 0)), p_nk);
  v_qism := v_svod_qqssiz + v_sub + v_ust + v_nom;
  v_oldin := (v_svod_qqssiz - coalesce(v_ks, 0)) + v_sub + v_ust;
  h := public._t2_kaskad_yakun_v1(h, v_nom, v_oldin, v_kb, v_ks, p_nk);
  return jsonb_build_object(
    'qqs_bilan', round((h->>'vsego')::numeric, 2),
    'qqs', round((h->>'nds')::numeric, 2),
    'ustamali', round((h->>'itogo4')::numeric, 2),
    'ustamasiz', round(v_chel + v_mash + v_mat + v_ob + v_svod + v_sub + v_ust + v_nom, 2),
    'qqs_foiz', k_nds,
    'ustamasiz_qism', round(v_qism, 2),
    'yaxlit_qqs_bilan', case when v_keyin then round(v_kb, 2) end,
    'kesim', jsonb_build_object('chel', round(v_chel, 2), 'mash', round(v_mash, 2), 'mat', round(v_mat, 2), 'ob', round(v_ob, 2),
      'subpudrat', round(v_sub, 2), 'svod', round(v_svod, 2), 'ustamasiz', round(v_ust, 2), 'nomalum', round(v_nom, 2)),
    'soat', jsonb_build_object('chel', round(coalesce((a->>'chel_soat')::numeric, 0), 2),
      'mash', round(coalesce((a->>'mash_soat')::numeric, 0), 2),
      'mashinist', round(coalesce((a->>'mashinist_soat')::numeric, 0), 2)),
    'subpudratchilar', coalesce(a->'subpudratchilar', '[]'::jsonb),
    'narxsiz_soni', coalesce((a->>'narxsiz_soni')::int, 0),
    'qator_soni', coalesce((a->>'qator_soni')::int, 0),
    'ustama', jsonb_strip_nulls(jsonb_build_object('tr_mat', h->'tr_mat', 'skl_mat', h->'skl_mat', 'skl_mk', h->'skl_mk', 'tr_kab', h->'tr_kab', 'itogo1', h->'itogo1',
      'prochie', h->'prochie', 'itogo2', h->'itogo2', 'tr_ob', h->'tr_ob', 'zag_ob', h->'zag_ob', 'itogo3', h->'itogo3',
      'strax', h->'strax', 'risk', h->'risk', 'itogo4', h->'itogo4', 'nds', h->'nds', 'vsego', h->'vsego',
      'ishlar_itogo4', h->'ishlar_itogo4', 'ishlar_nds', h->'ishlar_nds', 'yaxlit_qqs_bilan', h->'yaxlit_qqs_bilan')))
    || case when a ? 'smetadan_oshgan' then jsonb_build_object('smetadan_oshgan', round((a->>'smetadan_oshgan')::numeric, 2),
                                                                'smetadan_oshgan_soni', (a->>'smetadan_oshgan_soni')::int)
            else '{}'::jsonb end;
end $function$;
