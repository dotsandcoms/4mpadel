import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

export default async function handler(req, res) {
  // Set headers to serve HTML to crawlers
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

  const { type, slug } = req.query;

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
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
      let queryBuilder = supabase.from('albums').select('id, title, description');
      
      if (isUUID) {
        queryBuilder = queryBuilder.or(`slug.eq.${slug},id.eq.${slug}`);
      } else {
        queryBuilder = queryBuilder.eq('slug', slug);
      }

      const { data: album } = await queryBuilder.single();

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
    } else if (req.query.path) {
      const pathValue = req.query.path;
      const segments = Array.isArray(pathValue) ? pathValue : pathValue.split('/').filter(Boolean);
      const rootPath = segments[0] || '';
      
      const { id } = req.query;
      
      const queryString = req.url.split('?')[1] || '';
      const searchParams = new URLSearchParams(queryString);
      searchParams.delete('path');
      const searchStr = searchParams.toString();
      redirectUrl = `https://4mpadel.co.za/${segments.join('/')}${searchStr ? '?' + searchStr : ''}`;

      switch (rootPath) {
        case 'players':
          if (id) {
            const { data: player } = await supabase
              .from('players')
              .select('name, category, skill_rating, image_url')
              .eq('id', id)
              .single();
            if (player) {
              title = `${player.name} | 4M Padel Players`;
              description = `Division: ${player.category || 'Open'} | Skill: ${player.skill_rating || '-'}`;
              if (player.image_url) image = player.image_url;
            } else {
              title = "Players | 4M Padel";
              description = "Meet the elite talent driving the sport forward.";
            }
          } else {
            title = "Players | 4M Padel";
            description = "Meet the elite talent driving the sport forward. From rising tournament stars to seasoned champions.";
          }
          break;
        case 'rankings':
          title = "Rankings | 4M Padel";
          description = "Official 4M Padel rankings and standings.";
          break;
        case 'calendar':
          title = "Tournament Calendar | 4M Padel";
          description = "Upcoming Padel tournaments and events at 4M Padel.";
          break;
        case 'gallery':
          title = "Gallery | 4M Padel";
          description = "Official tournament action shots and media highlights.";
          break;
        case 'blog':
          if (segments[1]) {
             const { data: post } = await supabase
               .from('blog_posts')
               .select('title, excerpt, cover_image')
               .eq('slug', segments[1])
               .single();
             if (post) {
               title = `${post.title} | 4M Padel`;
               description = post.excerpt || description;
               if (post.cover_image) image = post.cover_image;
             }
          } else {
             title = "Blog | 4M Padel";
             description = "Latest news, updates, and articles from 4M Padel.";
          }
          break;
        case 'academy':
          if (segments[1] === 'coaches') {
            title = "Approved Coaches | 4M Padel Academy";
            description = "Find and connect with approved Padel coaches.";
          } else if (segments[1] === 'videos') {
            title = "Coaching Videos | 4M Padel Academy";
            description = "Improve your game with our library of Padel coaching videos.";
          } else {
            title = "Academy | 4M Padel";
          }
          break;
        case 'tournaments':
          title = "Tournaments | 4M Padel";
          description = "Join and compete in 4M Padel tournaments.";
          break;
        case 'contact':
          title = "Contact Us | 4M Padel";
          description = "Get in touch with the 4M Padel team.";
          break;
        case 'profile':
          title = "Player Profile | 4M Padel";
          description = "View player statistics and match history.";
          break;
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

  return res.status(200).send(html);
}
