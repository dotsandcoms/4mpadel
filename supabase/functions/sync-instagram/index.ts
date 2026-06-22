import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Sync Instagram — Dual mode:
 *   1. Public scrape (no API key needed) — fetches from Instagram's public web endpoints
 *   2. Graph API (requires INSTAGRAM_ACCESS_TOKEN secret) — official, more reliable
 *
 * POST body (all optional):
 *   { "handle": "northvsouthpadel", "mode": "scrape" | "api" | "auto" }
 *   mode defaults to "auto" — tries scrape first, falls back to API if token exists
 */

// ── Public Scrape Logic ───────────────────────────────────────────────────────

async function scrapePublicProfile(username: string): Promise<{
  posts: any[];
  profilePicture: string | null;
}> {
  // Try Instagram's public web API endpoint
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)',
      'X-IG-App-ID': '936619743392459',
      'X-IG-WWW-Claim': '0',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
    },
  });

  if (!response.ok) {
    // Try alternative: fetch the profile page and extract data from embedded JSON
    return await scrapeProfilePage(username);
  }

  const data = await response.json();
  const user = data?.data?.user;

  if (!user) {
    throw new Error('Could not find user data in response');
  }

  const profilePicture = user.profile_pic_url_hd || user.profile_pic_url || null;
  const edges = user.edge_owner_to_timeline_media?.edges || [];

  const posts = edges.map((edge: any) => {
    const node = edge.node;
    const isVideo = node.is_video || node.__typename === 'GraphVideo';
    const isCarousel = node.__typename === 'GraphSidecar';

    // Extract carousel children if available
    let children = null;
    if (isCarousel && node.edge_sidecar_to_children?.edges) {
      children = node.edge_sidecar_to_children.edges.map((child: any) => ({
        id: child.node.id,
        media_type: child.node.is_video ? 'VIDEO' : 'IMAGE',
        media_url: child.node.is_video ? child.node.video_url : child.node.display_url,
      }));
    }

    return {
      id: node.id,
      media_type: isCarousel ? 'CAROUSEL_ALBUM' : isVideo ? 'VIDEO' : 'IMAGE',
      media_url: isVideo ? (node.video_url || node.display_url) : node.display_url,
      thumbnail_url: isVideo ? node.display_url : null,
      permalink: `https://www.instagram.com/p/${node.shortcode}/`,
      caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || null,
      timestamp: node.taken_at_timestamp
        ? new Date(node.taken_at_timestamp * 1000).toISOString()
        : null,
      like_count: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
      comments_count: node.edge_media_to_comment?.count || node.edge_media_preview_comment?.count || 0,
      children,
    };
  });

  return { posts, profilePicture };
}

async function scrapeProfilePage(username: string): Promise<{
  posts: any[];
  profilePicture: string | null;
}> {
  // Fallback: fetch the profile HTML page and look for embedded data
  const response = await fetch(`https://www.instagram.com/${username}/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`Instagram returned ${response.status} for profile page`);
  }

  const html = await response.text();

  // Try to extract JSON data from the page
  // Instagram embeds data in various script tags
  const patterns = [
    /window\._sharedData\s*=\s*({.+?});\s*<\/script>/s,
    /window\.__additionalDataLoaded\s*\([^,]+,\s*({.+?})\)\s*;/s,
    /"user"\s*:\s*({.+?"edge_owner_to_timeline_media".+?})\s*,\s*"logging_page_id"/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        const jsonData = JSON.parse(match[1]);
        const user = jsonData?.entry_data?.ProfilePage?.[0]?.graphql?.user
          || jsonData?.graphql?.user
          || jsonData;

        if (user?.edge_owner_to_timeline_media) {
          const edges = user.edge_owner_to_timeline_media.edges || [];
          const posts = edges.map((edge: any) => {
            const node = edge.node;
            return {
              id: node.id,
              media_type: node.is_video ? 'VIDEO' : (node.__typename === 'GraphSidecar' ? 'CAROUSEL_ALBUM' : 'IMAGE'),
              media_url: node.is_video ? (node.video_url || node.display_url) : node.display_url,
              thumbnail_url: node.is_video ? node.display_url : null,
              permalink: `https://www.instagram.com/p/${node.shortcode}/`,
              caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || null,
              timestamp: node.taken_at_timestamp
                ? new Date(node.taken_at_timestamp * 1000).toISOString()
                : null,
              like_count: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
              comments_count: node.edge_media_to_comment?.count || 0,
              children: null,
            };
          });

          return {
            posts,
            profilePicture: user.profile_pic_url_hd || user.profile_pic_url || null,
          };
        }
      } catch (_) {
        continue;
      }
    }
  }

  throw new Error(
    'Could not extract data from Instagram profile page. Instagram may require login for this profile or has changed their page structure.'
  );
}

// ── Graph API Logic (official, needs token) ───────────────────────────────────

async function fetchViaGraphAPI(accessToken: string): Promise<{
  posts: any[];
  profilePicture: string | null;
}> {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url}';
  const apiUrl = `https://graph.instagram.com/me/media?fields=${fields}&limit=25&access_token=${accessToken}`;

  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Instagram Graph API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const posts = (data.data || []).map((post: any) => ({
    id: post.id,
    media_type: post.media_type || 'IMAGE',
    media_url: post.media_url || null,
    thumbnail_url: post.thumbnail_url || null,
    permalink: post.permalink || null,
    caption: post.caption || null,
    timestamp: post.timestamp || null,
    like_count: post.like_count || 0,
    comments_count: post.comments_count || 0,
    children: post.children?.data || null,
  }));

  // Fetch profile picture
  let profilePicture = null;
  try {
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${accessToken}`
    );
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      profilePicture = profileData.profile_picture_url || null;
    }
  } catch (_) {
    // Non-critical
  }

  return { posts, profilePicture };
}

// ── Main Handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Image Proxy Route ──
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const proxyUrl = url.searchParams.get('proxyUrl');
      
      if (proxyUrl) {
        const response = await fetch(proxyUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          }
        });

        // Copy original headers but override the ones causing hotlink blocking
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.delete('Cross-Origin-Resource-Policy');
        newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
        
        return new Response(response.body, {
          status: response.status,
          headers: newHeaders
        });
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse body
    let handle: string | null = null;
    let mode: string = 'auto'; // 'scrape' | 'api' | 'auto'
    try {
      const body = await req.json();
      handle = body.handle || null;
      mode = body.mode || 'auto';
    } catch (_) {
      // No body
    }

    // Fetch feeds to sync
    let feedQuery = supabase.from('instagram_feeds').select('*');
    if (handle) {
      feedQuery = feedQuery.eq('instagram_handle', handle);
    }
    let { data: feeds, error: feedError } = await feedQuery;

    if (feedError) throw feedError;

    // Auto-create feed if specific handle requested but doesn't exist
    if (handle && (!feeds || feeds.length === 0)) {
      const { data: newFeed, error: insertError } = await supabase
        .from('instagram_feeds')
        .insert([{ 
          instagram_handle: handle,
          profile_url: `https://www.instagram.com/${handle}/`
        }])
        .select()
        .single();
        
      if (!insertError && newFeed) {
        feeds = [newFeed];
      }
    }

    if (!feeds || feeds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No feeds configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const results: any[] = [];

    for (const feed of feeds) {
      const tokenName = feed.access_token_name || 'INSTAGRAM_ACCESS_TOKEN';
      const accessToken = Deno.env.get(tokenName);
      let fetchResult: { posts: any[]; profilePicture: string | null } | null = null;
      let usedMethod = '';

      try {
        // ── Mode selection ──
        if (mode === 'api' && accessToken) {
          // Force Graph API
          fetchResult = await fetchViaGraphAPI(accessToken);
          usedMethod = 'graph_api';

        } else if (mode === 'scrape') {
          // Force public scrape
          fetchResult = await scrapePublicProfile(feed.instagram_handle);
          usedMethod = 'public_scrape';

        } else {
          // Auto: try scrape first (no token needed), fall back to API
          try {
            fetchResult = await scrapePublicProfile(feed.instagram_handle);
            usedMethod = 'public_scrape';
          } catch (scrapeErr: any) {
            console.warn(`Scrape failed for @${feed.instagram_handle}: ${scrapeErr.message}. Trying Graph API...`);

            if (accessToken) {
              fetchResult = await fetchViaGraphAPI(accessToken);
              usedMethod = 'graph_api';
            } else {
              throw new Error(
                `Public scrape failed (${scrapeErr.message}) and no INSTAGRAM_ACCESS_TOKEN is configured. ` +
                `Either set the token in Edge Function secrets, or try again later.`
              );
            }
          }
        }

        if (!fetchResult || fetchResult.posts.length === 0) {
          results.push({
            handle: feed.instagram_handle,
            status: 'success',
            method: usedMethod,
            posts_synced: 0,
            message: 'No posts returned'
          });
          continue;
        }

        // Update profile picture if we got one
        if (fetchResult.profilePicture) {
          await supabase
            .from('instagram_feeds')
            .update({ profile_picture_url: fetchResult.profilePicture })
            .eq('id', feed.id);
        }

        // Upsert posts
        const upsertData = fetchResult.posts.map((post: any) => ({
          id: post.id,
          feed_id: feed.id,
          media_type: post.media_type || 'IMAGE',
          media_url: post.media_url || null,
          thumbnail_url: post.thumbnail_url || null,
          permalink: post.permalink || null,
          caption: post.caption || null,
          timestamp: post.timestamp || null,
          like_count: post.like_count || 0,
          comments_count: post.comments_count || 0,
          children: post.children || null,
          is_visible: true,
        }));

        const { error: upsertError } = await supabase
          .from('instagram_posts')
          .upsert(upsertData, { onConflict: 'id' });

        if (upsertError) throw upsertError;

        // Update last_synced_at
        await supabase
          .from('instagram_feeds')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', feed.id);

        results.push({
          handle: feed.instagram_handle,
          status: 'success',
          method: usedMethod,
          posts_synced: fetchResult.posts.length,
        });

      } catch (err: any) {
        console.error(`Error syncing @${feed.instagram_handle}:`, err.message);
        results.push({
          handle: feed.instagram_handle,
          status: 'error',
          error: err.message,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('sync-instagram error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
