-- Disk (A bosqichi): tizim yasagan hujjatlar Diskda Shartnoma -> Obyekt -> Hujjat turi -> Oy ierarxiyasida, aniq nom bilan,
-- BIR hujjat = bitta barqaror kalit (hujjat_kalit): qayta yasalsa/manba o'zgarsa - yangi fayl emas, o'sha hujjatning yangi VERSIYASI.
-- Manba (tur + id) metama'lumotda saqlanadi (B bosqichi: «Tizimda ochish»).
--  * t2_document_registry kengaytiriladi (qator o'chmaydi, eski qatorlar versiya tarixi bo'lib qoladi): manba_turi, manba_id, hujjat_kalit,
--    shartnoma_id, korinish_nom. Versiya raqami = hujjat_kalit ichidagi tartib (id bo'yicha); eng oxirgisi - joriy.
--  * t2_disk_tizim_meta_v1: yuklashdan keyin meta biriktiradi (a'zolik tekshiriladi, shartnoma obyektning faol bog'idan aniqlanadi).
--  * t2_fayl_explorer_v1: shartnoma, nom, manba, versiya/oxirgi maydonlari qo'shildi (mavjud maydonlar o'zgarmadi).
--  * BACKFILL (idempotent, faqat metama'lumot; hech narsa o'chirilmaydi): mavjud qatorlarga kalit/manba/nom beriladi - dublikatlar bitta kalitga tushib
--    versiya bo'lib yig'iladi.
--  * Disk hajmi: kompaniya hajmiga tizim hujjatlari (registry 'stored') ham kiradi - versiyalar ham (E qoidasi: bepul limit, keyin pullik).

alter table public.t2_document_registry add column if not exists manba_turi text;
alter table public.t2_document_registry add column if not exists manba_id bigint;
alter table public.t2_document_registry add column if not exists hujjat_kalit text;
alter table public.t2_document_registry add column if not exists shartnoma_id bigint references public.t2_shartnoma(id);
alter table public.t2_document_registry add column if not exists korinish_nom text;
alter table public.t2_document_registry add constraint t2_document_registry_disk_meta_chk
  check ((manba_turi is null or manba_turi ~ '^[a-z0-9_]{2,40}$') and (hujjat_kalit is null or length(hujjat_kalit) between 3 and 240)
         and (korinish_nom is null or length(korinish_nom) between 1 and 300)) not valid;
create index if not exists t2_document_registry_hujjat_kalit_ix on public.t2_document_registry(kompaniya_id, obyekt_id, hujjat_kalit) where hujjat_kalit is not null;

-- Obyektning faol shartnomasi (bir nechta bo'lsa - eng kichik id; ierarxiyada bitta joy).
create or replace function public._t2_disk_shartnoma_v1(p_kompaniya bigint, p_obyekt bigint)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select b.shartnoma_id from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id and s.kompaniya_id = p_kompaniya
   where b.obyekt_id = p_obyekt and b.holat = 'faol' order by b.shartnoma_id limit 1 $$;

-- Yuklashdan keyin: manba + kalit + nom (+ shartnoma). Faqat shu kompaniyaning a'zosi; hujjat shu kompaniyaniki bo'lishi shart.
create or replace function public.t2_disk_tizim_meta_v1(p_actor_id bigint, p_kompaniya_id bigint, p_document_id bigint,
  p_manba_turi text, p_manba_id bigint, p_hujjat_kalit text, p_shartnoma_id bigint, p_nom text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.t2_document_registry%rowtype; v_tur text := nullif(lower(btrim(coalesce(p_manba_turi, ''))), ''); v_kalit text := nullif(btrim(coalesce(p_hujjat_kalit, '')), '');
  v_nom text := nullif(btrim(coalesce(p_nom, '')), ''); v_sh bigint; v_ver integer; v_jami integer;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into d from public.t2_document_registry where id = p_document_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'HUJJAT_TOPILMADI'); end if;
  if v_tur is not null and v_tur !~ '^[a-z0-9_]{2,40}$' then return jsonb_build_object('ok', false, 'code', 'MANBA_NOTOGRI'); end if;
  if v_kalit is not null and length(v_kalit) not between 3 and 240 then return jsonb_build_object('ok', false, 'code', 'KALIT_NOTOGRI'); end if;
  v_sh := p_shartnoma_id;
  if v_sh is not null and not exists (select 1 from public.t2_shartnoma s where s.id = v_sh and s.kompaniya_id = p_kompaniya_id) then v_sh := null; end if;
  if v_sh is null and d.obyekt_id is not null then v_sh := public._t2_disk_shartnoma_v1(p_kompaniya_id, d.obyekt_id); end if;
  update public.t2_document_registry set
      manba_turi = coalesce(v_tur, manba_turi), manba_id = coalesce(p_manba_id, manba_id), hujjat_kalit = coalesce(v_kalit, hujjat_kalit),
      shartnoma_id = coalesce(v_sh, shartnoma_id), korinish_nom = coalesce(left(v_nom, 300), korinish_nom), updated_at = now()
   where id = d.id returning * into d;
  select count(*) filter (where x.id <= d.id), count(*) into v_ver, v_jami from public.t2_document_registry x
   where d.hujjat_kalit is not null and x.kompaniya_id = d.kompaniya_id and x.obyekt_id is not distinct from d.obyekt_id and x.hujjat_kalit = d.hujjat_kalit
     and x.canonical_storage_status = 'stored';
  return jsonb_build_object('ok', true, 'document_id', d.id, 'versiya', coalesce(nullif(v_ver, 0), 1), 'versiyalar', greatest(v_jami, 1), 'shartnoma_id', d.shartnoma_id);
end $$;

-- Explorer: hozirgi ta'rif (papkalar + o'z joylashuvi) + shartnoma, korinadigan nom, manba, versiya zanjiri. Eski maydonlar o'zgarmadi.
create or replace function public.t2_fayl_explorer_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return jsonb_build_object(
    'ok', true, 'rol', v_rol, 'kompaniya_id', p_kompaniya_id,
    'kompaniya', (select k.nom from public.t2_kompaniya k where k.id = p_kompaniya_id),
    'papkalar', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ota_id', p.ota_id, 'nom', p.nom) order by lower(p.nom))
        from public.t2_fayl_papka p where p.kompaniya_id = p_kompaniya_id), '[]'::jsonb),
    'fayllar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'nom', coalesce(x.j_nom, x.korinish_nom, x.original_filename, 'hujjat-' || x.id),
        'asl_nom', coalesce(x.original_filename, 'hujjat-' || x.id),
        'tur', coalesce(x.document_type, 'hujjat'),
        'versiya', case when x.hujjat_kalit is not null then x.v_tartib else coalesce(x.revision_seq, 1) end,
        'versiyalar', case when x.hujjat_kalit is not null then x.v_jami else 1 end,
        'oxirgi', (x.hujjat_kalit is null or x.v_tartib = x.v_jami),
        'mime', coalesce(x.mime_type, 'application/octet-stream'),
        'hajm', coalesce(x.size_bytes, 0),
        'sha256', x.sha256,
        'sana', coalesce(x.finalized_at, x.created_at),
        'davr', case when x.revision ~ '^\d{4}-\d{2}' then left(x.revision, 7) end,
        'kim', x.created_by,
        'loyiha_id', coalesce(x.loyiha_id, x.o_loyiha_id),
        'loyiha', x.l_nom,
        'obyekt_id', x.obyekt_id,
        'obyekt', x.o_nom,
        'shartnoma_id', x.sh_id,
        'shartnoma', x.sh_raqam,
        'shartnoma_nom', x.sh_nom,
        'manba_turi', x.manba_turi,
        'manba_id', x.manba_id,
        'hujjat_kalit', x.hujjat_kalit,
        'slot', x.source_slot_key,
        'papka_id', x.j_papka,
        'savatda', x.j_savatda
      ) order by coalesce(x.finalized_at, x.created_at) desc, x.id desc)
      from (
        select d.*, o.nom o_nom, o.loyiha_id o_loyiha_id, l.nom l_nom, j.nom j_nom, j.papka_id j_papka, j.savatda j_savatda,
               s.id sh_id, s.raqam sh_raqam, s.nom sh_nom,
               row_number() over (partition by d.kompaniya_id, coalesce(d.obyekt_id, 0), d.hujjat_kalit order by coalesce(d.finalized_at, d.created_at), d.id) v_tartib,
               count(*) over (partition by d.kompaniya_id, coalesce(d.obyekt_id, 0), d.hujjat_kalit) v_jami
          from public.t2_document_registry d
          left join public.t2_obyekt o on o.id = d.obyekt_id and o.kompaniya_id = d.kompaniya_id
          left join public.t2_loyiha l on l.id = coalesce(d.loyiha_id, o.loyiha_id) and l.kompaniya_id = d.kompaniya_id
          left join public.t2_fayl_joy j on j.document_id = d.id and j.kompaniya_id = d.kompaniya_id
          left join public.t2_shartnoma s on s.kompaniya_id = d.kompaniya_id
               and s.id = coalesce(d.shartnoma_id, case when d.obyekt_id is not null then public._t2_disk_shartnoma_v1(d.kompaniya_id, d.obyekt_id) end)
         where d.kompaniya_id = p_kompaniya_id and d.canonical_storage_status = 'stored'
      ) x
    ), '[]'::jsonb));
end $$;

-- Disk hajmi: kompaniyaning tizim hujjatlari (registry 'stored', hamma versiyalar) ham hisobga olinadi.
create or replace function public._t2_hm_kvota_v1(p_kompaniya bigint, p_egasi bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_used bigint; v_lim bigint := public._t2_hm_limit_v1(p_kompaniya); v_chegara bigint; v_ort boolean := false; v_max bigint;
begin
  select coalesce(sum(v.bayt), 0) into v_used from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
   where (p_kompaniya is not null and f.kompaniya_id = p_kompaniya) or (p_kompaniya is null and f.egasi_foydalanuvchi_id = p_egasi);
  if p_kompaniya is not null then
    v_used := v_used + coalesce((select sum(d.size_bytes) from public.t2_document_registry d
                                  where d.kompaniya_id = p_kompaniya and d.canonical_storage_status = 'stored'), 0);
  end if;
  v_chegara := v_lim;
  if p_kompaniya is not null then
    select coalesce(s.ortiqcha, false) into v_ort from public.t2_hm_sozlama s where s.kompaniya_id = p_kompaniya;
    if coalesce(v_ort, false) and public.t2_token_balans(p_kompaniya) > 0 then
      select disk_ortiqcha_max_bayt into v_max from public.t2_token_sozlama where id = 1;
      v_chegara := v_lim + coalesce(v_max, 0);
    end if;
  end if;
  return jsonb_build_object('ishlatilgan', v_used, 'limit', v_lim, 'chegara', v_chegara, 'ortiqcha', coalesce(v_ort, false),
    'foiz', case when v_lim > 0 then round(v_used * 100.0 / v_lim, 1) end);
end $$;

-- ---------------------------------------------------------------- BACKFILL (idempotent; faqat metama'lumot)
-- Kalit: bir hujjat = bir kalit. f2_akt: obyekt + akt raqami (fayl nomi YYYY-MM__RAQAM__...); smeta: obyekt + manba bo'lagi/fayl nomi;
-- nashr: obyekt + sanasiz nom; qolganlar (f2_hujjat, f3, nakopitelniy, ...): obyekt + hisobot oyi.
update public.t2_document_registry d set
    manba_turi = case d.document_type when 'f2_akt' then 'f2_akt' when 'f2_hujjat' then 'f2' when 'f3' then 'forma3' when 'smeta' then 'smeta'
                   when 'smeta_lrv' then 'smeta' when 'smeta_res' then 'smeta' else left(regexp_replace(lower(d.document_type), '[^a-z0-9_]+', '_', 'g'), 40) end,
    hujjat_kalit = left(case
        when d.document_type = 'f2_akt' and d.original_filename ~ '^\d{4}-\d{2}__[^_]' then 'f2_akt:' || coalesce(d.obyekt_id, 0) || ':' || split_part(d.original_filename, '__', 2)
        when d.document_type in ('smeta', 'smeta_lrv', 'smeta_res') then d.document_type || ':' || coalesce(d.obyekt_id, 0) || ':' || coalesce(d.source_slot_key, d.original_filename, d.id::text)
        when d.document_type = 'nashr' then 'nashr:' || coalesce(d.obyekt_id, 0) || ':' || regexp_replace(regexp_replace(coalesce(d.original_filename, d.id::text), '\.[A-Za-z0-9]+$', ''), '[_ -]?\d{4}-\d{2}-\d{2}', '', 'g')
        else d.document_type || ':' || coalesce(d.obyekt_id, 0) || ':' || coalesce(case when d.revision ~ '^\d{4}-\d{2}' then left(d.revision, 7) end, '-')
      end, 240)
  where d.canonical_storage_status = 'stored' and d.hujjat_kalit is null;

-- Ko'rinadigan nom (Latin; '№' = chr(8470), '—' = chr(8212)): turi + raqam/oy + obyekt.
update public.t2_document_registry d set korinish_nom = left(case
      when d.document_type = 'f2_akt' and d.original_filename ~ '^\d{4}-\d{2}__[^_]' then 'F-2 ' || chr(8470) || ltrim(split_part(d.original_filename, '__', 2), '0') || ' ' || chr(8212) || ' ' || coalesce(o.nom, '?') || ' ' || chr(8212) || ' ' || left(d.original_filename, 7)
      when d.document_type = 'f2_hujjat' then 'F-2 ' || chr(8212) || ' ' || coalesce(o.nom, '?') || coalesce(' ' || chr(8212) || ' ' || case when d.revision ~ '^\d{4}-\d{2}' then left(d.revision, 7) end, '')
      when d.document_type = 'f3' then 'Forma ' || chr(8470) || ' 3 ' || chr(8212) || ' ' || coalesce(o.nom, '?') || coalesce(' ' || chr(8212) || ' ' || case when d.revision ~ '^\d{4}-\d{2}' then left(d.revision, 7) end, '')
      when d.document_type in ('nakopitelniy', 'slichitelniy', 'm29', 'aosr') then
        case d.document_type when 'nakopitelniy' then 'Nakopitelniy' when 'slichitelniy' then 'Slichitelniy' when 'm29' then 'M-29' else 'AOSR' end
        || ' ' || chr(8212) || ' ' || coalesce(o.nom, '?') || coalesce(' ' || chr(8212) || ' ' || case when d.revision ~ '^\d{4}-\d{2}' then left(d.revision, 7) end, '')
    end, 300)
  from (select d2.id, ob.nom from public.t2_document_registry d2 left join public.t2_obyekt ob on ob.id = d2.obyekt_id and ob.kompaniya_id = d2.kompaniya_id) o
  where o.id = d.id and d.canonical_storage_status = 'stored' and d.korinish_nom is null and d.document_type in ('f2_akt', 'f2_hujjat', 'f3', 'nakopitelniy', 'slichitelniy', 'm29', 'aosr');

-- Shartnoma: obyektning faol bog'idan (aniq bog' bo'lmasa bo'sh qoladi; explorer ham shunday hisoblaydi).
update public.t2_document_registry d set shartnoma_id = public._t2_disk_shartnoma_v1(d.kompaniya_id, d.obyekt_id)
  where d.shartnoma_id is null and d.obyekt_id is not null and d.canonical_storage_status = 'stored';

do $g$ declare s text; begin
  foreach s in array array['_t2_disk_shartnoma_v1(bigint, bigint)', 't2_disk_tizim_meta_v1(bigint, bigint, bigint, text, bigint, text, bigint, text)',
    't2_fayl_explorer_v1(bigint, bigint)', '_t2_hm_kvota_v1(bigint, bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', s);
    execute format('grant execute on function public.%s to service_role', s);
  end loop;
end $g$;
