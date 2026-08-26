-- Bring single legacy draw notices into the announcement centre. Safe to run
-- more than once: an equivalent draw-scoped legacy message is inserted once.

INSERT INTO public.native_draw_announcements (
    event_id,
    division_id,
    draw_id,
    message,
    is_pinned,
    created_at,
    updated_at
)
SELECT
    d.event_id,
    d.division_id,
    d.id,
    d.public_announcement,
    true,
    COALESCE(d.announcement_updated_at, d.generated_at, now()),
    COALESCE(d.announcement_updated_at, d.generated_at, now())
FROM public.draws d
WHERE NULLIF(btrim(d.public_announcement), '') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.native_draw_announcements a
      WHERE a.draw_id = d.id
        AND a.message = d.public_announcement
  );
