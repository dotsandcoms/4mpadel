-- Creates a function to securely increment the views field on a blog post

CREATE OR REPLACE FUNCTION increment_blog_views(blog_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE blogs
  SET views = views + 1
  WHERE id = blog_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
