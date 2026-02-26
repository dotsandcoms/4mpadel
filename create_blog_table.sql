-- Create the blogs table
CREATE TABLE blogs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'Draft',
  views INTEGER DEFAULT 0,
  image_url TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;

-- Allow public read access to published blogs
CREATE POLICY "Public can view published blogs"
ON blogs FOR SELECT
TO anon, authenticated
USING (status = 'Published');

-- Allow authenticated users to manage all blogs
CREATE POLICY "Admins can manage blogs"
ON blogs FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
