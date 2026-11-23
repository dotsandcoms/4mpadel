import { useState } from 'react';
export default function EventPlayerAvatar({ player, name }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const src = player?.image_url;
  return <span className="ap-avatar ap-event-avatar">{src && src !== failedSrc ? <img src={src} alt={name || player.name || 'Player'} loading="lazy" onError={() => setFailedSrc(src)} /> : String(name || player?.name || '?').slice(0, 1)}</span>;
}
