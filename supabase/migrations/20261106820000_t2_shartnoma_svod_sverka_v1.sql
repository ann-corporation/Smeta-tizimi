-- T2-NAKOPITELNIY-SHARTNOMA-SVOD-001 — Nakopitelniy vedomostga shartnoma darajasi: DS, F3 (sotuv summasidan), to'lov, akt-sverka.
-- Egasi (2026-10-23): «nakopitelniy, slichitelniy va shunga o'xshash hujjatlarni tayyor Smeta tizimimizdan foydalanib qilishimiz kerak»;
-- «dublikat yasamang» — faqat MAVJUD modellar kengaytiriladi:
--   * F3      → mavjud t2_forma3 (20260912120000). Yangi ustunlar: manba ('f2' | 'sotuv'), sotuv_summa, sotuv_sana, nds_foiz.
--               Egasi qoidasi: F3 = akt-sverkadagi har «Продажа» summasi (QQS bilan). F2 asosidagi F3 (manba='f2') o'zgarmaydi.
--   * F2      → mavjud t2_akt (tur='f2', holat='tasdiqlangan', raqam) — yangi jadval yo'q.
--   * To'lov  → mavjud t2_tolov (avans/tolov/qaytarim) — o'zgarmaydi.
--   * DS      → t2_shartnoma_ds (YANGI, minimal): shartnoma modulida qo'shimcha kelishuv ma'lumot modeli yo'q
--               (faqat test02/TestShartnoma.tsx dagi bo'sh joy). Eng oxirgi faol DS — joriy shartnoma summasi.
-- Hisob frontend da yagona sof funksiyada (lib/nakopitelniy-svod.ts); server faqat a'zolik ichida o'qiydi/yozadi.
-- Tasdiqlangan F2 ga va mavjud F3 qatorlariga tegilmaydi.

begin;

-- 1. DS (qo'shimcha kelishuv)
create table if not exists public.t2_shartnoma_ds (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  shartnoma_id bigint not null references public.t2_shartnoma(id) on delete cascade,
  raqam text not null check (length(btrim(raqam)) between 1 and 100),
  sana date not null,
  jami_nds_bilan numeric(20,2) not null check (jami_nds_bilan >= 0),
  izoh text,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  versiya integer not null default 1,
  kim text,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now());
comment on table public.t2_shartnoma_ds is 'Qo''shimcha kelishuv (DS): shartnomaning shu sanadan amaldagi jami summasi (QQS bilan). Eng oxirgi faol DS — joriy shartnoma summasi.';
create index if not exists t2_shartnoma_ds_sh_idx on public.t2_shartnoma_ds(shartnoma_id, sana);
create index if not exists t2_shartnoma_ds_k_idx on public.t2_shartnoma_ds(kompaniya_id);
alter table public.t2_shartnoma_ds enable row level security;
revoke all on public.t2_shartnoma_ds from anon, authenticated;

-- 2. F3 — sotuv summasidan rejimi (mavjud t2_forma3 kengaytiriladi)
alter table public.t2_forma3 add column if not exists manba text not null default 'f2';
alter table public.t2_forma3 add column if not exists sotuv_summa numeric(20,2);
alter table public.t2_forma3 add column if not exists sotuv_sana date;
alter table public.t2_forma3 add column if not exists nds_foiz numeric(5,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_forma3_manba_check' and conrelid = 'public.t2_forma3'::regclass) then
    alter table public.t2_forma3 add constraint t2_forma3_manba_check check (manba in ('f2', 'sotuv'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 't2_forma3_sotuv_check' and conrelid = 'public.t2_forma3'::regclass) then
    alter table public.t2_forma3 add constraint t2_forma3_sotuv_check check (
      manba <> 'sotuv' or (sotuv_summa is not null and sotuv_summa <> 0 and sotuv_sana is not null and shartnoma_id is not null
                           and nds_foiz is not null and nds_foiz >= 0 and nds_foiz < 100));
  end if;
end $$;
comment on column public.t2_forma3.manba is 'f2 — tasdiqlangan F2 aktlaridan (t2_forma3_akt); sotuv — akt-sverkadagi «Продажа» summasidan (egasi qoidasi 2026-10-23).';
comment on column public.t2_forma3.sotuv_summa is 'manba=sotuv: F3 summasi QQS bilan (sverkadagi sotuv summasi tiyinigacha).';
create index if not exists t2_forma3_shartnoma_idx on public.t2_forma3(shartnoma_id);
create unique index if not exists t2_forma3_sotuv_takror_uq on public.t2_forma3(shartnoma_id, sotuv_sana, coalesce(raqam, ''), sotuv_summa)
  where manba = 'sotuv' and holat <> 'bekor';

/* O'QISH: kompaniya shartnomalari bo'yicha svod/sverka uchun xom ma'lumot. */
create or replace function public.t2_shartnoma_svod_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_res jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  select jsonb_build_object('ok', true, 'generated_at', now(), 'shartnomalar', coalesce(jsonb_agg(x.j order by x.loyiha_id nulls last, x.raqam, x.id), '[]'::jsonb))
    into v_res
    from (
      select s.id, s.loyiha_id, s.raqam, jsonb_build_object(
        'id', s.id, 'loyiha_id', s.loyiha_id, 'raqam', s.raqam, 'nom', s.nom, 'asosiy', s.asosiy, 'holat', s.holat,
        'jami_nds_bilan', s.jami_nds_bilan,
        'obyektlar', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom) order by o.nom), '[]'::jsonb)
                        from public.t2_shartnoma_bog b join public.t2_obyekt o on o.id = b.obyekt_id
                       where b.shartnoma_id = s.id and b.holat = 'faol'),
        'ds', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'raqam', d.raqam, 'sana', d.sana, 'jami_nds_bilan', d.jami_nds_bilan,
                  'izoh', d.izoh, 'versiya', d.versiya) order by d.sana, d.id), '[]'::jsonb)
                 from public.t2_shartnoma_ds d where d.shartnoma_id = s.id and d.holat = 'faol'),
        'f2', (select coalesce(jsonb_agg(jsonb_build_object('akt_id', a.id, 'obyekt_id', a.obyekt_id, 'oy', a.oy, 'raqam', a.raqam,
                  'hujjat_jami', a.hujjat_jami) order by a.oy, a.id), '[]'::jsonb)
                 from public.t2_akt a
                 left join public.t2_shartnoma_bog b on b.obyekt_id = a.obyekt_id and b.holat = 'faol'
                where a.tur = 'f2' and a.holat = 'tasdiqlangan'
                  and coalesce(a.shartnoma_id, b.shartnoma_id) = s.id
                  and (a.kompaniya_id = p_kompaniya_id or a.kompaniya_id is null)),
        'f3', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'manba', f.manba, 'raqam', f.raqam, 'sotuv_sana', f.sotuv_sana,
                  'sotuv_summa', f.sotuv_summa, 'nds_foiz', f.nds_foiz, 'davr_boshi', f.davr_boshi, 'davr_oxiri', f.davr_oxiri, 'holat', f.holat,
                  'bajarilgan_f2_summa', f.bajarilgan_f2_summa, 'izoh', f.izoh, 'versiya', f.versiya)
                  order by coalesce(f.sotuv_sana, f.davr_oxiri), f.id), '[]'::jsonb)
                 from public.t2_forma3 f where f.shartnoma_id = s.id and f.kompaniya_id = p_kompaniya_id and f.holat <> 'bekor'),
        'tolovlar', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'sana', t.sana, 'summa', t.summa, 'tur', t.tur, 'izoh', t.izoh)
                  order by t.sana, t.id), '[]'::jsonb)
                 from public.t2_tolov t where t.shartnoma_id = s.id and t.holat <> 'bekor')
      ) j
      from public.t2_shartnoma s
     where s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor'
    ) x;
  return v_res;
end $$;

/* YOZISH: DS yoki F3 (sotuv summasidan) — yaratish, tahrirlash (versiya bilan), bekor qilish (holat='bekor').
   Idempotent (operation_id), a'zolik + financial.write, shartnoma kompaniyaga tegishli bo'lishi shart. */
create or replace function public.t2_sverka_yozuv_v1(p_actor_id bigint, p_kompaniya_id bigint, p_shartnoma_id bigint, p_tur text,
  p_yozuv_id bigint, p_kutilgan_versiya integer, p_malumot jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb; v_id bigint; v_ver integer; v_holat text; v_sh public.t2_shartnoma%rowtype;
  v_sana date; v_summa numeric; v_boshi date; v_oxiri date; v_f3 text; v_m jsonb := coalesce(p_malumot, '{}'::jsonb);
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_tur not in ('ds', 'f3_sotuv') then return jsonb_build_object('ok', false, 'code', 'TUR_INVALID'); end if;
  if jsonb_typeof(v_m) <> 'object' then return jsonb_build_object('ok', false, 'code', 'MALUMOT_INVALID'); end if;
  select * into v_sh from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOT_FOUND'); end if;

  if p_tur = 'ds' then
    v_holat := coalesce(nullif(v_m->>'holat', ''), 'faol');
    if v_holat not in ('faol', 'bekor') or (p_yozuv_id is null and v_holat = 'bekor') then return jsonb_build_object('ok', false, 'code', 'HOLAT_INVALID'); end if;
    v_sana := nullif(v_m->>'sana', '')::date; v_summa := nullif(v_m->>'jami_nds_bilan', '')::numeric;
    if p_yozuv_id is null and (v_sana is null or v_summa is null or v_summa < 0 or nullif(btrim(coalesce(v_m->>'raqam', '')), '') is null) then
      return jsonb_build_object('ok', false, 'code', 'DS_MAYDON', 'xabar', 'DS: raqam, sana va jami summa (QQS bilan, ≥ 0) majburiy.');
    end if;
    if p_yozuv_id is null then
      insert into public.t2_shartnoma_ds(kompaniya_id, shartnoma_id, raqam, sana, jami_nds_bilan, izoh, kim)
      values (p_kompaniya_id, p_shartnoma_id, btrim(v_m->>'raqam'), v_sana, round(v_summa, 2), nullif(v_m->>'izoh', ''), 'actor:' || p_actor_id)
      returning id, versiya into v_id, v_ver;
    else
      select versiya into v_ver from public.t2_shartnoma_ds where id = p_yozuv_id and shartnoma_id = p_shartnoma_id and kompaniya_id = p_kompaniya_id for update;
      if not found then return jsonb_build_object('ok', false, 'code', 'YOZUV_NOT_FOUND'); end if;
      if p_kutilgan_versiya is null or v_ver <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_ver); end if;
      if v_summa is not null and v_summa < 0 then return jsonb_build_object('ok', false, 'code', 'DS_MAYDON'); end if;
      update public.t2_shartnoma_ds set
        raqam = coalesce(nullif(btrim(coalesce(v_m->>'raqam', '')), ''), raqam), sana = coalesce(v_sana, sana),
        jami_nds_bilan = coalesce(round(v_summa, 2), jami_nds_bilan), izoh = case when v_m ? 'izoh' then nullif(v_m->>'izoh', '') else izoh end,
        holat = v_holat, versiya = versiya + 1, yangilandi = now()
       where id = p_yozuv_id returning id, versiya into v_id, v_ver;
    end if;

  else -- f3_sotuv: mavjud t2_forma3 ga manba='sotuv'
    v_holat := coalesce(nullif(v_m->>'holat', ''), 'qoralama');
    if v_holat not in ('qoralama', 'tayyor', 'imzolangan', 'bekor') or (p_yozuv_id is null and v_holat = 'bekor') then
      return jsonb_build_object('ok', false, 'code', 'HOLAT_INVALID');
    end if;
    v_sana := nullif(v_m->>'sotuv_sana', '')::date; v_summa := nullif(v_m->>'sotuv_summa', '')::numeric;
    v_boshi := nullif(v_m->>'davr_boshi', '')::date; v_oxiri := nullif(v_m->>'davr_oxiri', '')::date;
    if p_yozuv_id is null then
      if v_sana is null or v_summa is null or v_summa = 0 then
        return jsonb_build_object('ok', false, 'code', 'F3_SOTUV_MAYDON', 'xabar', 'F3: sotuv sanasi va summasi (QQS bilan, 0 emas) majburiy.');
      end if;
      v_oxiri := coalesce(v_oxiri, v_sana); v_boshi := coalesce(v_boshi, v_oxiri);
      if v_boshi > v_oxiri then return jsonb_build_object('ok', false, 'code', 'DAVR_INVALID'); end if;
      insert into public.t2_forma3(kompaniya_id, loyiha_id, obyekt_id, shartnoma_id, raqam, davr_boshi, davr_oxiri, holat, izoh,
                                   operation_id, actor_id, manba, sotuv_summa, sotuv_sana, nds_foiz)
      values (p_kompaniya_id, v_sh.loyiha_id, null, p_shartnoma_id, nullif(btrim(coalesce(v_m->>'raqam', '')), ''), v_boshi, v_oxiri, v_holat,
              nullif(v_m->>'izoh', ''), p_operation_id, p_actor_id, 'sotuv', round(v_summa, 2), v_sana, coalesce(nullif(v_m->>'nds_foiz', '')::numeric, 12))
      on conflict do nothing
      returning id, versiya into v_id, v_ver;
      if v_id is null then return jsonb_build_object('ok', false, 'code', 'F3_TAKROR', 'xabar', 'Shu sana, raqam va summali F3 allaqachon bor.'); end if;
    else
      select manba, versiya into v_f3, v_ver from public.t2_forma3 where id = p_yozuv_id and shartnoma_id = p_shartnoma_id and kompaniya_id = p_kompaniya_id for update;
      if not found then return jsonb_build_object('ok', false, 'code', 'YOZUV_NOT_FOUND'); end if;
      if v_f3 <> 'sotuv' then return jsonb_build_object('ok', false, 'code', 'F3_F2_DAN', 'xabar', 'F2 asosidagi F3 bu yerda tahrirlanmaydi.'); end if;
      if p_kutilgan_versiya is null or v_ver <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_ver); end if;
      if v_summa is not null and v_summa = 0 then return jsonb_build_object('ok', false, 'code', 'F3_SOTUV_MAYDON'); end if;
      update public.t2_forma3 set
        sotuv_sana = coalesce(v_sana, sotuv_sana), sotuv_summa = coalesce(round(v_summa, 2), sotuv_summa),
        raqam = case when v_m ? 'raqam' then nullif(btrim(coalesce(v_m->>'raqam', '')), '') else raqam end,
        davr_boshi = coalesce(v_boshi, davr_boshi), davr_oxiri = coalesce(v_oxiri, davr_oxiri),
        nds_foiz = coalesce(nullif(v_m->>'nds_foiz', '')::numeric, nds_foiz),
        izoh = case when v_m ? 'izoh' then nullif(v_m->>'izoh', '') else izoh end,
        holat = v_holat, versiya = versiya + 1, yangilandi = now()
       where id = p_yozuv_id returning id, versiya into v_id, v_ver;
    end if;
  end if;

  perform public.t2_audit_yoz(p_kompaniya_id, 'sverka_yozuv_v1', 'nakopitelniy_svod', null,
    format('tur=%s shartnoma=%s yozuv=%s holat=%s', p_tur, p_shartnoma_id, v_id, v_holat), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_ver, 'tur', p_tur);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'sverka_yozuv_v1', v_res);
  return v_res;
end $$;

revoke all on function public.t2_shartnoma_svod_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_sverka_yozuv_v1(bigint, bigint, bigint, text, bigint, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.t2_shartnoma_svod_v1(bigint, bigint) to service_role;
grant execute on function public.t2_sverka_yozuv_v1(bigint, bigint, bigint, text, bigint, integer, jsonb, uuid) to service_role;

commit;
