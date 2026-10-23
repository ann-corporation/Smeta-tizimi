-- 20261106860000 — «Davom ettiriladigan F2 lar» ro'yxati (egasi P0 UX, 2026-10-24: «har birini raqamini qayerdan eslab qolaman»).
-- Kompaniya (ixtiyoriy obyekt) bo'yicha F2 V3 server ish qoralamalari: akt №, oy, fayl, varaq, ✓/◐/✕ soni, oxirgi o'zgarish,
-- kim yaratgan; yozilgan (akt yaratilgan: t2_akt.operation_id = cursor.writeOperationId) qoralamalar «yozilgan» belgisi bilan.
-- Faqat o'qish (STABLE), a'zolik + f2.read ichida. Job id foydalanuvchiga raqam sifatida kiritilishi shart emas.
begin;

create or replace function public.t2_f2_import_job_royxat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');

  select coalesce(jsonb_agg(x order by x->>'yozilgan', x->>'obyekt_nom', x->>'yangilandi' desc), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'job_id', j.id, 'obyekt_id', j.obyekt_id, 'obyekt_nom', o.nom,
      'raqam', nullif(j.cursor->>'aktRaqam', ''), 'oy', j.cursor->>'month', 'fayl', j.cursor->>'file',
      'akt_idx', case when (j.cursor->>'actIdx') ~ '^\d+$' then (j.cursor->>'actIdx')::int end,
      'status', j.status, 'jami', coalesce(j.total_rows, 0),
      'aniq', coalesce(s.aniq, 0), 'taklif', coalesce(s.taklif, 0), 'topilmadi', coalesce(s.topilmadi, 0), 'otkaz', coalesce(s.otkaz, 0),
      'yangilandi', j.updated_at, 'yaratildi', j.started_at, 'kim', coalesce(nullif(u.ism, ''), u.login),
      'yozilgan', a.id is not null, 'akt_id', a.id, 'akt_holat', a.holat
    ) x
    from public.t2_f2_import_job j
    join public.t2_obyekt o on o.id = j.obyekt_id
    left join public.t2_foydalanuvchi u on u.id = j.actor_id
    left join lateral (
      select count(*) filter (where d.holat <> 'otkazib_yuborildi' and d.sabab ~ '^\s*\{' and (d.sabab::jsonb)->>'holat' in ('aniq', 'xotira', 'qolda')) aniq,
             count(*) filter (where d.holat <> 'otkazib_yuborildi' and d.sabab ~ '^\s*\{' and (d.sabab::jsonb)->>'holat' = 'taklif') taklif,
             count(*) filter (where d.holat <> 'otkazib_yuborildi' and not (d.sabab ~ '^\s*\{' and (d.sabab::jsonb)->>'holat' in ('aniq', 'xotira', 'qolda', 'taklif'))) topilmadi,
             count(*) filter (where d.holat = 'otkazib_yuborildi') otkaz
        from public.t2_f2_import_draft_qator d where d.job_id = j.id
    ) s on true
    left join lateral (
      select k.id, k.holat from public.t2_akt k
       where k.kompaniya_id = j.kompaniya_id and k.obyekt_id = j.obyekt_id and k.holat <> 'bekor'
         and (j.cursor->>'writeOperationId') ~* '^[0-9a-f-]{36}$' and k.operation_id = (j.cursor->>'writeOperationId')::uuid
       limit 1
    ) a on true
    where j.kompaniya_id = p_kompaniya_id
      and (p_obyekt_id is null or j.obyekt_id = p_obyekt_id)
      and j.cursor->>'phase' = 'f2_v3_review'
      and j.status not in ('cancelled', 'failed')
  ) q;

  return jsonb_build_object('ok', true, 'qatorlar', v);
end $function$;

revoke all on function public.t2_f2_import_job_royxat_v1(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_f2_import_job_royxat_v1(bigint, bigint, bigint) to service_role;

commit;
