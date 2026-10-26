export default function EntityProfileReviewValue({field,value}){
 if(['verified','is_national_governing_body'].includes(field))return <span>{value?'Yes':'No'}</span>;
 if(['logo_url','cover_image_url'].includes(field)){
   let url;try{const candidate=new URL(value);if(['http:','https:'].includes(candidate.protocol))url=candidate.href;}catch{/* Empty or invalid image. */}
   return url?<img src={url} referrerPolicy="no-referrer" width="160" height="90" alt={field==='logo_url'?'Logo preview':'Cover preview'} style={{objectFit:'contain'}}/>:<span>No image</span>;
 }
 if(field==='personnel')return Array.isArray(value)&&value.filter(Boolean).length?<ul>{value.filter(Boolean).map((person,index)=><li key={index}>{person.name||person.title||'Unnamed person'} — {person.role||person.position||'Role not set'}</li>)}</ul>:<span>No personnel</span>;
 if(field==='committees')return Array.isArray(value)&&value.filter(Boolean).length?<ul>{value.filter(Boolean).map((committee,index)=><li key={index}><strong>{committee.name||committee.title||'Unnamed committee'}</strong>: {Array.isArray(committee.members)?committee.members.join(', '):committee.membersText||committee.members||'No members'}</li>)}</ul>:<span>No committees</span>;
 if(field==='socials')return <ul>{['instagram','facebook','tiktok','youtube'].map(platform=><li key={platform}><strong>{platform[0].toUpperCase()+platform.slice(1)}</strong>: {value?.[platform]||'Not set'}</li>)}</ul>;
 return <span>{value==null||value===''?'Not set':String(value)}</span>;
}
