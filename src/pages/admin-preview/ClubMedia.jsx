import React, { useState } from 'react';
import { recordedText, safeClubWebsite } from './clubDetailsData.js';

function ClubImage({ url, label, logo = false }) {
  const [failed, setFailed] = useState(false);
  const safe = safeClubWebsite(url);
  return safe && !failed ? <img className={logo ? 'clubs-sponsor-logo' : 'clubs-gallery-image'} src={safe} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <div className="clubs-image-fallback">{logo ? 'No logo' : 'Image unavailable'}</div>;
}
function Sponsor({ sponsor, principal = false }) {
  const url = safeClubWebsite(sponsor?.url);
  return <article className="clubs-sponsor">
    {sponsor?.logo_url && <ClubImage key={String(sponsor.logo_url)} url={sponsor.logo_url} label={`${recordedText(sponsor?.name)} logo`} logo/>}
    <div><h4>{recordedText(sponsor?.name)}</h4><p>{principal ? 'Principal sponsor' : recordedText(sponsor?.tier)}</p>{url && <a className="fo-type-link" href={url} target="_blank" rel="noopener noreferrer">Visit sponsor ↗</a>}</div>
  </article>;
}
export default function ClubMedia({ data }) {
  const [page, setPage] = useState(1);
  const gallery = Array.isArray(data.gallery) ? data.gallery : [];
  const sponsors = Array.isArray(data.sponsors) ? data.sponsors : [];
  const principal = data.principal_sponsor && typeof data.principal_sponsor === 'object' && !Array.isArray(data.principal_sponsor) ? data.principal_sponsor : null;
  const pages = Math.max(1, Math.ceil(gallery.length / 6)), current = Math.min(page, pages);
  return <>
    <section><h3>Social & booking links</h3><ul className="clubs-socials">{[['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['playtomic', 'Playtomic']].map(([key, label]) => {
      const value = data.socials?.[key], url = safeClubWebsite(value);
      return <li key={key}>{url ? <a className="fo-type-link" href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a> : <span>{label}: {value ? 'No valid website recorded' : 'Not recorded'}</span>}</li>;
    })}</ul></section>
    <section><h3>Sponsors & partners</h3>{principal && <Sponsor sponsor={principal} principal/>}
      <div className="clubs-sponsor-grid">{sponsors.map((sponsor, index) => <Sponsor key={index} sponsor={sponsor}/>)}</div>
      {!principal && !sponsors.length && <p>No sponsors recorded.</p>}
      {data.sponsors != null && !Array.isArray(data.sponsors) && <p role="status">The sponsor list could not be interpreted.</p>}
    </section>
    <section><h3>Gallery</h3><p className="fo-note">{gallery.length} recorded images</p>
      <div className="clubs-gallery">{gallery.slice((current - 1) * 6, current * 6).map((item, index) => <figure key={`${current}-${index}`}>
        <ClubImage url={item?.url} label={`${data.name || 'Club'} — ${recordedText(item?.category)}`}/><figcaption>{recordedText(item?.category)}</figcaption>
      </figure>)}</div>
      {!gallery.length && <p>{data.gallery != null && !Array.isArray(data.gallery) ? 'The gallery record could not be interpreted.' : 'No gallery images recorded.'}</p>}
      {gallery.length > 6 && <nav className="fo-pagination" aria-label="Gallery pages"><span>{(current - 1) * 6 + 1}–{Math.min(current * 6, gallery.length)} of {gallery.length} images</span><button className="ap-secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous images</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Next images</button></nav>}
    </section>
  </>;
}
