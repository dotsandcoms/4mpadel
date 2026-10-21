-- Explicitly qualify the outer Storage path in correlated player queries.
-- Numeric folders contain player profile/gallery photos. Other prefixes are
-- existing registration, event sponsor, club and organisation upload flows.
ALTER POLICY "User Upload Own Folder" ON storage.objects TO authenticated
WITH CHECK (
  bucket_id = 'profile-pics' AND (
    public.is_super_admin((SELECT auth.jwt()->>'email'))
    OR (
      owner_id = (SELECT auth.uid())::text
      AND (
        split_part(objects.name, '/', 1) !~ '^[0-9]+$'
        OR EXISTS (
          SELECT 1 FROM public.players p
          WHERE p.id::text = split_part(objects.name, '/', 1)
            AND lower(p.email) = lower((SELECT auth.jwt()->>'email'))
        )
      )
    )
  )
);

ALTER POLICY "User Manage Own Folder" ON storage.objects TO authenticated
USING (
  bucket_id = 'profile-pics' AND (
    public.is_super_admin((SELECT auth.jwt()->>'email'))
    OR (
      split_part(objects.name, '/', 1) ~ '^[0-9]+$'
      AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id::text = split_part(objects.name, '/', 1)
          AND lower(p.email) = lower((SELECT auth.jwt()->>'email'))
      )
    )
    OR (
      split_part(objects.name, '/', 1) !~ '^[0-9]+$'
      AND owner_id = (SELECT auth.uid())::text
    )
  )
)
WITH CHECK (
  bucket_id = 'profile-pics' AND (
    public.is_super_admin((SELECT auth.jwt()->>'email'))
    OR (
      owner_id = (SELECT auth.uid())::text
      AND (
        split_part(objects.name, '/', 1) !~ '^[0-9]+$'
        OR EXISTS (
          SELECT 1 FROM public.players p
          WHERE p.id::text = split_part(objects.name, '/', 1)
            AND lower(p.email) = lower((SELECT auth.jwt()->>'email'))
        )
      )
    )
  )
);
