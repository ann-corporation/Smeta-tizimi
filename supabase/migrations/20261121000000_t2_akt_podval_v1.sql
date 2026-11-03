-- T2_AKT_PODVAL v1 (egasi qarori 2026-11-03): F2 hujjatining O'Z podval ustamasi bazada saqlanadi va hamma joyda shu bilan baholanadi.
--
-- Muammo: bitta F2 uch xil jami ko'rsatardi (import sahifasi — hujjatning o'z podvali; tizim ko'rinishlari — obyekt smeta podvali
-- kaskadi; Excel qoralama — bitta Kf). F2 hujjat podvali hech qayerda saqlanmasdi.
--
-- Yechim (yagona model, SQL va TS `lib/hisob-yadro` bir xil):
--   1. t2_akt_podval — har (akt, blok) uchun hujjatning o'z podvali: nk (standart kaskad foizlari — hujjatdan o'qilgan),
--      qatorlar (hujjat podval satrlari ko'rsatish uchun), itogo1..4, nds_foiz, hujjat jamilari, manba (import|storno|smeta|backfill).
--      blok '' — aktning o'z qatorlari; blok '<akt id>' — pereraschet/storno bloki (qator raw_snapshot.stornoOf = shu akt).
--   2. t2_akt_podval_yoz_v1 — yozish (import / storno nusxasi / smeta / backfill); tasdiqlangan F2 qatorlari O'ZGARMAYDI —
--      bu hosila qatlam. t2_akt_podval_ol_v1 — o'qish; t2_akt_podval_nomzod_v1 — backfill nomzodlari (reestr jami bilan).
--   3. _t2_summa_agg_v1 (7 arg): p_podval = 'siz' | 'bor' | 'hammasi' — podvalli (akt, blok) qatorlarni ajratadi.
--      _t2_summa_paket_v1: f2 / f2_qoralama / aktlar o'lchovida podvalsiz qatorlar — obyekt smeta podvali (eskicha),
--      podvalli (akt, blok) lar — o'z podvali bilan alohida kaskad, so'ng paketlar yig'indisi.
-- Migratsiyani EGASI qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql.
begin;

create table if not exists public.t2_akt_podval (
  akt_id bigint not null references public.t2_akt(id) on delete cascade,
  blok text not null default '',
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  obyekt_id bigint references public.t2_obyekt(id) on delete cascade,
  manba text not null check (manba in ('import', 'storno', 'smeta', 'backfill')),
  manba_akt_id bigint references public.t2_akt(id) on delete set null,
  ishora smallint not null default 1 check (ishora in (1, -1)),
  nk jsonb not null check (jsonb_typeof(nk) = 'object'),
  qatorlar jsonb not null default '[]'::jsonb check (jsonb_typeof(qatorlar) = 'array'),
  itogo1 numeric(20,2), itogo2 numeric(20,2), itogo3 numeric(20,2), itogo4 numeric(20,2),
  nds_foiz numeric(7,3),
  hujjat_pryamye numeric(20,2), hujjat_itogo4 numeric(20,2), hujjat_nds numeric(20,2), hujjat_vsego numeric(20,2),
  masshtab smallint not null default 1 check (masshtab in (1, 1000)),
  tekshiruv jsonb not null default '{}'::jsonb,
  versiya integer not null default 1,
  actor_id bigint,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  primary key (akt_id, blok)
);
create index if not exists t2_akt_podval_obyekt_idx on public.t2_akt_podval (obyekt_id);
alter table public.t2_akt_podval enable row level security;
revoke all on public.t2_akt_podval from anon, authenticated;
comment on table public.t2_akt_podval is
  'F2 hujjatining O''Z podval ustamasi (egasi 2026-11-03). F2 qatorlari o''zgarmaydi; bu hosila qatlam. blok = raw_snapshot.stornoOf (bo''sh — aktning o''z qatorlari). nk — standart kaskad foizlari (hujjatdan).';

-- Yozish. Tasdiqlangan F2 uchun faqat manba=backfill (qatorlarga tegilmaydi); import/storno/smeta — faqat qoralama.
create or replace function public.t2_akt_podval_yoz_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_akt_id bigint, p_blok text, p_manba text,
  p_podval jsonb, p_manba_akt_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_akt public.t2_akt%rowtype; v_blok text := coalesce(nullif(btrim(p_blok), ''), '');
  v_def jsonb := public.t2_nakrutka_default_v1(); v_nk jsonb := '{}'::jsonb; v_k text; v_v numeric;
  v_yoq text[] := '{}'::text[]; v_src public.t2_akt_podval%rowtype; v_old public.t2_akt_podval%rowtype;
  v_qat jsonb; v_h jsonb; v_ish smallint := 1; v_tek jsonb;
  v_i1 numeric; v_i2 numeric; v_i3 numeric; v_i4 numeric; v_nds numeric; v_ms smallint;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.prepare');
  if p_manba is null or p_manba not in ('import', 'storno', 'smeta', 'backfill') then
    return jsonb_build_object('ok', false, 'code', 'MANBA_NOTOGRI');
  end if;
  select * into v_akt from public.t2_akt where id = p_akt_id;
  if not found or v_akt.kompaniya_id is distinct from p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;
  if v_akt.tur <> 'f2' then return jsonb_build_object('ok', false, 'code', 'AKT_TUR_NOTOGRI'); end if;
  if p_manba = 'backfill' then
    if v_akt.holat = 'bekor' then return jsonb_build_object('ok', false, 'code', 'AKT_BEKOR'); end if;
  elsif v_akt.holat is distinct from 'qoralama' then
    return jsonb_build_object('ok', false, 'code', 'AKT_QORALAMA_EMAS', 'xabar', 'Tasdiqlangan F2 podvali faqat backfill orqali yoziladi.');
  end if;
  select * into v_old from public.t2_akt_podval where akt_id = p_akt_id and blok = v_blok;
  if found and v_old.manba = 'import' and p_manba in ('backfill', 'smeta') then
    return jsonb_build_object('ok', false, 'code', 'IMPORT_PODVALI_BOR', 'xabar', 'Import podvali backfill/smeta bilan almashtirilmaydi.');
  end if;

  if p_manba = 'storno' then
    if p_manba_akt_id is null then return jsonb_build_object('ok', false, 'code', 'MANBA_AKT_YOQ'); end if;
    if v_blok = '' then v_blok := p_manba_akt_id::text; end if;
    select * into v_src from public.t2_akt_podval s
     where s.akt_id = p_manba_akt_id and s.kompaniya_id = p_kompaniya_id and s.blok = '';
    if not found then
      -- Manba aktda hujjat podvali saqlanmagan: storno ham smeta podvaliga qaytadi (jim yozuv yo'q).
      return jsonb_build_object('ok', true, 'akt_id', p_akt_id, 'blok', v_blok, 'podval_yoq', true);
    end if;
    v_ish := (-v_src.ishora)::smallint;
    -- Ishora-aware nusxa: summalar teskari, foizlar o'sha.
    select coalesce(jsonb_agg(case when jsonb_typeof(e->'summa') = 'number'
                                   then jsonb_set(e, '{summa}', to_jsonb(-(e->>'summa')::numeric)) else e end), '[]'::jsonb)
      into v_qat from jsonb_array_elements(v_src.qatorlar) e;
    insert into public.t2_akt_podval as t (akt_id, blok, kompaniya_id, obyekt_id, manba, manba_akt_id, ishora, nk, qatorlar,
        itogo1, itogo2, itogo3, itogo4, nds_foiz, hujjat_pryamye, hujjat_itogo4, hujjat_nds, hujjat_vsego, masshtab, tekshiruv, actor_id)
    values (p_akt_id, v_blok, p_kompaniya_id, v_akt.obyekt_id, 'storno', p_manba_akt_id, v_ish, v_src.nk, v_qat,
        -v_src.itogo1, -v_src.itogo2, -v_src.itogo3, -v_src.itogo4, v_src.nds_foiz,
        -v_src.hujjat_pryamye, -v_src.hujjat_itogo4, -v_src.hujjat_nds, -v_src.hujjat_vsego, v_src.masshtab,
        v_src.tekshiruv || jsonb_build_object('storno_manba', p_manba_akt_id), p_actor_id)
    on conflict (akt_id, blok) do update set manba = 'storno', manba_akt_id = excluded.manba_akt_id, ishora = excluded.ishora,
        nk = excluded.nk, qatorlar = excluded.qatorlar, itogo1 = excluded.itogo1, itogo2 = excluded.itogo2, itogo3 = excluded.itogo3,
        itogo4 = excluded.itogo4, nds_foiz = excluded.nds_foiz, hujjat_pryamye = excluded.hujjat_pryamye, hujjat_itogo4 = excluded.hujjat_itogo4,
        hujjat_nds = excluded.hujjat_nds, hujjat_vsego = excluded.hujjat_vsego, masshtab = excluded.masshtab, tekshiruv = excluded.tekshiruv,
        actor_id = p_actor_id, versiya = t.versiya + 1, yangilandi = now();
    perform public.t2_audit_yoz(p_kompaniya_id, 'akt_podval_yoz', 'f2', v_akt.obyekt_id,
      jsonb_build_object('akt_id', p_akt_id, 'blok', v_blok, 'manba', 'storno', 'manba_akt_id', p_manba_akt_id)::text, p_actor_id::text, null);
    return jsonb_build_object('ok', true, 'akt_id', p_akt_id, 'blok', v_blok, 'manba', 'storno');
  end if;

  if p_podval is null or jsonb_typeof(p_podval) <> 'object' or jsonb_typeof(p_podval->'nk') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'PODVAL_NOTOGRI');
  end if;
  -- Standart 11 kalit: hujjatda yo'q foiz = hujjat ustamasi YO'Q (0, hujjatning o'z podvali); faqat НДС yo'q bo'lsa tizim stavkasi.
  for v_k in select jsonb_object_keys(v_def) loop
    if jsonb_typeof(p_podval->'nk'->v_k) = 'number' then
      v_v := (p_podval->'nk'->>v_k)::numeric;
      if v_v < 0 or v_v > 200 then return jsonb_build_object('ok', false, 'code', 'NK_ORALIQ', 'kalit', v_k); end if;
      v_nk := v_nk || jsonb_build_object(v_k, v_v);
    elsif v_k = 'НДС' then
      v_nk := v_nk || jsonb_build_object(v_k, v_def->v_k); v_yoq := v_yoq || (v_k || ':sukut');
    else
      v_nk := v_nk || jsonb_build_object(v_k, 0); v_yoq := v_yoq || v_k;
    end if;
  end loop;
  v_qat := case when jsonb_typeof(p_podval->'qatorlar') = 'array' then p_podval->'qatorlar' else '[]'::jsonb end;
  if jsonb_array_length(v_qat) > 200 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_KOP'); end if;
  v_h := case when jsonb_typeof(p_podval->'hujjat') = 'object' then p_podval->'hujjat' else '{}'::jsonb end;
  v_i1 := case when jsonb_typeof(p_podval->'itogo1') = 'number' then (p_podval->>'itogo1')::numeric end;
  v_i2 := case when jsonb_typeof(p_podval->'itogo2') = 'number' then (p_podval->>'itogo2')::numeric end;
  v_i3 := case when jsonb_typeof(p_podval->'itogo3') = 'number' then (p_podval->>'itogo3')::numeric end;
  v_i4 := case when jsonb_typeof(p_podval->'itogo4') = 'number' then (p_podval->>'itogo4')::numeric end;
  v_nds := (v_nk->>'НДС')::numeric;
  v_ms := case when (p_podval->>'masshtab') = '1000' then 1000 else 1 end;
  v_tek := case when jsonb_typeof(p_podval->'tekshiruv') = 'object' then p_podval->'tekshiruv' else '{}'::jsonb end;
  v_tek := v_tek || jsonb_build_object('yoq_kodlar', to_jsonb(v_yoq));

  insert into public.t2_akt_podval as t (akt_id, blok, kompaniya_id, obyekt_id, manba, ishora, nk, qatorlar,
      itogo1, itogo2, itogo3, itogo4, nds_foiz, hujjat_pryamye, hujjat_itogo4, hujjat_nds, hujjat_vsego, masshtab, tekshiruv, actor_id)
  values (p_akt_id, v_blok, p_kompaniya_id, v_akt.obyekt_id, p_manba, 1, v_nk, v_qat,
      v_i1, v_i2, v_i3, v_i4, v_nds,
      case when jsonb_typeof(v_h->'pryamye') = 'number' then (v_h->>'pryamye')::numeric end,
      case when jsonb_typeof(v_h->'itogo4') = 'number' then (v_h->>'itogo4')::numeric end,
      case when jsonb_typeof(v_h->'nds') = 'number' then (v_h->>'nds')::numeric end,
      case when jsonb_typeof(v_h->'vsego') = 'number' then (v_h->>'vsego')::numeric end,
      v_ms, v_tek, p_actor_id)
  on conflict (akt_id, blok) do update set manba = excluded.manba, manba_akt_id = null, ishora = 1, nk = excluded.nk, qatorlar = excluded.qatorlar,
      itogo1 = excluded.itogo1, itogo2 = excluded.itogo2, itogo3 = excluded.itogo3, itogo4 = excluded.itogo4, nds_foiz = excluded.nds_foiz,
      hujjat_pryamye = excluded.hujjat_pryamye, hujjat_itogo4 = excluded.hujjat_itogo4, hujjat_nds = excluded.hujjat_nds,
      hujjat_vsego = excluded.hujjat_vsego, masshtab = excluded.masshtab, tekshiruv = excluded.tekshiruv,
      actor_id = p_actor_id, versiya = t.versiya + 1, yangilandi = now();
  perform public.t2_audit_yoz(p_kompaniya_id, 'akt_podval_yoz', 'f2', v_akt.obyekt_id,
    jsonb_build_object('akt_id', p_akt_id, 'blok', v_blok, 'manba', p_manba, 'yoq_kodlar', to_jsonb(v_yoq))::text, p_actor_id::text, null);
  return jsonb_build_object('ok', true, 'akt_id', p_akt_id, 'blok', v_blok, 'manba', p_manba, 'yoq_kodlar', to_jsonb(v_yoq));
end $$;
revoke all on function public.t2_akt_podval_yoz_v1(bigint, bigint, bigint, text, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.t2_akt_podval_yoz_v1(bigint, bigint, bigint, text, text, jsonb, bigint) to service_role;

-- O'qish: obyektning barcha (akt, blok) podvallari.
create or replace function public.t2_akt_podval_ol_v1(p_obyekt_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_komp bigint;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  perform public.t2_require_permission_v2(v_komp, p_actor_id, 'f2.read');
  return jsonb_build_object('ok', true, 'podvallar', coalesce((
    select jsonb_agg(jsonb_build_object('akt_id', p.akt_id, 'blok', p.blok, 'manba', p.manba, 'manba_akt_id', p.manba_akt_id,
             'ishora', p.ishora, 'nk', p.nk, 'qatorlar', p.qatorlar, 'itogo1', p.itogo1, 'itogo2', p.itogo2, 'itogo3', p.itogo3,
             'itogo4', p.itogo4, 'nds_foiz', p.nds_foiz, 'hujjat_pryamye', p.hujjat_pryamye, 'hujjat_itogo4', p.hujjat_itogo4,
             'hujjat_nds', p.hujjat_nds, 'hujjat_vsego', p.hujjat_vsego, 'masshtab', p.masshtab, 'tekshiruv', p.tekshiruv,
             'versiya', p.versiya) order by p.akt_id, p.blok)
      from public.t2_akt_podval p where p.obyekt_id = p_obyekt_id and p.kompaniya_id = v_komp), '[]'::jsonb));
end $$;
revoke all on function public.t2_akt_podval_ol_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_akt_podval_ol_v1(bigint, bigint) to service_role;

-- Backfill nomzodlari: obyektning F2 aktlari — qator soni, ПРЯМЫЕ jami (hujjat qiymatlari), podval holati, reestr jamilari.
create or replace function public.t2_akt_podval_nomzod_v1(p_obyekt_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_komp bigint;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  perform public.t2_require_permission_v2(v_komp, p_actor_id, 'f2.read');
  return jsonb_build_object('ok', true, 'aktlar', coalesce((
    select jsonb_agg(jsonb_build_object(
      'akt_id', a.id, 'raqam', a.raqam, 'oy', a.oy, 'holat', a.holat, 'qator_soni', s.soni, 'pryamye', s.pryamye,
      'podval_manba', (select p.manba from public.t2_akt_podval p where p.akt_id = a.id and p.blok = ''),
      'reestr_qqssiz', r.qqssiz, 'reestr_qqs', r.qqs, 'reestr_qqs_bilan', r.qqs_bilan) order by a.oy, a.id)
      from public.t2_akt a
      cross join lateral (select count(*) as soni, round(sum(coalesce(aq.certified_amount, aq.summa)), 2) as pryamye
                            from public.t2_akt_qator aq where aq.akt_id = a.id) s
      left join lateral (select j.qqssiz, j.qqs, j.qqs_bilan from public.t2_f2_reestr_jami j
                          where j.akt_id = a.id and j.holat = 'faol' limit 1) r on true
     where a.obyekt_id = p_obyekt_id and a.kompaniya_id = v_komp and a.tur = 'f2' and a.holat in ('tasdiqlangan', 'qoralama')), '[]'::jsonb));
end $$;
revoke all on function public.t2_akt_podval_nomzod_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_akt_podval_nomzod_v1(bigint, bigint) to service_role;

-- 7 argli _t2_summa_agg_v1: 20261120000000 dagi tana + p_podval/p_blok filtri (faqat f2 / f2_qoralama / aktlar qator tarmog'ida).
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
    select q.obyekt_id, q.id, q.tur, q.kat, coalesce(q.birlik, '') as birlik, qm.s, qm.h, qm.osh,
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

revoke all on function public._t2_summa_agg_v1(bigint[], text, bigint[], date, date, text, text) from public, anon, authenticated;
grant execute on function public._t2_summa_agg_v1(bigint[], text, bigint[], date, date, text, text) to service_role;

-- 5 argli eski imzo — 7 argli funksiyaga o'tkazgich (podval ajratilmaydi: 'hammasi').
CREATE OR REPLACE FUNCTION public._t2_summa_agg_v1(p_obyekt_ids bigint[], p_olchov text, p_akt_ids bigint[] DEFAULT NULL::bigint[], p_dan date DEFAULT NULL::date, p_gacha date DEFAULT NULL::date)
 RETURNS TABLE(obyekt_id bigint, agg jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select x.obyekt_id, x.agg from public._t2_summa_agg_v1(p_obyekt_ids, p_olchov, p_akt_ids, p_dan, p_gacha, 'hammasi', null) x;
$function$;
revoke all on function public._t2_summa_agg_v1(bigint[], text, bigint[], date, date) from public, anon, authenticated;
grant execute on function public._t2_summa_agg_v1(bigint[], text, bigint[], date, date) to service_role;

-- Obyektlar bo'yicha paketlar: podvalsiz qatorlar — obyekt smeta podvali (eskicha); podvalli (akt, blok) lar — o'z hujjat podvali.
-- Natija yig'indisi (_t2_summa_paket_jam_v1); podvalli akt yo'q bo'lsa natija AYNAN avvalgidek.
create or replace function public._t2_summa_paket_v1(
  p_obyekt_ids bigint[], p_olchov text, p_akt_ids bigint[] default null, p_dan date default null, p_gacha date default null)
returns table(obyekt_id bigint, paket jsonb)
language sql stable set search_path = public, pg_temp as $$
  with siz as (
    select a.obyekt_id,
           public._t2_summa_paket_hisob_v1(a.agg, n.x->'nk')
             || jsonb_build_object('nk_manba', n.x->>'nk_manba', 'podval_id', n.x->'podval_id', 'olchov', p_olchov) as paket
      from public._t2_summa_agg_v1(p_obyekt_ids, p_olchov, p_akt_ids, p_dan, p_gacha, 'siz', null) a
      cross join lateral (select public._t2_obyekt_nk_v1(a.obyekt_id) as x) n
     where n.x is not null
  ),
  bor as (
    select ap.obyekt_id, ap.akt_id, ap.blok, public._t2_summa_paket_hisob_v1(g.agg, ap.nk) as paket
      from (select p.akt_id, p.blok, p.nk, a.obyekt_id
              from public.t2_akt_podval p
              join public.t2_akt a on a.id = p.akt_id
             where p_olchov in ('f2', 'f2_qoralama', 'aktlar')
               and a.obyekt_id = any(p_obyekt_ids)
               and (p_olchov = 'aktlar' or a.tur = 'f2')
               and case p_olchov
                     when 'f2' then a.holat = 'tasdiqlangan'
                     when 'f2_qoralama' then a.holat = 'qoralama'
                     else a.id = any(coalesce(p_akt_ids, '{}'::bigint[])) end
               and (p_dan is null or a.oy >= p_dan)
               and (p_gacha is null or a.oy <= p_gacha)) ap
      cross join lateral (select x.agg from public._t2_summa_agg_v1(array[ap.obyekt_id], 'aktlar', array[ap.akt_id], null, null, 'bor', ap.blok) x) g
  )
  select s.obyekt_id,
         case when exists (select 1 from bor b where b.obyekt_id = s.obyekt_id)
              then (public._t2_summa_paket_jam_v1((select jsonb_agg(z.p) from (
                        select s.paket as p
                        union all
                        select b.paket from bor b where b.obyekt_id = s.obyekt_id) z)) - 'obyekt_soni')
                   || jsonb_build_object('nk_manba', s.paket->>'nk_manba', 'podval_id', s.paket->'podval_id', 'olchov', p_olchov,
                        'akt_podvalli', (select count(*) from bor b where b.obyekt_id = s.obyekt_id))
              else s.paket end
    from siz s;
$$;
revoke all on function public._t2_summa_paket_v1(bigint[], text, bigint[], date, date) from public, anon, authenticated;
grant execute on function public._t2_summa_paket_v1(bigint[], text, bigint[], date, date) to service_role;

commit;
