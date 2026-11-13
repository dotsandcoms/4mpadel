import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useHelpAccount() {
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    let active = true, changed = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { changed = true; if (active) setOwner(session?.user.id || null); });
    void supabase.auth.getSession().then(({ data }) => { if (active && !changed) setOwner(data.session?.user.id || null); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return owner;
}
