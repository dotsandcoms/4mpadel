import React from 'react';
import { Heart } from 'lucide-react';

export default function FollowingHeart({ following, size = 14 }) {
  if (!following) return null;
  return <span className="pro-followed-heart" title="Following"><Heart size={size} fill="currentColor" aria-hidden="true" /><span className="sr-only">Following</span></span>;
}
