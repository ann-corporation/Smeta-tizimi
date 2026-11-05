-- T2-SHARTNOMA-HUJJAT-001 — shartnoma va qo'shimcha kelishuv (DS) asl fayllari (PDF/skan) kanonik R2 saqlashda, shartnoma kartasidan yuklab olinadi.
-- Egasi (2026-11-05): «shartnomalarni tizimni kerakli joylariga moslab yuklab to'g'irlab qo'yish ... shakllarini tizimdan yuklab olish imkoniyati
-- bo'lishi kerak, r2 da saqlanishi kerak ... boshqalar ham foydalana oladigan qilib» — barcha kompaniyalar uchun umumiy.
-- «Dublikat yasama»: fayl baytlari MAVJUD kanonik yo'ldan (/api/hujjat-yukla → t2_document_registry + R2_CANONICAL, document_type 'shartnoma'),
-- yuklab olish MAVJUD /api/hujjat-ol orqali. DS ma'lumoti MAVJUD t2_shartnoma_ds (yozish — t2_sverka_yozuv_v1). Bu migratsiya faqat
-- hujjat ↔ shartnoma / DS BOG'INI qo'shadi (bitta shartnomaga yoki DS ga bir necha fayl: skan + elektron nusxa + ilova).
begin;

create table if not exists public.t2_shartnoma_hujjat (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  shartnoma_id bigint not null references public.t2_shartnoma(id) on delete cascade,
  ds_id bigint references public.t2_shartnoma_ds(id) on delete cascade,
  document_id bigint not null references public.t2_document_registry(id) on delete cascade,
  tur text not null default 'asosiy' check (tur in ('asosiy', 'ds', 'ilova', 'boshqa')),
  izoh text check (izoh is null or length(izoh) <= 500),
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  kim_actor_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  constraint t2_shartnoma_hujjat_ds_tur_check check ((tur = 'ds') = (ds_id is not null))
);
comment on table public.t2_shartnoma_hujjat is 'Shartnoma / DS asl hujjati (kanonik t2_document_registry, R2) bilan bog''. tur: asosiy (shartnoma o''zi), ds (qo''shimcha kelishuv, ds_id majburiy), ilova, boshqa. Bekor qilish — holat=bekor (fayl R2 da qoladi).';
create unique index if not exists t2_shartnoma_hujjat_faol_uq on public.t2_shartnoma_hujjat(shartnoma_id, document_id, coalesce(ds_id, 0)) where holat = 'faol';
create index if not exists t2_shartnoma_hujjat_sh_idx on public.t2_shartnoma_hujjat(shartnoma_id) where holat = 'faol';
create index if not exists t2_shartnoma_hujjat_k_idx on public.t2_shartnoma_hujjat(kompaniya_id);
create index if not exists t2_shartnoma_hujjat_doc_idx on public.t2_shartnoma_hujjat(document_id);
alter table public.t2_shartnoma_hujjat enable row level security;
revoke all on public.t2_shartnoma_hujjat from anon, authenticated;

/* YOZISH: kanonik saqlangan hujjatni shartnomaga (yoki uning DS iga) bog'lash. a'zolik + document.write; idempotent (operation_id).
   Faol bog' allaqachon bo'lsa — o'sha qaytadi (takror: true), ikkinchi qator yaratilmaydi. */
create or replace function public.t2_shartnoma_hujjat_bogla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_shartnoma_id bigint, p_ds_id bigint,
  p_document_id bigint, p_tur text, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb; v_tur text := coalesce(nullif(btrim(coalesce(p_tur, '')), ''), case when p_ds_id is null then 'asosiy' else 'ds' end);
  v_id bigint; v_doc public.t2_document_registry%rowtype;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.write');
  if v_tur not in ('asosiy', 'ds', 'ilova', 'boshqa') then return jsonb_build_object('ok', false, 'code', 'TUR_INVALID'); end if;
  if (v_tur = 'ds') <> (p_ds_id is not null) then return jsonb_build_object('ok', false, 'code', 'DS_TUR_MOS_EMAS'); end if;
  if p_izoh is not null and length(p_izoh) > 500 then return jsonb_build_object('ok', false, 'code', 'IZOH_UZUN'); end if;
  if not exists (select 1 from public.t2_shartnoma s where s.id = p_shartnoma_id and s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor') then
    return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOT_FOUND');
  end if;
  if p_ds_id is not null and not exists (select 1 from public.t2_shartnoma_ds d
       where d.id = p_ds_id and d.shartnoma_id = p_shartnoma_id and d.kompaniya_id = p_kompaniya_id and d.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'DS_NOT_FOUND');
  end if;
  select * into v_doc from public.t2_document_registry r where r.id = p_document_id and r.kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'HUJJAT_NOT_FOUND'); end if;
  if v_doc.canonical_storage_status <> 'stored' or v_doc.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'HUJJAT_SAQLANMAGAN', 'canonical_storage_status', v_doc.canonical_storage_status, 'status', v_doc.status);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('t2_shartnoma_hujjat:' || p_shartnoma_id || ':' || p_document_id, 0));
  select h.id into v_id from public.t2_shartnoma_hujjat h
   where h.shartnoma_id = p_shartnoma_id and h.document_id = p_document_id and coalesce(h.ds_id, 0) = coalesce(p_ds_id, 0) and h.holat = 'faol';
  if found then
    v_res := jsonb_build_object('ok', true, 'id', v_id, 'takror', true);
  else
    insert into public.t2_shartnoma_hujjat(kompaniya_id, shartnoma_id, ds_id, document_id, tur, izoh, kim_actor_id)
    values (p_kompaniya_id, p_shartnoma_id, p_ds_id, p_document_id, v_tur, nullif(btrim(coalesce(p_izoh, '')), ''), p_actor_id)
    returning id into v_id;
    perform public.t2_audit_yoz(p_kompaniya_id, 'shartnoma_hujjat_bogla', 'shartnoma', null,
      format('shartnoma=%s ds=%s document_id=%s tur=%s', p_shartnoma_id, coalesce(p_ds_id::text, '-'), p_document_id, v_tur), 'actor:' || p_actor_id, null);
    v_res := jsonb_build_object('ok', true, 'id', v_id, 'takror', false);
  end if;
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 't2_shartnoma_hujjat_bogla_v1', v_res);
  return v_res;
end $$;

/* YOZISH: bog'ni bekor qilish (holat=bekor). Fayl kanonik saqlashda qoladi — hech narsa o'chirilmaydi. */
create or replace function public.t2_shartnoma_hujjat_ajrat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb; v_h public.t2_shartnoma_hujjat%rowtype;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.write');
  select * into v_h from public.t2_shartnoma_hujjat where id = p_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'BOG_NOT_FOUND'); end if;
  if v_h.holat = 'faol' then
    update public.t2_shartnoma_hujjat set holat = 'bekor', yangilandi = now() where id = p_id;
    perform public.t2_audit_yoz(p_kompaniya_id, 'shartnoma_hujjat_ajrat', 'shartnoma', null,
      format('bog=%s shartnoma=%s document_id=%s', p_id, v_h.shartnoma_id, v_h.document_id), 'actor:' || p_actor_id, null);
  end if;
  v_res := jsonb_build_object('ok', true, 'id', p_id, 'holat', 'bekor');
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 't2_shartnoma_hujjat_ajrat_v1', v_res);
  return v_res;
end $$;

/* O'QISH (stable): bitta shartnoma — DS lari (sana tartibida) va bog'langan fayllar (shartnomaga / har DS ga),
   hamda kompaniyaning hali hech bir shartnomaga bog'lanmagan 'shartnoma' turidagi fayllari (bog'lash uchun tanlov). a'zolik + document.read. */
create or replace function public.t2_shartnoma_hujjat_royxat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_shartnoma_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sh public.t2_shartnoma%rowtype;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.read');
  select * into v_sh from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'generated_at', now(),
    'shartnoma', jsonb_build_object('id', v_sh.id, 'raqam', v_sh.raqam, 'sana', v_sh.sana, 'nom', v_sh.nom, 'predmet', v_sh.predmet,
                   'jami_nds_bilan', v_sh.jami_nds_bilan, 'holat', v_sh.holat, 'versiya', v_sh.versiya),
    'ds', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'raqam', d.raqam, 'sana', d.sana, 'jami_nds_bilan', d.jami_nds_bilan,
                     'izoh', d.izoh, 'versiya', d.versiya) order by d.sana, d.id), '[]'::jsonb)
             from public.t2_shartnoma_ds d where d.shartnoma_id = v_sh.id and d.kompaniya_id = p_kompaniya_id and d.holat = 'faol'),
    'hujjatlar', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'ds_id', h.ds_id, 'tur', h.tur, 'izoh', h.izoh, 'yaratildi', h.yaratildi,
                     'document_id', r.id, 'original_filename', r.original_filename, 'mime_type', r.mime_type, 'size_bytes', r.size_bytes,
                     'sha256', r.sha256, 'saqlangan', r.canonical_storage_status = 'stored', 'yuklangan', r.created_at)
                     order by h.ds_id nulls first, h.yaratildi, h.id), '[]'::jsonb)
             from public.t2_shartnoma_hujjat h join public.t2_document_registry r on r.id = h.document_id
            where h.shartnoma_id = v_sh.id and h.kompaniya_id = p_kompaniya_id and h.holat = 'faol'),
    'boglanmagan', (select coalesce(jsonb_agg(jsonb_build_object('document_id', x.id, 'original_filename', x.original_filename,
                     'size_bytes', x.size_bytes, 'yuklangan', x.created_at) order by x.created_at desc), '[]'::jsonb)
             from (select r.id, r.original_filename, r.size_bytes, r.created_at from public.t2_document_registry r
                    where r.kompaniya_id = p_kompaniya_id and r.document_type = 'shartnoma' and r.canonical_storage_status = 'stored' and r.status = 'active'
                      and not exists (select 1 from public.t2_shartnoma_hujjat h where h.document_id = r.id and h.holat = 'faol')
                    order by r.created_at desc limit 50) x));
end $$;

revoke all on function public.t2_shartnoma_hujjat_bogla_v1(bigint, bigint, bigint, bigint, bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_shartnoma_hujjat_ajrat_v1(bigint, bigint, bigint, uuid) from public, anon, authenticated;
revoke all on function public.t2_shartnoma_hujjat_royxat_v1(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_shartnoma_hujjat_bogla_v1(bigint, bigint, bigint, bigint, bigint, text, text, uuid) to service_role;
grant execute on function public.t2_shartnoma_hujjat_ajrat_v1(bigint, bigint, bigint, uuid) to service_role;
grant execute on function public.t2_shartnoma_hujjat_royxat_v1(bigint, bigint, bigint) to service_role;

commit;
