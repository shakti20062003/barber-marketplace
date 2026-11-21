-- Demo data cleanup: the seed used to give every demo stylist a fixed
-- 09:00–20:00 shift (Mon–Sat). Stylist shifts override salon hours, and
-- owners have no UI to edit them, so salons that extend their hours (e.g.
-- till 23:00) never got late slots. Nothing in the app creates these rows;
-- only the seed did. Delete exactly that seeded pattern so stylists follow
-- the salon's own (owner-editable) hours.
DELETE FROM "staff_availability"
WHERE "startTime" = '09:00' AND "endTime" = '20:00' AND "dayOfWeek" BETWEEN 1 AND 6;
