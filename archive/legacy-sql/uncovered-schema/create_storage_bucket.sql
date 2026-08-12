-- Creates a public storage bucket for blog images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allows public access to read any file in the blog-images bucket
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'blog-images');

-- Allows authenticated users to upload files to the blog-images bucket
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'blog-images');

-- Allows authenticated users to update files in the blog-images bucket
CREATE POLICY "Authenticated users can update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'blog-images');

-- Allows authenticated users to delete files in the blog-images bucket
CREATE POLICY "Authenticated users can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'blog-images');
