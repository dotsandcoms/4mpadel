const sponsorKey = /^sponsor:(\d+)$/;
export const sponsorFileKey = index => `sponsor:${index}`;

export function sponsorFileIndex(field) {
  const match = sponsorKey.exec(field);
  return match ? Number(match[1]) : null;
}

export function removeSponsorMedia(files, removedIndex) {
  const remaining = {};
  for (const [field,file] of Object.entries(files)) {
    const index = sponsorFileIndex(field);
    if (index === removedIndex) continue;
    remaining[index != null && index > removedIndex ? sponsorFileKey(index - 1) : field] = file;
  }
  return remaining;
}

export function previousSponsorLogo(sponsors, name) {
  const matches = (Array.isArray(sponsors) ? sponsors : []).filter(sponsor => sponsor?.name === name);
  return matches.length === 1 ? matches[0].logo_url : null;
}
