-- Resolve explicit feeder links, including empty loser paths from genuine byes.
CREATE OR REPLACE FUNCTION public.resolve_draw_routes(p_draw_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE m record; f record; slot integer; all_known boolean; v uuid; one_id uuid; two_id uuid; changed boolean; pass integer;
BEGIN
    IF NOT COALESCE(public.can_manage_native_draw((SELECT event_id FROM public.draws WHERE id=p_draw_id)),false) THEN RAISE EXCEPTION 'You cannot manage this draw'; END IF;
    PERFORM 1 FROM public.draws WHERE id=p_draw_id FOR UPDATE;
    FOR pass IN 1..(SELECT count(*) FROM public.draw_matches WHERE draw_id=p_draw_id) LOOP
        changed:=false;
        FOR m IN SELECT * FROM public.draw_matches WHERE draw_id=p_draw_id AND status IN ('pending','scheduled') ORDER BY round_number,bracket_position LOOP
            all_known:=true; one_id:=m.entry_one_id; two_id:=m.entry_two_id;
            FOR slot IN 1..2 LOOP
                SELECT d.*, CASE WHEN d.winner_to_match_id=m.id AND d.winner_to_slot=slot THEN d.winner_entry_id ELSE d.loser_entry_id END AS outcome INTO f FROM public.draw_matches d
                WHERE (d.winner_to_match_id=m.id AND d.winner_to_slot=slot) OR (d.loser_to_match_id=m.id AND d.loser_to_slot=slot) LIMIT 1;
                IF FOUND THEN
                    IF f.status IN ('completed','walkover','retired','cancelled') THEN
                        v:=f.outcome; IF slot=1 THEN one_id:=v; ELSE two_id:=v; END IF;
                    ELSE all_known:=false; END IF;
                ELSIF (slot=1 AND one_id IS NULL) OR (slot=2 AND two_id IS NULL) THEN all_known:=false;
                END IF;
            END LOOP;
            IF one_id IS DISTINCT FROM m.entry_one_id OR two_id IS DISTINCT FROM m.entry_two_id OR (all_known AND (one_id IS NULL OR two_id IS NULL)) THEN
                UPDATE public.draw_matches SET entry_one_id=one_id,entry_two_id=two_id,
                    winner_entry_id=CASE WHEN all_known AND (one_id IS NULL OR two_id IS NULL) THEN COALESCE(one_id,two_id) ELSE winner_entry_id END,
                    status=CASE WHEN all_known AND one_id IS NULL AND two_id IS NULL THEN 'cancelled' WHEN all_known AND (one_id IS NULL OR two_id IS NULL) THEN 'walkover' ELSE status END,
                    result_type=CASE WHEN all_known AND one_id IS NULL AND two_id IS NULL THEN 'cancelled' WHEN all_known AND (one_id IS NULL OR two_id IS NULL) THEN 'walkover' ELSE result_type END,
                    updated_at=clock_timestamp() WHERE id=m.id;
                changed:=true;
            END IF;
        END LOOP;
        EXIT WHEN NOT changed;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_draw_routes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_draw_routes(uuid) TO authenticated;
