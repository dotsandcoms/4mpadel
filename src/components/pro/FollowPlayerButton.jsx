import React from 'react';
import { Check, Plus, Heart } from 'lucide-react';

export default function FollowPlayerButton({ player, follows, onSignIn, iconOnly = false }) {
  const following = follows.isFollowing(player.id);
  if (iconOnly) return <button type="button" className="pro-follow-heart" aria-label={`${following ? 'Unfollow' : 'Follow'} ${player.name}`} title={following ? 'Unfollow player' : 'Follow player'} aria-pressed={following} aria-busy={follows.isPending(player.id)} disabled={follows.loading || follows.isPending(player.id) || Boolean(follows.error)} onClick={() => follows.signedIn ? follows.toggle(player) : onSignIn()}>
    <Heart size={20} fill={following ? 'currentColor' : 'none'} aria-hidden="true" />
  </button>;
  return <button className={`pro-button pro-follow-button ${following ? 'is-following' : ''}`} aria-pressed={following} disabled={follows.loading || follows.isPending(player.id) || Boolean(follows.error)} onClick={() => follows.signedIn ? follows.toggle(player) : onSignIn()}>
    {following ? <Check size={16} /> : <Plus size={16} />}
    {follows.isPending(player.id) ? 'Saving…' : following ? 'Following' : 'Follow player'}
    <span className="sr-only"> {player.name}</span>
  </button>;
}
