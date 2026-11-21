-- T2_TRANSPORT_TURI_V1: har material uchun BITTA transport usuli (ikki marta haqi olinmasin).
--
-- Smetada transportning 3 ko'rinishi aralashib ketadi:
--   1. "ish" - Е310/С310/Е311 normativ ishlar (oddiy bl qatorlar; yuk - grunt/chiqindi, narxli material emas);
--   2. "tkm" - mahalliy ommaviy materiallar (asfalt, ГПС, shag'al, beton, temirbeton) uchun "Расчёт затрat транспорта":
--      material -> tonna (zichlik) x km x so'm/t·km; alohida t·km qatori materialga bog'lanadi;
--   3. "foiz" - podval "ТРАНСПОРТ ... НА ПРИВОЗНЫЕ МАТЕРИАЛЫ %" (МАТ/БЕЗСКЛАД/М/К, КАБ, ОБ kategoriyalari bazasiga).
-- To'rtinchi holat "narx_ichida" - material narxi yetkazib berishni o'z ichiga oladi (qo'shimcha transport yo'q).
--
-- Qoida: material (tur rs/mat/ob + material kat) uchun transport_usul (NULL = foiz). tkm/narx_ichida material
-- transport-% BAZASIDAN chiqariladi (boshqa foizlar - prochie/strax/sklad - avvalgidek). t·km qatori transport_manba_qator_id
-- orqali o'z materialiga bog'lanadi; bitta materialga bitta faol t·km qatori.
-- Tasdiqlangan F2 (olchov f2/aktlar) tarixi muzlagan - usul unga ta'sir qilmaydi.
--
-- O'zgargan funksiyalar: _t2_nakrutka_kaskad_v1 (tr_mat/tr_kab/tr_ob bazasi, ixtiyoriy tr_ex_* kalitlari),
-- _t2_summa_agg_v1 (7 arg; tr_ex_mat/tr_ex_kab/tr_ex_ob chiqaradi), _t2_summa_paket_hisob_v1 (kalitlarni kaskadga uzatadi).
-- Yangi: t2_qator_transport_audit_v1 (o'qish), _t2_qator_transport_guard_v1 (trigger).

-- ===== 1. Ustunlar va cheklovlar =====
alter table public.t2_qator
  add column if not exists transport_usul text,
  add column if not exists transport_manba_qator_id bigint references public.t2_qator(id),
  add column if not exists transport_zichlik numeric,
  add column if not exists transport_km numeric;

alter table public.t2_qator drop constraint if exists t2_qator_transport_usul_chk;
alter table public.t2_qator add constraint t2_qator_transport_usul_chk
  check (transport_usul is null or transport_usul in ('foiz', 'tkm', 'narx_ichida'));
alter table public.t2_qator drop constraint if exists t2_qator_transport_hisob_chk;
alter table public.t2_qator add constraint t2_qator_transport_hisob_chk
  check ((transport_zichlik is null or transport_zichlik > 0) and (transport_km is null or transport_km >= 0)
         and ((transport_zichlik is null and transport_km is null) or transport_manba_qator_id is not null));

-- (b) bitta materialga bittadan ortiq FAOL t·km qatori bo'lmaydi.
create unique index if not exists t2_qator_transport_manba_faol_uq
  on public.t2_qator (transport_manba_qator_id)
  where transport_manba_qator_id is not null and versiya_holat = 'faol';
create index if not exists t2_qator_transport_manba_ix
  on public.t2_qator (transport_manba_qator_id) where transport_manba_qator_id is not null;

comment on column public.t2_qator.transport_usul is
  'Material transport usuli: foiz (NULL = foiz, podval transport-% bazasida) | tkm (alohida t·km qatori; %-bazadan chiqariladi) | narx_ichida (narxda; %-bazadan chiqariladi).';
comment on column public.t2_qator.transport_manba_qator_id is
  'T·km transport qatori: u tashiydigan material qatori (transport_usul = tkm). NULL - oddiy qator.';

-- ===== 2. Himoya trigeri =====
create or replace function public._t2_qator_transport_guard_v1() returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $fn$
declare
  m public.t2_qator;
  v_mat_kat constant text[] := array['МАТ', 'М/К', 'КАБ', 'БЕЗСКЛАД', 'ОБ'];
begin
  if new.transport_usul is not null and not (new.tur in ('rs', 'mat', 'ob') and new.kat = any (v_mat_kat)) then
    raise exception 'TRANSPORT_USUL_MATERIAL_EMAS: transport usuli faqat material qatoriga (tur rs/mat/ob, material kat) qo''yiladi (qator %)', new.id
      using errcode = '23514';
  end if;
  if new.transport_manba_qator_id is not null then
    if new.transport_manba_qator_id = new.id then
      raise exception 'TRANSPORT_O_ZI: t·km qatori o''ziga bog''lana olmaydi' using errcode = '23514';
    end if;
    if new.transport_usul is not null then
      raise exception 'TRANSPORT_QATOR_USUL: t·km qatorining o''zida transport usuli bo''lmaydi' using errcode = '23514';
    end if;
    select * into m from public.t2_qator where id = new.transport_manba_qator_id;
    if not found or m.obyekt_id <> new.obyekt_id then
      raise exception 'TRANSPORT_MATERIAL_BOSHQA_OBYEKT: material shu obyektda topilmadi (%)', new.transport_manba_qator_id using errcode = '23514';
    end if;
    if m.transport_manba_qator_id is not null or not (m.tur in ('rs', 'mat', 'ob') and m.kat = any (v_mat_kat)) then
      raise exception 'TRANSPORT_MATERIAL_EMAS: bog''langan qator material emas (%)', m.id using errcode = '23514';
    end if;
    if m.transport_usul is distinct from 'tkm' then
      raise exception 'TRANSPORT_USUL_TKM_EMAS: material % transport_usul = tkm bo''lishi shart (ikki marta transport xavfi)', m.id using errcode = '23514';
    end if;
  end if;
  -- (c) material tkm dan chiqsa - faol t·km qatori qolmasligi kerak (aks holda transport ham, %-baza ham olinadi).
  if tg_op = 'UPDATE' and old.transport_usul = 'tkm' and new.transport_usul is distinct from 'tkm'
     and exists (select 1 from public.t2_qator c where c.transport_manba_qator_id = new.id and c.versiya_holat = 'faol') then
    raise exception 'TRANSPORT_TKM_QATOR_BOR: material % da faol t·km qatori bor - avval uni olib tashlang', new.id using errcode = '23514';
  end if;
  return new;
end $fn$;

drop trigger if exists t2_qator_transport_guard_ins_trg on public.t2_qator;
create trigger t2_qator_transport_guard_ins_trg
  before insert on public.t2_qator
  for each row when (new.transport_manba_qator_id is not null or new.transport_usul is not null)
  execute function public._t2_qator_transport_guard_v1();
drop trigger if exists t2_qator_transport_guard_upd_trg on public.t2_qator;
create trigger t2_qator_transport_guard_upd_trg
  before update of transport_usul, transport_manba_qator_id, obyekt_id, tur, kat on public.t2_qator
  for each row when (new.transport_manba_qator_id is not null or new.transport_usul is not null
                     or old.transport_manba_qator_id is not null or old.transport_usul is not null)
  execute function public._t2_qator_transport_guard_v1();

-- ===== 3. Podval bazasi: tkm / narx_ichida materiallar transport-% dan chiqariladi =====
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
  -- Transport usuli (20270120200000): tkm / narx_ichida materiallar transport-% bazasidan CHIQARILADI (kalit yo'q = 0, avvalgi xatti-harakat).
  ex_mat numeric := coalesce((p_cats->>'tr_ex_mat')::numeric, 0);
  ex_kab numeric := coalesce((p_cats->>'tr_ex_kab')::numeric, 0);
  ex_ob  numeric := coalesce((p_cats->>'tr_ex_ob')::numeric, 0);
  pryamye numeric; tr_mat numeric; skl_mat numeric; skl_mk numeric; tr_kab numeric;
  itogo1 numeric; prochie numeric; itogo2 numeric;
  tr_ob numeric; zag_ob numeric; itogo3 numeric;
  strax numeric; risk numeric; itogo4 numeric; nds numeric; vsego numeric;
begin
  -- Yadro standartPodval tartibi (mat — to'liq savat: МАТ + КАБ + М/К + БЕЗСКЛАД).
  pryamye := public._t2_r2_v1(chel + mash + mat + ob, y);                         -- Σ KATLAR
  tr_mat  := public._t2_r2_v1((mat - kab - ex_mat) * k_transport_mat * 0.01, y);           -- МАТ + М/К + БЕЗ СКЛАД
  skl_mat := public._t2_r2_v1((mat - bez - mk) * k_sklad_mat * 0.01, y);          -- МАТ + КАБ
  skl_mk  := public._t2_r2_v1(mk * k_sklad_mk * 0.01, y);                         -- М/К
  tr_kab  := public._t2_r2_v1((kab - ex_kab) * k_transport_kab * 0.01, y);                   -- КАБ
  itogo1  := public._t2_r2_v1(pryamye - ob + tr_mat + skl_mat + skl_mk + tr_kab, y);
  prochie := public._t2_r2_v1(itogo1 * k_prochie * 0.01, y);
  itogo2  := public._t2_r2_v1(itogo1 + prochie, y);
  tr_ob   := public._t2_r2_v1((ob - ex_ob) * k_transport_ob * 0.01, y);
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

CREATE OR REPLACE FUNCTION public._t2_summa_agg_v1(p_obyekt_ids bigint[], p_olchov text, p_akt_ids bigint[], p_dan date, p_gacha date, p_podval text, p_blok text)
 RETURNS TABLE(obyekt_id bigint, agg jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with recursive
  bolim0 as (
    select y.id, y.obyekt_id, y.qator_id, y.turi, y.kontragent_nom, y.svod_summa, y.qqs_stavka
      from public.t2_svod_yaxlit y where y.faol and y.obyekt_id = any(p_obyekt_ids)
       and (p_olchov not in ('smeta', 'smeta_joriy') or exists (select 1 from public.t2_qator qq where qq.id = y.qator_id and qq.versiya_holat = 'faol'
              and (p_olchov = 'smeta_joriy' or public.t2_qator_asl_v1(qq.change_type, qq.qoshimcha, qq.zamena))))
  ),
  yr as (
    select b.id as bolim_id, b.qator_id as id from bolim0 b
    union all
    select yr.bolim_id, q.id from public.t2_qator q join yr on q.ota_id = yr.id
  ),
  yb as (select distinct on (yr.id) yr.id, yr.bolim_id from yr order by yr.id, yr.bolim_id),
  ota as (select distinct q.ota_id as id from public.t2_qator q where q.obyekt_id = any(p_obyekt_ids) and q.ota_id is not null),
  miqdor as (
    -- Smeta (asl) — CONST: qo'shimcha/zamena qatorlari kirmaydi (egasi 2026-11-06).
    select q.id as qator_id, q.summa as s, q.hajm as h, (q.summa is null and coalesce(q.hajm, 0) <> 0) as nom, null::numeric as osh
      from public.t2_qator q
     where p_olchov = 'smeta' and q.obyekt_id = any(p_obyekt_ids) and q.versiya_holat = 'faol'
       and public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)
    union all
    -- Smeta + o'zgarishlar (hosila): asl − almashtirilgan − bajarilmadi + qo'shimcha + zamena.
    select l.qator_id, l.joriy_summa, l.joriy_hajm, (l.joriy_summa is null and coalesce(l.joriy_hajm, 0) <> 0), null::numeric
      from public._t2_smeta_qatlam_qator_v1(p_obyekt_ids) l
     where p_olchov = 'smeta_joriy'
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
       and case coalesce(p_podval, 'hammasi')
             when 'siz' then not exists (select 1 from public.t2_akt_podval ap where ap.akt_id = a.id and ap.blok = coalesce(aq.raw_snapshot->>'stornoOf', ''))
             when 'bor' then exists (select 1 from public.t2_akt_podval ap where ap.akt_id = a.id and ap.blok = coalesce(aq.raw_snapshot->>'stornoOf', '')
                                        and (p_blok is null or ap.blok = p_blok))
             else true end
       and (p_dan is null or a.oy >= p_dan)
       and (p_gacha is null or a.oy <= p_gacha)
  ),
  qm as (
    select m.qator_id, sum(m.s) as s, sum(m.h) as h, bool_or(m.nom) as nom_bor, sum(m.osh) as osh
      from miqdor m group by m.qator_id
  ),
  r as (
    select q.obyekt_id, q.id, q.tur, q.kat,
           -- Transport usuli: tasdiqlangan F2 (f2/aktlar) tarixi muzlagan - ularga ta'sir qilmaydi.
           case when p_olchov in ('f2', 'aktlar') then null else q.transport_usul end as tr_usul,
           coalesce(q.birlik, '') as birlik, qm.s, qm.h, qm.osh,
           (qm.nom_bor and q.tur not in ('rz', 'bl') and coalesce(q.nom, '') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ') as narxsiz,
           case when u.ustama_bor then null else b.id end as bolim_id,
           case when u.ustama_bor then null else b.turi end as turi,
           case when u.ustama_bor then null else b.kontragent_nom end as kontragent_nom
      from qm
      join public.t2_qator q on q.id = qm.qator_id and q.obyekt_id = any(p_obyekt_ids)
      left join ota on ota.id = q.id
      left join yb on yb.id = q.id
      left join bolim0 b on b.id = yb.bolim_id
      -- F2 o'lchovlarida svod bo'limi ichidagi pudratchi mehnati (ЧЕЛ/МАШ) yaxlit emas (TS: f2YaxlitdanChiqadi)
      cross join lateral (select (p_olchov in ('f2', 'f2_qoralama', 'aktlar') and b.turi = 'svod' and q.kat in ('ЧЕЛ', 'МАШ')) as ustama_bor) u
     where ota.id is null
  ),
  bs as (select r.bolim_id, sum(r.s) as s from r where r.bolim_id is not null group by r.bolim_id),
  svq as (
    select b.obyekt_id,
           sum(case when p_olchov in ('smeta', 'smeta_joriy') and b.svod_summa is not null then round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)
                    else coalesce(bs.s, 0) end) as qqssiz,
           -- Svod summasi (QQS BILAN, yakuniy) bor bo'limlar: yadro 'qqsdan_keyin' — НДС dan keyin aynan.
           sum(b.svod_summa) filter (where p_olchov in ('smeta', 'smeta_joriy') and b.svod_summa is not null) as summa_qqs_bilan,
           sum(round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)) filter (where p_olchov in ('smeta', 'smeta_joriy') and b.svod_summa is not null) as summa_qqssiz,
           count(*) filter (where p_olchov in ('smeta', 'smeta_joriy') and b.svod_summa is not null) as summa_soni
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
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.tr_usul in ('tkm', 'narx_ichida') and r.kat in ('МАТ','М/К','БЕЗСКЛАД')), 0) as tr_ex_mat,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.tr_usul in ('tkm', 'narx_ichida') and r.kat = 'КАБ'), 0) as tr_ex_kab,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.tr_usul in ('tkm', 'narx_ichida') and r.kat = 'ОБ'), 0) as tr_ex_ob,
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
      'mk', coalesce(ag.mk, 0), 'kab', coalesce(ag.kab, 0), 'bez', coalesce(ag.bez, 0),
      'tr_ex_mat', coalesce(ag.tr_ex_mat, 0), 'tr_ex_kab', coalesce(ag.tr_ex_kab, 0), 'tr_ex_ob', coalesce(ag.tr_ex_ob, 0), 'nomalum', coalesce(ag.nomalum, 0),
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
         'mk', coalesce((a->>'mk')::numeric, 0), 'kab', coalesce((a->>'kab')::numeric, 0), 'bez', coalesce((a->>'bez')::numeric, 0),
         'tr_ex_mat', coalesce((a->>'tr_ex_mat')::numeric, 0), 'tr_ex_kab', coalesce((a->>'tr_ex_kab')::numeric, 0), 'tr_ex_ob', coalesce((a->>'tr_ex_ob')::numeric, 0)), p_nk);
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

-- ===== 4. Audit (faqat o'qish) =====
create or replace function public.t2_qator_transport_audit_v1(p_actor_id bigint, p_obyekt_id bigint)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_komp bigint;
  v_xul jsonb; v_mat jsonb; v_xato jsonb;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ', 'error', 'Obyekt topilmadi');
  end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  with m as (
    select q.id, q.kod, q.nom, q.kat, coalesce(q.transport_usul, 'foiz') as usul
      from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
       and q.tur in ('rs', 'mat', 'ob') and q.kat in ('МАТ', 'М/К', 'КАБ', 'БЕЗСКЛАД', 'ОБ')
       and q.transport_manba_qator_id is null
  ),
  tr as (
    select q.id, q.transport_manba_qator_id as m_id, q.kat, q.nom, q.summa, q.transport_zichlik, q.transport_km
      from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol' and q.transport_manba_qator_id is not null
  ),
  mt as (
    select m.*, coalesce((select jsonb_agg(t.id order by t.id) from tr t where t.m_id = m.id), '[]'::jsonb) as tr_idlar,
           (select count(*) from tr t where t.m_id = m.id) as tr_soni
      from m
  ),
  f as (
    select 'TKM_TRANSPORT_YOQ'::text as kod, mt.id as qator_id, 'tkm materialning t·km transport qatori yo''q'::text as xabar
      from mt where mt.usul = 'tkm' and mt.tr_soni = 0
    union all
    select 'TRANSPORT_MATERIAL_YOQ', t.id, 't·km qatori faol material qatoriga bog''lanmagan (material topilmadi yoki material emas)'
      from tr t where not exists (select 1 from m where m.id = t.m_id)
    union all
    select 'TKM_VA_FOIZ', t.id, 'material ' || m.id || ' t·km bilan tashilgan, lekin usuli ' || m.usul || ' - ikki marta transport xavfi'
      from tr t join m on m.id = t.m_id where m.usul <> 'tkm'
    union all
    select 'IKKITA_TRANSPORT', mt.id, 'bitta materialga ' || mt.tr_soni || ' ta faol t·km qatori'
      from mt where mt.tr_soni > 1
    union all
    select 'TRANSPORT_KAT', t.id, 't·km qatori kategoriyasi МАШ emas'
      from tr t where t.kat is distinct from 'МАШ'
  )
  select
    jsonb_build_object('material_soni', (select count(*) from m),
                       'foiz', (select count(*) from m where usul = 'foiz'),
                       'tkm', (select count(*) from m where usul = 'tkm'),
                       'narx_ichida', (select count(*) from m where usul = 'narx_ichida'),
                       'tkm_qator_soni', (select count(*) from tr),
                       'xato_soni', (select count(*) from f)),
    coalesce((select jsonb_agg(jsonb_build_object('qator_id', mt.id, 'kod', mt.kod, 'nom', mt.nom, 'kat', mt.kat, 'usul', mt.usul,
                'foiz_bazada', mt.usul = 'foiz', 'tkm_qatorlar', mt.tr_idlar) order by mt.id)
                from mt where mt.usul <> 'foiz' or mt.tr_soni > 0), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('kod', f.kod, 'qator_id', f.qator_id, 'xabar', f.xabar) order by f.kod, f.qator_id) from f), '[]'::jsonb)
    into v_xul, v_mat, v_xato;

  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'xulosa', v_xul, 'materiallar', v_mat, 'xatolar', v_xato);
end $fn$;
revoke all on function public.t2_qator_transport_audit_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_qator_transport_audit_v1(bigint, bigint) to service_role;