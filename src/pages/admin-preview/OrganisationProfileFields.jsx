import { organisationCollections, organisationLabels, socialFields, organisationImageExtension } from './organisationProfileFields.js';

const areas = [
  ['Identity', ['name','short_name','org_type','coverage','year_established','about','linked_status','linked_club_name','sapa_intent']],
  ['Contact and website', ['contact_email','contact_phone','whatsapp_number','website_url']],
  ['Branding and images', ['brand_color','logo_url','cover_image_url']],
];

export default function OrganisationProfileFields({ draft, onChange, files, onFile, onValidation }) {
  const stage = (key, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      organisationImageExtension(key, file);
      onFile(key, file);
    } catch (error) {
      onValidation(error.message);
    }
  };
  return <div className="of-nested">
    {areas.map(([label, keys], index) => <details key={label} open={index < 2 ? true : undefined}>
      <summary>{label}</summary>
      <div className="of-fields">
        {keys.map(key => <div key={key}>
          <label>{organisationLabels[key]}{key === 'about' ? <textarea name={key} rows={4} value={draft[key] ?? ''} onChange={event => onChange(key,event.target.value)} />
            : <input name={key} value={draft[key] ?? ''} required={key === 'name' || key === 'contact_email'}
              type={key === 'contact_email' ? 'email' : key === 'year_established' ? 'number' : 'text'}
              inputMode={key.endsWith('_url') ? 'url' : undefined} onChange={event => { if (files[key]) onFile(key,null); onChange(key,event.target.value); }} />}</label>
          {['logo_url','cover_image_url'].includes(key) && <><label>{key === 'logo_url' ? 'Upload organisation logo' : 'Upload organisation cover'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => stage(key,event)} /></label>
            {files[key] && <p>{files[key].name} <button className="ap-secondary" type="button" onClick={() => onFile(key,null)}>Remove staged upload</button></p>}</>}
        </div>)}
      </div>
    </details>)}
    <details><summary>Social links</summary><div className="of-fields">{socialFields.map(field => <label key={field}>{field}
      <input value={draft.socials?.[field] || ''} onChange={event => onChange('socials',{...draft.socials,[field]:event.target.value})}/>
    </label>)}</div></details>
    {Object.entries(organisationCollections).map(([key, config]) => {
      const rows = Array.isArray(draft[key]) ? draft[key] : [];
      return <details key={key}><summary>{config.label}</summary>
        {rows.map((row, index) => <fieldset className="of-fields" key={index}>
          <legend>{config.singular} {index+1}</legend>
          {Object.entries(config.fields).map(([field,label]) => <label key={field}>{label}
            <input value={row?.[field] || ''} onChange={event => onChange(key, rows.map((entry, at) =>
              at === index ? { ...entry, [field]: event.target.value } : entry))} /></label>)}
          <button className="ap-secondary" type="button" onClick={() => onChange(key,rows.filter((_,at)=>at!==index))}>Remove {config.singular}</button>
        </fieldset>)}
        <button className="ap-secondary" type="button" onClick={() => onChange(key,[...rows,{}])}>Add {config.singular}</button>
      </details>;
    })}
  </div>;
}
