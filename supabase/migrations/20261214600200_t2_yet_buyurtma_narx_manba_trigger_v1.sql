-- YETKAZUVCHI TOMONI: g'olib/shartnoma narxi buyurtma YARATILGANDA narx manbasiga tushadi (egasi 2026-11-12: narx = max(smeta, xarid/shartnoma), QQS siz).
-- Avval (20261214600100) manba faqat QABUL paytida yozilardi. Endi buyurtma (tender g'olibi yoki to'g'ridan-to'g'ri) yaratilgan zahoti:
--   t2_buyurtma AFTER INSERT (DEFERRABLE INITIALLY DEFERRED constraint trigger) -> tranzaksiya oxirida (qatorlar yozilgach) manba yoziladi.
-- Qabulda (t2_buyurtma_qabul_yakunla_v1) manba QAYTA yozilmaydi: ikkala yo'l bir xil operation_id (md5 'yet_narx_manba:'||buyurtma_id) ishlatadi -> idempotent,
-- qabul faqat «tasdiqlaydi» (manba bor bo'lsa takror). Yetkazilgan narx buyurtma narxidan farq qilsa - qo'lda tuzatish (narx manbalari sahifasi).
-- Trigger xato bermaydi (exception -> NULL): narx manbasi yozilmasa buyurtma/tender baribir saqlanadi. Hajm: ~1 KB / buyurtma. Jadval/ustun yo'q.
create or replace function public._t2_yet_narx_manba_yoz(p_kompaniya_id bigint, p_buyurtma_id bigint, p_kim text)
returns bigint language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_b public.t2_buyurtma; v_ijrochi text; v_mq jsonb; v_r jsonb;
begin
  select * into v_b from public.t2_buyurtma where id = p_buyurtma_id and kompaniya_id = p_kompaniya_id;
  if not found or v_b.tur <> 'material' then return null; end if;
  select nom into v_ijrochi from public.t2_kompaniya where id = v_b.ijrochi_kompaniya_id;
  select coalesce(jsonb_agg(jsonb_build_object('kod', q.resurs_kodi, 'nom', q.nom, 'birlik', q.birlik, 'narx', q.narx) order by q.qator_no), '[]'::jsonb)
    into v_mq from public.t2_buyurtma_qator q where q.buyurtma_id = v_b.id and q.narx is not null;
  if jsonb_array_length(v_mq) = 0 then return null; end if;           -- narxsiz buyurtma manba bo'lmaydi (NULL != 0)
  v_r := public.t2_narx_manba_yoz_v1(p_kompaniya_id,
    jsonb_build_object('tur', 'kp', 'nom', left('Buyurtma #' || v_b.id::text || coalesce(' - ' || v_ijrochi, ''), 200), 'raqam', 'buyurtma #' || v_b.id::text,
                       'sana', current_date::text, 'yetkazuvchi', v_ijrochi, 'nds_holati', 'nds_siz',
                       'izoh', 'Yetkazuvchi taklifi (buyurtma #' || v_b.id::text || '): xarid narxi, QQS siz'),
    v_mq, 'almashtir', null, null, md5('yet_narx_manba:' || v_b.id::text)::uuid, p_kim);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return null; end if;
  return (v_r->>'id')::bigint;
exception when others then
  return null;
end $fn$;
revoke all on function public._t2_yet_narx_manba_yoz(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public._t2_yet_narx_manba_yoz(bigint, bigint, text) to service_role;

create or replace function public._t2_yet_narx_manba_trg() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
begin
  perform public._t2_yet_narx_manba_yoz(new.kompaniya_id, new.id, 'actor:' || new.yaratdi_actor_id::text);
  return null;
end $fn$;
revoke all on function public._t2_yet_narx_manba_trg() from public, anon, authenticated;

drop trigger if exists t2_buyurtma_narx_manba_trg on public.t2_buyurtma;
create constraint trigger t2_buyurtma_narx_manba_trg after insert on public.t2_buyurtma
  deferrable initially deferred for each row execute function public._t2_yet_narx_manba_trg();
