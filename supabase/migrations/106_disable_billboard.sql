-- 104_disable_billboard.sql
-- Temporarily retire the Billboard cosmetic. Image upload/management isn't ready,
-- so pull it from the shop (is_active = false). Existing billboards keep
-- rendering in the city (owners' data is untouched); it just can't be bought.
-- The Fortnite "vaulting" model: hidden, never deleted.

update items set is_active = false where id = 'billboard';
