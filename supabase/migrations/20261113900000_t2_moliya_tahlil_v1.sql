-- 20261113900000 — «Парк объектининг молиявий таҳлили» (egasi 2026-10-27): 16 ko'rsatkich, kompaniya va obyekt kesimida.
-- DUBLIKAT YO'Q: fakt/F2/smeta — mavjud t2_qator_holat + t2_obyekt_nakrutka_v1 + t2_nakrutka_hisobla_v1 kaskadi (yangi formula yo'q);
-- F2 reestri — t2_f2_reestr_jami (qqs_bilan); tushgan pul — t2_tolov (1C sverka importi ham shu yerga yozadi); sarf — t2_xarajat.
-- Tizimda yo'q qiymatlar (kutilayotgan F2, qarz, yakunlash uchun talab, va tizim qiymatini egasi aniqlashtirgan holatlar) —
-- yangi kichik jadval t2_moliya_qolda (append-only tarix: yangi yozuv eskisini 'almashtirildi' qiladi; o'chirilmaydi).
-- NULL ≠ 0: noma'lum qiymat unga bog'liq hisoblangan ko'rsatkichlarni ham noma'lum qiladi (uydirma yo'q).
-- Summalar QQS BILAN (egasi jadvali shunday): kaskadning 'vsego' qiymati; ustamasiz va ustamali (ИТОГО-4, QQS siz) izohda qaytadi.
-- Xavfsizlik: jadval RLS yoqilgan + siyosatsiz (faqat security definer RPC orqali); RPC lar a'zolik + financial.read / financial.write.
begin;

create table if not exists public.t2_moliya_qolda (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint references public.t2_obyekt(id),
  kod text not null,
  qiymat numeric(20,2),
  sana date not null,
  izoh text,
  kim text,
  actor_id bigint,
  operation_id uuid not null unique,
  holat text not null default 'faol',
  yaratildi timestamptz not null default now(),
  constraint t2_moliya_qolda_kod_chk check (kod in ('fakt','f2','f2_kutilgan','tushgan','sarf','qarz','yakunlash_talab','qmi')),
  constraint t2_moliya_qolda_holat_chk check (holat in ('faol','almashtirildi','bekor')),
  constraint t2_moliya_qolda_qiymat_chk check (holat = 'bekor' or qiymat is not null)
);
create unique index if not exists ux_t2_moliya_qolda_faol on public.t2_moliya_qolda (kompaniya_id, coalesce(obyekt_id, 0), kod) where holat = 'faol';
create index if not exists ix_t2_moliya_qolda_komp on public.t2_moliya_qolda (kompaniya_id, kod, yaratildi desc);
alter table public.t2_moliya_qolda enable row level security;
revoke all on table public.t2_moliya_qolda from public, anon, authenticated;

-- Qo'lda kiritish / almashtirish / bekor (p_qiymat null → bekor). Idempotent operation_id.
create or replace function public.t2_moliya_qolda_yoz_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_kod text,
  p_qiymat numeric, p_sana date, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_id bigint; v_kim text; v_bor record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select id, kompaniya_id into v_bor from public.t2_moliya_qolda where operation_id = p_operation_id;
  if found then
    if v_bor.kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT'); end if;
    return jsonb_build_object('ok', true, 'takror', true, 'id', v_bor.id);
  end if;
  if p_kod is null or p_kod not in ('fakt','f2','f2_kutilgan','tushgan','sarf','qarz','yakunlash_talab','qmi') then
    return jsonb_build_object('ok', false, 'code', 'KOD_INVALID'); end if;
  if p_qiymat is not null and abs(p_qiymat) > 1e15 then return jsonb_build_object('ok', false, 'code', 'QIYMAT_INVALID'); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH'); end if;
  select coalesce(nullif(trim(f.ism), ''), f.id::text) into v_kim from public.t2_foydalanuvchi f where f.id = p_actor_id;

  update public.t2_moliya_qolda set holat = 'almashtirildi'
   where kompaniya_id = p_kompaniya_id and coalesce(obyekt_id, 0) = coalesce(p_obyekt_id, 0) and kod = p_kod and holat = 'faol';
  insert into public.t2_moliya_qolda (kompaniya_id, obyekt_id, kod, qiymat, sana, izoh, kim, actor_id, operation_id, holat)
  values (p_kompaniya_id, p_obyekt_id, p_kod, round(p_qiymat, 2), coalesce(p_sana, current_date),
          nullif(left(trim(coalesce(p_izoh, '')), 1000), ''), v_kim, p_actor_id, p_operation_id,
          case when p_qiymat is null then 'bekor' else 'faol' end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'takror', false, 'id', v_id, 'bekor', p_qiymat is null);
end $fn$;

-- O'qish: 16 ko'rsatkich. p_obyekt_id null → kompaniya kesimi (+ obyektlar bo'yicha fakt/F2/QMI yoyilmasi).
create or replace function public.t2_moliya_tahlil_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_obyektlar bigint[]; v_n bigint; z jsonb; c jsonb;
  v_fakt numeric := 0; v_fakt_i4 numeric := 0; v_fakt_u numeric := 0;
  v_f2a numeric := 0; v_f2a_i4 numeric := 0; v_f2a_u numeric := 0;
  v_qmi numeric := 0; v_qmi_i4 numeric := 0; v_qmi_u numeric := 0;
  v_zanjir_xato int := 0; v_fakt_nom bigint := 0; v_f2_nom bigint := 0;
  v_reestr numeric; v_reestr_soni int := 0; v_tushgan numeric; v_tolov_soni int := 0; v_sarf numeric; v_xarajat_soni int := 0;
  v_yoyilma jsonb := '[]'::jsonb; r record; nf jsonb; nk jsonb; ns jsonb;
  q jsonb := '{}'::jsonb;
  f_fakt numeric; f_f2 numeric; f_kut numeric; f_qil numeric; f_tush numeric; f_6 numeric; f_7 numeric; f_sarf numeric; f_qarz numeric;
  f_10 numeric; f_11 numeric; f_12 numeric; f_13 numeric; f_14 numeric; f_qmi numeric; f_16 numeric;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');

  if p_obyekt_id is not null then
    if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
    end if;
    v_obyektlar := array[p_obyekt_id];
  else
    select coalesce(array_agg(id order by id), '{}') into v_obyektlar from public.t2_obyekt where kompaniya_id = p_kompaniya_id;
  end if;

  -- 1, 2(muqobil), 15: obyekt bo'yicha kategoriya yig'indilari → mavjud ustama kaskadi (obyekt koeffitsientlari)
  for r in
    select o.id as oid, o.nom,
      jsonb_build_object('chel', coalesce(sum(h.fakt_summa) filter (where h.kat='ЧЕЛ'),0), 'mash', coalesce(sum(h.fakt_summa) filter (where h.kat='МАШ'),0),
        'mat', coalesce(sum(h.fakt_summa) filter (where h.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')),0), 'ob', coalesce(sum(h.fakt_summa) filter (where h.kat='ОБ'),0),
        'mk', coalesce(sum(h.fakt_summa) filter (where h.kat='М/К'),0), 'kab', coalesce(sum(h.fakt_summa) filter (where h.kat='КАБ'),0),
        'bez', coalesce(sum(h.fakt_summa) filter (where h.kat='БЕЗСКЛАД'),0)) as fc,
      jsonb_build_object('chel', coalesce(sum(h.f2_summa) filter (where h.kat='ЧЕЛ'),0), 'mash', coalesce(sum(h.f2_summa) filter (where h.kat='МАШ'),0),
        'mat', coalesce(sum(h.f2_summa) filter (where h.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')),0), 'ob', coalesce(sum(h.f2_summa) filter (where h.kat='ОБ'),0),
        'mk', coalesce(sum(h.f2_summa) filter (where h.kat='М/К'),0), 'kab', coalesce(sum(h.f2_summa) filter (where h.kat='КАБ'),0),
        'bez', coalesce(sum(h.f2_summa) filter (where h.kat='БЕЗСКЛАД'),0)) as f2c,
      coalesce(sum(h.fakt_summa) filter (where h.kat not in ('ЧЕЛ','МАШ','МАТ','М/К','КАБ','БЕЗСКЛАД','ОБ') or h.kat is null), 0) as fakt_katsiz,
      coalesce(sum(h.f2_summa) filter (where h.kat not in ('ЧЕЛ','МАШ','МАТ','М/К','КАБ','БЕЗСКЛАД','ОБ') or h.kat is null), 0) as f2_katsiz,
      count(*) filter (where h.fakt_summa is null and coalesce(h.fakt_hajm, 0) <> 0) as fakt_nom,
      count(*) filter (where coalesce(h.f2_summa_nomalum, 0) > 0) as f2_nom
    from public.t2_obyekt o
    left join public.t2_qator_holat h on h.obyekt_id = o.id and h.tur in ('rs','mat','ob')
    where o.id = any(v_obyektlar)
    group by o.id, o.nom order by o.id
  loop
    z := public.t2_obyekt_nakrutka_v1(r.oid, p_actor_id, null);
    if coalesce(z->>'ok', 'false') <> 'true' or z->'koeffitsientlar' is null then
      v_zanjir_xato := v_zanjir_xato + 1;
      v_yoyilma := v_yoyilma || jsonb_build_array(jsonb_build_object('obyekt_id', r.oid, 'nom', r.nom, 'fakt', null, 'f2', null, 'qmi', null));
      continue;
    end if;
    c := z->'koeffitsientlar';
    nk := public.t2_nakrutka_hisobla_v1(r.fc, c);
    nf := public.t2_nakrutka_hisobla_v1(r.f2c, c);
    ns := z->'nakrutka';
    v_fakt := v_fakt + (nk->>'vsego')::numeric; v_fakt_i4 := v_fakt_i4 + (nk->>'itogo4')::numeric;
    v_fakt_u := v_fakt_u + (select coalesce(sum(value::numeric), 0) from jsonb_each_text(r.fc) where key in ('chel','mash','mat','ob'));
    v_f2a := v_f2a + (nf->>'vsego')::numeric; v_f2a_i4 := v_f2a_i4 + (nf->>'itogo4')::numeric;
    v_f2a_u := v_f2a_u + (select coalesce(sum(value::numeric), 0) from jsonb_each_text(r.f2c) where key in ('chel','mash','mat','ob'));
    v_qmi := v_qmi + coalesce((ns->>'vsego')::numeric, 0); v_qmi_i4 := v_qmi_i4 + coalesce((ns->>'itogo4')::numeric, 0);
    v_qmi_u := v_qmi_u + (select coalesce(sum(value::numeric), 0) from jsonb_each_text(z->'cats') where key in ('chel','mash','mat','ob'));
    v_fakt_nom := v_fakt_nom + r.fakt_nom; v_f2_nom := v_f2_nom + r.f2_nom;
    v_yoyilma := v_yoyilma || jsonb_build_array(jsonb_build_object('obyekt_id', r.oid, 'nom', r.nom,
      'fakt', round((nk->>'vsego')::numeric, 2), 'f2', round((nf->>'vsego')::numeric, 2), 'qmi', round((ns->>'vsego')::numeric, 2),
      'fakt_katsiz', r.fakt_katsiz, 'f2_katsiz', r.f2_katsiz));
  end loop;
  if v_zanjir_xato > 0 then v_fakt := null; v_f2a := null; v_qmi := null; end if;

  -- 2: rasmiy F2 reestri (faqat kompaniya kesimida — reestr shartnoma bo'yicha, obyektga bog'lanmagan)
  if p_obyekt_id is null then
    select count(*), sum(qqs_bilan) into v_reestr_soni, v_reestr
      from public.t2_f2_reestr_jami where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor';
  end if;

  -- 5: tushgan pul (qaytarim — ayiriladi)
  select count(*), sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end) into v_tolov_soni, v_tushgan
    from public.t2_tolov t
   where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor'
     and (p_obyekt_id is null or t.obyekt_id = p_obyekt_id);

  -- 8: joriy sarf
  select count(*), sum(x.summa) into v_xarajat_soni, v_sarf
    from public.t2_xarajat x
   where x.kompaniya_id = p_kompaniya_id and coalesce(x.holat, 'faol') <> 'bekor'
     and (p_obyekt_id is null or x.obyekt_id = p_obyekt_id);

  -- Qo'lda qiymatlar (kesimning o'zi: kompaniya → obyekt_id null; obyekt → shu obyekt)
  select coalesce(jsonb_object_agg(m.kod, jsonb_build_object('qiymat', m.qiymat, 'sana', m.sana, 'kim', m.kim, 'izoh', m.izoh, 'yaratildi', m.yaratildi)), '{}'::jsonb)
    into q from public.t2_moliya_qolda m
   where m.kompaniya_id = p_kompaniya_id and m.holat = 'faol' and coalesce(m.obyekt_id, 0) = coalesce(p_obyekt_id, 0);

  -- Tizim qiymati → qo'lda (bo'lsa ustun)
  f_fakt := coalesce((q->'fakt'->>'qiymat')::numeric, v_fakt);
  f_f2   := coalesce((q->'f2'->>'qiymat')::numeric, case when v_reestr_soni > 0 then v_reestr else v_f2a end);
  f_kut  := (q->'f2_kutilgan'->>'qiymat')::numeric;
  f_tush := coalesce((q->'tushgan'->>'qiymat')::numeric, case when v_tolov_soni > 0 then v_tushgan end);
  f_sarf := coalesce((q->'sarf'->>'qiymat')::numeric, case when v_xarajat_soni > 0 then v_sarf end);
  f_qarz := (q->'qarz'->>'qiymat')::numeric;
  f_11   := (q->'yakunlash_talab'->>'qiymat')::numeric;
  f_qmi  := coalesce((q->'qmi'->>'qiymat')::numeric, case when v_qmi > 0 then v_qmi end);
  -- Hisoblangan (NULL tarqaladi)
  f_qil := f_fakt - f_f2 - f_kut;
  f_6 := f_f2 - f_tush; f_7 := f_fakt - f_tush;
  f_10 := f_sarf + f_qarz; f_12 := f_fakt - f_10; f_13 := f_12 - f_11; f_14 := f_10 + f_11; f_16 := f_qmi - f_14;

  return jsonb_build_object('ok', true, 'generated_at', now(),
    'qamrov', jsonb_build_object('kompaniya_id', p_kompaniya_id, 'obyekt_id', p_obyekt_id, 'obyektlar', to_jsonb(v_obyektlar)),
    'qqs', 'bilan',
    'korsatkichlar', jsonb_build_array(
      jsonb_build_object('n', 1, 'kod', 'fakt', 'qiymat', round(f_fakt, 2), 'formula', 'Σ fakt (t2_qator_holat.fakt_summa) → ustama kaskadi, QQS bilan',
        'manba', case when q ? 'fakt' then 'qolda' else 'tizim' end, 'qolda', q->'fakt', 'tahrir', true,
        'tizim_qiymat', round(v_fakt, 2), 'ustamasiz', round(v_fakt_u, 2), 'ustamali_qqssiz', round(v_fakt_i4, 2), 'nomalum_soni', v_fakt_nom),
      jsonb_build_object('n', 2, 'kod', 'f2', 'qiymat', round(f_f2, 2),
        'formula', case when v_reestr_soni > 0 then 'Rasmiy F2 reestri (t2_f2_reestr_jami.qqs_bilan)' else 'Tasdiqlangan F2 aktlari → ustama kaskadi, QQS bilan' end,
        'manba', case when q ? 'f2' then 'qolda' else 'tizim' end, 'qolda', q->'f2', 'tahrir', true,
        'tizim_qiymat', round(case when v_reestr_soni > 0 then v_reestr else v_f2a end, 2),
        'reestr', round(v_reestr, 2), 'reestr_soni', v_reestr_soni,
        'akt_qqs_bilan', round(v_f2a, 2), 'ustamasiz', round(v_f2a_u, 2), 'ustamali_qqssiz', round(v_f2a_i4, 2), 'nomalum_soni', v_f2_nom),
      jsonb_build_object('n', 3, 'kod', 'f2_kutilgan', 'qiymat', round(f_kut, 2), 'formula', 'Qo''lda (tayyorlanayotgan F2)',
        'manba', 'qolda', 'qolda', q->'f2_kutilgan', 'tahrir', true),
      jsonb_build_object('n', 4, 'kod', 'f2_qilinmagan', 'qiymat', round(f_qil, 2), 'formula', '1 − 2 − 3', 'manba', 'hisoblangan'),
      jsonb_build_object('n', 5, 'kod', 'tushgan', 'qiymat', round(f_tush, 2), 'formula', 'Σ to''lovlar (t2_tolov, 1C sverka), qaytarim ayiriladi',
        'manba', case when q ? 'tushgan' then 'qolda' else 'tizim' end, 'qolda', q->'tushgan', 'tahrir', true,
        'tizim_qiymat', round(case when v_tolov_soni > 0 then v_tushgan end, 2), 'yozuv_soni', v_tolov_soni),
      jsonb_build_object('n', 6, 'kod', 'f2_tushgan_farq', 'qiymat', round(f_6, 2), 'formula', '2 − 5', 'manba', 'hisoblangan'),
      jsonb_build_object('n', 7, 'kod', 'fakt_tushgan_farq', 'qiymat', round(f_7, 2), 'formula', '1 − 5', 'manba', 'hisoblangan'),
      jsonb_build_object('n', 8, 'kod', 'sarf', 'qiymat', round(f_sarf, 2), 'formula', 'Σ xarajatlar (t2_xarajat)',
        'manba', case when q ? 'sarf' then 'qolda' else 'tizim' end, 'qolda', q->'sarf', 'tahrir', true,
        'tizim_qiymat', round(case when v_xarajat_soni > 0 then v_sarf end, 2), 'yozuv_soni', v_xarajat_soni),
      jsonb_build_object('n', 9, 'kod', 'qarz', 'qiymat', round(f_qarz, 2), 'formula', 'Qo''lda (materiallar, ish haqi va h.k. bo''yicha qarz)',
        'manba', 'qolda', 'qolda', q->'qarz', 'tahrir', true),
      jsonb_build_object('n', 10, 'kod', 'umumiy_sarf', 'qiymat', round(f_10, 2), 'formula', '8 + 9', 'manba', 'hisoblangan'),
      jsonb_build_object('n', 11, 'kod', 'yakunlash_talab', 'qiymat', round(f_11, 2), 'formula', 'Qo''lda (yakunlash uchun talab)',
        'manba', 'qolda', 'qolda', q->'yakunlash_talab', 'tahrir', true),
      jsonb_build_object('n', 12, 'kod', 'bajarilgan_xarajat_farq', 'qiymat', round(f_12, 2), 'formula', '1 − 10', 'manba', 'hisoblangan'),
      jsonb_build_object('n', 13, 'kod', 'tugatish_farq', 'qiymat', round(f_13, 2), 'formula', '12 − 11', 'manba', 'hisoblangan'),
      jsonb_build_object('n', 14, 'kod', 'yakuniy_xarajat', 'qiymat', round(f_14, 2), 'formula', '10 + 11', 'manba', 'hisoblangan'),
      jsonb_build_object('n', 15, 'kod', 'qmi', 'qiymat', round(f_qmi, 2), 'formula', 'Smeta ВСЕГО (t2_obyekt_nakrutka_v1), QQS bilan',
        'manba', case when q ? 'qmi' then 'qolda' else 'tizim' end, 'qolda', q->'qmi', 'tahrir', true,
        'tizim_qiymat', round(case when v_qmi > 0 then v_qmi end, 2), 'ustamasiz', round(v_qmi_u, 2), 'ustamali_qqssiz', round(v_qmi_i4, 2)),
      jsonb_build_object('n', 16, 'kod', 'yakuniy_farq', 'qiymat', round(f_16, 2), 'formula', '15 − 14', 'manba', 'hisoblangan')
    ),
    'obyekt_yoyilma', case when p_obyekt_id is null then v_yoyilma end,
    'zanjir_xato_soni', v_zanjir_xato);
end $fn$;

revoke all on function public.t2_moliya_qolda_yoz_v1(bigint, bigint, bigint, text, numeric, date, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_moliya_tahlil_v1(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_moliya_qolda_yoz_v1(bigint, bigint, bigint, text, numeric, date, text, uuid) to service_role;
grant execute on function public.t2_moliya_tahlil_v1(bigint, bigint, bigint) to service_role;

commit;
