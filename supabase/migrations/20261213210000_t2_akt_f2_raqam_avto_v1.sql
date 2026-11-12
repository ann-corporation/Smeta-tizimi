-- F2 raqami qoralama yaratilganda server tomonida ketma-ket beriladi (audit 105: «N° —»).
-- Qoida: shu obyektdagi bekor qilinmagan F2 lar orasida eng katta BUTUN raqam + 1. Raqam allaqachon berilgan bo'lsa tegilmaydi
-- (F2 tayyorlash/import oldindan to'ldiradi, qo'lda yozilgan raqam saqlanadi). Mavjud yozuvlar o'zgarmaydi.
-- Yangi funksiya + BEFORE INSERT trigger; mavjud t2_akt_yarat_* funksiyalariga tegilmaydi.

create or replace function public.t2_akt_f2_raqam_avto_v1() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_max bigint;
begin
  if new.tur = 'f2' and new.obyekt_id is not null and (new.raqam is null or btrim(new.raqam) = '') then
    perform pg_advisory_xact_lock(hashtextextended('t2_akt_f2_raqam:' || new.obyekt_id, 0));
    select coalesce(max(a.raqam::bigint), 0) into v_max
      from public.t2_akt a
     where a.obyekt_id = new.obyekt_id and a.tur = 'f2' and a.holat <> 'bekor' and a.raqam ~ '^[0-9]{1,9}$';
    new.raqam := (v_max + 1)::text;
  end if;
  return new;
end $$;

revoke all on function public.t2_akt_f2_raqam_avto_v1() from public, anon, authenticated;

drop trigger if exists t2_akt_f2_raqam_avto on public.t2_akt;
create trigger t2_akt_f2_raqam_avto before insert on public.t2_akt
  for each row execute function public.t2_akt_f2_raqam_avto_v1();
