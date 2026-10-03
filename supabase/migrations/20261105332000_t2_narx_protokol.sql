-- ПРОТОКОЛ СОГЛАСОВАНИЯ ЦЕН (egasi: "smeta narxi arzon materiallarni katalogdan solishtirib foydalanuvchiga taklif
-- etishi kerak, foydalanuvchi tasdig'iga ko'ra protokol soglasovaniya sena bo'lishi kerak. Keyingi F2 larda narx aynan
-- shu protokol asosida qo'llanilishi kerak, faqat hujjat yuklangan tasdiqlangan bo'lishi kerak").
-- Mavjud t2_price_basis (PRICE_AGREEMENT_PROTOCOL) kengaytiriladi — parallel model yo'q:
--   qoralama (taklif tanlandi, protokol hujjati chiqariladi) → imzolangan nusxa R2 ga yuklanadi → tasdiqlangan
--   (kuchga kirish oyi bilan) → shu oydan boshlab F2 tayyorlashda narx protokoldan.
begin;

alter table public.t2_price_basis
  add column if not exists obyekt_id bigint references public.t2_obyekt(id),
  add column if not exists raqam text,
  add column if not exists sana date,
  add column if not exists izoh text,
  add column if not exists tasdiqladi_actor bigint,
  add column if not exists tasdiqlandi timestamptz;
alter table public.t2_price_basis_line
  add column if not exists eski_narx numeric,
  add column if not exists manba_qator_id bigint references public.t2_narx_manba_qator(id),
  add column if not exists izoh text;
create index if not exists t2_price_basis_obyekt_idx on public.t2_price_basis (kompaniya_id, obyekt_id, holat);
create index if not exists t2_price_basis_line_qator_idx on public.t2_price_basis_line (qator_id);

-- Ro'yxat.
create or replace view public.t2_narx_protokol_royxat as
select b.id, b.kompaniya_id, b.obyekt_id, o.nom as obyekt, b.raqam, b.sana, b.holat, b.versiya, b.document_id,
  d.original_filename as hujjat_nom, b.izoh, b.yaratildi, b.tasdiqlandi,
  (select count(*) from public.t2_price_basis_line l where l.basis_id = b.id) as qator_soni,
  (select min(l.valid_from) from public.t2_price_basis_line l where l.basis_id = b.id) as kuchga_kirish
from public.t2_price_basis b
left join public.t2_obyekt o on o.id = b.obyekt_id
left join public.t2_document_registry d on d.id = b.document_id and d.kompaniya_id = b.kompaniya_id
where b.basis_type = 'PRICE_AGREEMENT_PROTOCOL';

-- Qatorlar (protokol hujjati va F2 narxi uchun).
create or replace view public.t2_narx_protokol_qator as
select l.id, l.basis_id, b.kompaniya_id, b.obyekt_id, b.raqam, b.sana, b.holat, l.qator_id, q.kat, q.kod, q.nom, q.birlik,
  l.eski_narx, l.approved_price as yangi_narx, l.valid_from, l.valid_to, l.manba_qator_id, l.izoh
from public.t2_price_basis_line l
join public.t2_price_basis b on b.id = l.basis_id and b.basis_type = 'PRICE_AGREEMENT_PROTOCOL'
join public.t2_qator q on q.id = l.qator_id;

-- Qoralama yaratish: tanlangan resurslar (smeta narxi eski, taklif — yangi).
create or replace function public.t2_narx_protokol_yarat_v1(p_actor_id bigint, p_obyekt_id bigint, p_lines jsonb, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_komp bigint; v_rol text; v_id bigint; v_prev jsonb; v_raqam text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_kompaniya_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'error', 'Obyekt topilmadi'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol = 'rahbar' then return jsonb_build_object('ok', false, 'error', 'Ruxsat yo''q'); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'Qatorlar 1..5000 bo''lishi shart');
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x left join public.t2_qator q on q.id = (x->>'qator_id')::bigint and q.obyekt_id = p_obyekt_id
             where q.id is null or nullif(x->>'yangi_narx', '') is null or (x->>'yangi_narx')::numeric <= 0) then
    return jsonb_build_object('ok', false, 'error', 'Qator obyektga tegishli emas yoki yangi narx noto''g''ri');
  end if;
  select 'ПС-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 2, '0') into v_raqam
    from public.t2_price_basis where obyekt_id = p_obyekt_id and basis_type = 'PRICE_AGREEMENT_PROTOCOL' and yaratildi::date = current_date;
  insert into public.t2_price_basis (kompaniya_id, obyekt_id, basis_type, holat, actor_id, operation_id, raqam, sana, izoh)
  values (v_komp, p_obyekt_id, 'PRICE_AGREEMENT_PROTOCOL', 'qoralama', p_actor_id, p_operation_id, v_raqam, current_date, left(p_izoh, 1000))
  returning id into v_id;
  insert into public.t2_price_basis_line (basis_id, qator_id, approved_price, eski_narx, manba_qator_id, izoh)
  select v_id, (x->>'qator_id')::bigint, (x->>'yangi_narx')::numeric, q.narx,
         nullif(x->>'manba_qator_id', '')::bigint, left(x->>'izoh', 500)
  from jsonb_array_elements(p_lines) x join public.t2_qator q on q.id = (x->>'qator_id')::bigint;
  perform public.t2_audit_yoz(v_komp, 'narx_protokol_yarat', 'narx', p_obyekt_id, v_raqam || ' (' || jsonb_array_length(p_lines) || ' qator)', 'actor:' || p_actor_id, null);
  v_prev := jsonb_build_object('ok', true, 'id', v_id, 'raqam', v_raqam);
  insert into public.t2_kompaniya_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'narx_protokol_yarat_v1', v_prev);
  return v_prev;
end $$;

-- Tasdiqlash: FAQAT imzolangan nusxa (shu kompaniyaning R2 dagi saqlangan hujjati) bilan; kuchga kirish oyi.
create or replace function public.t2_narx_protokol_tasdiqla_v1(p_actor_id bigint, p_id bigint, p_document_id bigint, p_kuchga_kirish date)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_komp bigint; v_holat text; v_rol text;
begin
  select kompaniya_id, holat into v_komp, v_holat from public.t2_price_basis where id = p_id and basis_type = 'PRICE_AGREEMENT_PROTOCOL' for update;
  if v_komp is null then return jsonb_build_object('ok', false, 'error', 'Protokol topilmadi'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol = 'rahbar' then return jsonb_build_object('ok', false, 'error', 'Ruxsat yo''q'); end if;
  if v_holat <> 'qoralama' then return jsonb_build_object('ok', false, 'error', 'Faqat qoralama protokol tasdiqlanadi'); end if;
  if p_document_id is null or not exists (select 1 from public.t2_document_registry d where d.id = p_document_id and d.kompaniya_id = v_komp and d.canonical_storage_status = 'stored') then
    return jsonb_build_object('ok', false, 'error', 'Imzolangan protokol nusxasi yuklanmagan');
  end if;
  if p_kuchga_kirish is null then return jsonb_build_object('ok', false, 'error', 'Kuchga kirish sanasi majburiy'); end if;
  update public.t2_price_basis set holat = 'tasdiqlangan', document_id = p_document_id, tasdiqladi_actor = p_actor_id, tasdiqlandi = now(), versiya = versiya + 1 where id = p_id;
  update public.t2_price_basis_line set valid_from = date_trunc('month', p_kuchga_kirish)::date where basis_id = p_id;
  perform public.t2_audit_yoz(v_komp, 'narx_protokol_tasdiqla', 'narx', null, 'protokol=' || p_id || ' hujjat=' || p_document_id, 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

create or replace function public.t2_narx_protokol_bekor_v1(p_actor_id bigint, p_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_komp bigint; v_rol text;
begin
  select kompaniya_id into v_komp from public.t2_price_basis where id = p_id and basis_type = 'PRICE_AGREEMENT_PROTOCOL' and holat <> 'bekor' for update;
  if v_komp is null then return jsonb_build_object('ok', false, 'error', 'Protokol topilmadi'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol = 'rahbar' then return jsonb_build_object('ok', false, 'error', 'Ruxsat yo''q'); end if;
  update public.t2_price_basis set holat = 'bekor', izoh = coalesce(izoh || ' | ', '') || 'Bekor: ' || left(coalesce(p_sabab, ''), 300), versiya = versiya + 1 where id = p_id;
  perform public.t2_audit_yoz(v_komp, 'narx_protokol_bekor', 'narx', null, 'protokol=' || p_id, 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

revoke execute on function public.t2_narx_protokol_yarat_v1(bigint, bigint, jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function public.t2_narx_protokol_tasdiqla_v1(bigint, bigint, bigint, date) from public, anon, authenticated;
revoke execute on function public.t2_narx_protokol_bekor_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.t2_narx_protokol_yarat_v1(bigint, bigint, jsonb, text, uuid) to service_role;
grant execute on function public.t2_narx_protokol_tasdiqla_v1(bigint, bigint, bigint, date) to service_role;
grant execute on function public.t2_narx_protokol_bekor_v1(bigint, bigint, text) to service_role;

commit;
