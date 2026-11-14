-- USTAMA_BIR_XIL_V1 (2026-11-14 audit): Nakopitelniy narx-variance «yaxlit summa» qatorlarida buzilmasin.
--
-- Sabab: akt qatorlari 21899 va 36258 (Stella, F-2 №25 va №24, bronza svod): hajm = summa, narx = 1 (yaxlit summa),
-- baseline_narx = 16,3 mlrd (smeta qatori summasi). baseline_summa = hajm * baseline_narx ≈ 2,17e20 va
-- narx_variance_summa = -2,17e20 — Nakopitelniy ekranini buzadi. Yaxlit summada «birlik narx» yo'q, shuning uchun
-- baseline/variance hisoblanmaydi (NULL ≠ 0): bunday qatorlar jami baseline va variance dan chiqariladi.
--
-- Qamrov: faqat O'QISH tomoni — t2_nakopitelniy_v2 (jami va qator darajasi). Akt qatorlari (tasdiqlangan, qulflangan) O'ZGARTIRILMAYDI.
-- Hisob-yadro (summa/ustama) funksiyalari — _t2_summa_paket_v1 / _t2_summa_agg_v1 / _t2_kesh_hisobla_v1 — O'ZGARMAYDI:
-- ular kesh va jonli jamining YAGONA manbasi (mcp obyekt_holat va AI endi ularga moslandi; frontend/MCP o'zgarishi shu PR da).
--
-- Funksiya matni pg_get_functiondef + regexp bilan yamaladi (har almashtirish soni tekshiriladi — drift bo'lsa migratsiya
-- XATO bilan to'xtaydi, hech narsa yozilmaydi). Asl matn _t2_fn_zaxira da — rollback shu yerdan tiklaydi.

create table if not exists public._t2_fn_zaxira (
  nom text primary key,
  tarif text not null,
  yozildi timestamptz not null default now()
);
alter table public._t2_fn_zaxira enable row level security;
revoke all on public._t2_fn_zaxira from public, anon, authenticated;

-- Yaxlit summa qatori: narx = 1 va hajm = summa (birlik narxi yo'q — summa o'zi hajm sifatida yozilgan).
create or replace function public._t2_akt_qator_yaxlit_summami_v1(p_narx numeric, p_hajm numeric, p_summa numeric)
returns boolean language sql immutable parallel safe
as $$ select coalesce(p_narx = 1 and p_hajm is not null and p_summa is not null and p_hajm <> 0 and abs(p_hajm - p_summa) <= 0.01, false) $$;
comment on function public._t2_akt_qator_yaxlit_summami_v1(numeric, numeric, numeric) is
  'USTAMA_BIR_XIL_V1: yaxlit summa qatori (narx=1, hajm=summa). Bunday qatorda baseline/variance hisoblanmaydi.';
revoke all on function public._t2_akt_qator_yaxlit_summami_v1(numeric, numeric, numeric) from public;
grant execute on function public._t2_akt_qator_yaxlit_summami_v1(numeric, numeric, numeric) to service_role;

do $mig$
declare
  v_oid oid;
  v_eski text; v_yangi text;
  v_lump text := $s$ and not public._t2_akt_qator_yaxlit_summami_v1(aq.narx, aq.hajm, aq.summa)$s$;
  n int;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 't2_nakopitelniy_v2';
  if v_oid is null then raise exception 'USTAMA_BIR_XIL: t2_nakopitelniy_v2 topilmadi'; end if;
  v_eski := pg_get_functiondef(v_oid);
  insert into public._t2_fn_zaxira (nom, tarif) values ('t2_nakopitelniy_v2:20261219100000', v_eski)
    on conflict (nom) do nothing;
  if v_eski like '%_t2_akt_qator_yaxlit_summami_v1%' then
    raise notice 'USTAMA_BIR_XIL: allaqachon yamalgan — o''tkazildi';
    return;
  end if;
  v_yangi := v_eski;

  -- 1) baseline yig'indisi (oldingi / joriy; ikkala joyda — qatorlar lateral va jami CTE) yaxlit summa qatorlarisiz
  select count(*) into n from regexp_matches(v_yangi, $re$sum\(aq\.baseline_summa\) filter \(where a\.tur='f2' and a\.holat='tasdiqlangan' and a\.oy < v_davr\) as oldingi_baseline,$re$, 'g');
  if n <> 2 then raise exception 'USTAMA_BIR_XIL: oldingi_baseline %-marta topildi (kutilgan 2)', n; end if;
  v_yangi := regexp_replace(v_yangi,
    $re$sum\(aq\.baseline_summa\) filter \(where a\.tur='f2' and a\.holat='tasdiqlangan' and a\.oy < v_davr\) as oldingi_baseline,$re$,
    'sum(aq.baseline_summa) filter (where a.tur=''f2'' and a.holat=''tasdiqlangan'' and a.oy < v_davr' || v_lump || ') as oldingi_baseline, '
    || 'sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur=''f2'' and a.holat=''tasdiqlangan'' and a.oy < v_davr' || v_lump || ') as oldingi_vr,', 'g');

  select count(*) into n from regexp_matches(v_yangi, $re$sum\(aq\.baseline_summa\) filter \(where a\.tur='f2' and a\.holat='tasdiqlangan' and a\.oy = v_davr\) as joriy_baseline,$re$, 'g');
  if n <> 2 then raise exception 'USTAMA_BIR_XIL: joriy_baseline %-marta topildi (kutilgan 2)', n; end if;
  v_yangi := regexp_replace(v_yangi,
    $re$sum\(aq\.baseline_summa\) filter \(where a\.tur='f2' and a\.holat='tasdiqlangan' and a\.oy = v_davr\) as joriy_baseline,$re$,
    'sum(aq.baseline_summa) filter (where a.tur=''f2'' and a.holat=''tasdiqlangan'' and a.oy = v_davr' || v_lump || ') as joriy_baseline, '
    || 'sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.tur=''f2'' and a.holat=''tasdiqlangan'' and a.oy = v_davr' || v_lump || ') as joriy_vr,', 'g');

  -- 2) qator darajasidagi variance: taqqoslanadigan (yaxlit bo'lmagan) qatorlar summasi − baseline; hammasi yaxlit bo'lsa NULL
  select count(*) into n from regexp_matches(v_yangi,
    $re$'narx_variance_summa',\s*\(coalesce\(p\.oldingi_summa,0\) \+ coalesce\(p\.joriy_summa,0\)\)\s*- \(coalesce\(p\.oldingi_baseline,0\) \+ coalesce\(p\.joriy_baseline,0\)\),$re$, 'g');
  if n <> 1 then raise exception 'USTAMA_BIR_XIL: qator variance %-marta topildi (kutilgan 1)', n; end if;
  v_yangi := regexp_replace(v_yangi,
    $re$'narx_variance_summa',\s*\(coalesce\(p\.oldingi_summa,0\) \+ coalesce\(p\.joriy_summa,0\)\)\s*- \(coalesce\(p\.oldingi_baseline,0\) \+ coalesce\(p\.joriy_baseline,0\)\),$re$,
    $rp$'narx_variance_summa', case when p.oldingi_baseline is null and p.joriy_baseline is null then null else (coalesce(p.oldingi_vr,0) + coalesce(p.joriy_vr,0)) - (coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0)) end,$rp$, 'g');

  -- 3) jami variance: taqqoslanadigan qatorlar summasi (vr_summa) − baseline
  select count(*) into n from regexp_matches(v_yangi, $re$(coalesce\(sum\(x\.oldingi_baseline\),0\) \+ coalesce\(sum\(x\.joriy_baseline\),0\) as baseline_summa)$re$, 'gn');
  if n <> 1 then raise exception 'USTAMA_BIR_XIL: jami baseline_summa %-marta topildi (kutilgan 1)', n; end if;
  v_yangi := regexp_replace(v_yangi,
    $re$(coalesce\(sum\(x\.oldingi_baseline\),0\) \+ coalesce\(sum\(x\.joriy_baseline\),0\) as baseline_summa)$re$,
    '\1, coalesce(sum(x.oldingi_vr),0) + coalesce(sum(x.joriy_vr),0) as vr_summa', 'n');

  select count(*) into n from regexp_matches(v_yangi, $re$'narx_variance_summa', jami_summa - baseline_summa,$re$, 'g');
  if n <> 1 then raise exception 'USTAMA_BIR_XIL: jami variance %-marta topildi (kutilgan 1)', n; end if;
  v_yangi := regexp_replace(v_yangi, $re$'narx_variance_summa', jami_summa - baseline_summa,$re$,
    $rp$'narx_variance_summa', vr_summa - baseline_summa,$rp$, 'g');

  if v_yangi = v_eski then raise exception 'USTAMA_BIR_XIL: matn o''zgarmadi'; end if;
  execute v_yangi;
  raise notice 'USTAMA_BIR_XIL: t2_nakopitelniy_v2 yamaldi';
end
$mig$;
