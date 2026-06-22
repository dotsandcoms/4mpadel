import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const handle = '4m_padel';
  console.log(`Scraping ${handle} locally...`);
  
  try {
    const res = await fetch(`https://www.instagram.com/${handle}/?__a=1&__d=dis`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    if (!res.ok) {
      console.error(`Failed to scrape: ${res.status}`);
      process.exit(1);
    }
    
    const data = await res.json();
    const user = data?.graphql?.user || data?.user;
    
    if (!user) {
      console.error("Could not find user data in response");
      process.exit(1);
    }
    
    const profilePicture = user.profile_pic_url_hd || user.profile_pic_url;
    
    // Upsert feed
    const { data: feed, error: feedError } = await supabase
      .from('instagram_feeds')
      .upsert({
        instagram_handle: handle,
        profile_url: `https://www.instagram.com/${handle}/`,
        profile_picture_url: profilePicture,
        updated_at: new Date().toISOString()
      }, { onConflict: 'instagram_handle' })
      .select()
      .single();
      
    if (feedError) throw feedError;
    
    const edges = user.edge_owner_to_timeline_media?.edges || [];
    const posts = edges.map(edge => {
      const node = edge.node;
      const mediaType = node.is_video ? 'VIDEO' : (node.edge_sidecar_to_children ? 'CAROUSEL_ALBUM' : 'IMAGE');
      
      let children = null;
      if (mediaType === 'CAROUSEL_ALBUM' && node.edge_sidecar_to_children?.edges) {
        children = node.edge_sidecar_to_children.edges.map(childEdge => ({
          media_type: childEdge.node.is_video ? 'VIDEO' : 'IMAGE',
          media_url: childEdge.node.video_url || childEdge.node.display_url
        }));
      }
      
      return {
        feed_id: feed.id,
        instagram_id: node.id,
        media_url: node.video_url || node.display_url,
        thumbnail_url: node.is_video ? node.display_url : null,
        permalink: `https://instagram.com/p/${node.shortcode}/`,
        caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
        media_type: mediaType,
        published_at: new Date(node.taken_at_timestamp * 1000).toISOString(),
        children
      };
    });
    
    if (posts.length > 0) {
      const { error: postsError } = await supabase
        .from('instagram_posts')
        .upsert(posts, { onConflict: 'instagram_id' });
        
      if (postsError) throw postsError;
      console.log(`Successfully synced ${posts.length} posts for ${handle}!`);
    } else {
      console.log('No posts found.');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
