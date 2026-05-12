import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

serve(async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get('type'); // 'event' or 'album'
  const slug = url.searchParams.get('slug');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let title = "4M Padel";
  let description = "For the Players";
  let image = "https://uzglrpbixubfijvjbtgz.supabase.co/storage/v1/object/public/public_assets/og-default.png";
  let redirectUrl = "https://4mpadel.co.za";

  try {
    if (type === 'event' && slug) {
      const { data: event } = await supabase
        .from('calendar')
        .select('event_name, event_dates, venue, custom_image_url, image_url')
        .eq('slug', slug)
        .single();

      if (event) {
        title = `${event.event_name} | 4M Padel`;
        description = `${event.event_dates} at ${event.venue}. View draws, results, and registration info on 4M Padel.`;
        image = event.custom_image_url || event.image_url || image;
        redirectUrl = `https://4mpadel.co.za/calendar/${slug}`;
      }
    } else if (type === 'album' && slug) {
        // Try slug first, then fallback to ID if it's a UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
        let query = supabase.from('albums').select('id, title, description');
        
        if (isUUID) {
            query = query.or(`slug.eq.${slug},id.eq.${slug}`);
        } else {
            query = query.eq('slug', slug);
        }

        const { data: album } = await query.single();

      if (album) {
        title = `${album.title} | 4M Padel Gallery`;
        description = album.description || "View official tournament action shots and media highlights on 4M Padel.";
        redirectUrl = `https://4mpadel.co.za/gallery/${slug}`;

        // Get first image for the album
        const { data: images } = await supabase
          .from('gallery_images')
          .select('image_url')
          .eq('album_id', album.id)
          .order('sort_order', { ascending: true })
          .limit(1);

        if (images && images.length > 0) {
          image = images[0].image_url;
        }
      }
    }
  } catch (err) {
    console.error("SEO Preview Error:", err);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Primary Meta Tags -->
    <title>${title}</title>
    <meta name="title" content="${title}">
    <meta name="description" content="${description}">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${redirectUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${redirectUrl}">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${image}">

    <!-- Redirect for humans -->
    <meta http-equiv="refresh" content="0; url=${redirectUrl}">
    <script>window.location.href = "${redirectUrl}";</script>
</head>
<body>
    <p>Redirecting to <a href="${redirectUrl}">${title}</a>...</p>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
})
