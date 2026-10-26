-- Disposable local fixture only, follows fixture.sql and apply.sql.
CREATE TABLE public.players(id bigint PRIMARY KEY,email text);
ALTER TABLE public.clubs ADD COLUMN approved_at timestamptz;
CREATE TABLE public.club_claim_requests(id uuid PRIMARY KEY,club_id uuid NOT NULL,requester_email text,requester_player_id bigint,status text,reviewed_at timestamptz,reviewed_by uuid,rejection_notes text);
CREATE TABLE public.club_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid,player_id bigint,user_email text,role text,UNIQUE(club_id,user_email));
INSERT INTO public.players VALUES(1,'claimant@example.invalid'),(2,'someone-else@example.invalid');
INSERT INTO public.clubs(id,name,status,verified) VALUES('20000000-0000-0000-0000-000000000002','Claim club','unclaimed',false);
INSERT INTO public.club_claim_requests VALUES
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','claimant@example.invalid',1,'pending',null,null,null),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','claimant@example.invalid',2,'pending',null,null,null),
  ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','rejected@example.invalid',null,'pending',null,null,null);
