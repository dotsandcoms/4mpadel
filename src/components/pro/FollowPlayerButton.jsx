import React from 'react';
import { Check, Plus } from 'lucide-react';

export default function FollowPlayerButton({ player, follows, onSignIn }) {
  const following = follows.isFollowing(player.id);
  return <button className={`pro-button pro-follow-button ${following ? 'is-following' : ''}`} aria-pressed={following} disabled={follows.loading || follows.isPending(player.id) || Boolean(follows.error)} onClick={() => follows.signedIn ? follows.toggle(player) : onSignIn()}>
    {following ? <Check size={16} /> : <Plus size={16} />}
    {follows.isPending(player.id) ? 'Saving…' : following ? 'Following' : 'Follow player'}
    <span className="sr-only"> {player.name}</span>
  </button>;
}
