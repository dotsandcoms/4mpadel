import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SearchableDropdown from '../../src/components/SearchableDropdown.jsx';
import '../../src/pages/AdminPreview.css';

function Fixture() {
  const [value, setValue] = useState('alpha'), [submitted, setSubmitted] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false), [dialogValue, setDialogValue] = useState('one');
  const dialog = useRef(null);
  useEffect(() => { if (dialogOpen) dialog.current.showModal(); }, [dialogOpen]);
  const record = event => { window.dropdownChanges = [...(window.dropdownChanges || []), { value: event.target.value, name: event.target.name, target: event.target.tagName, currentTarget: event.currentTarget.tagName }]; setValue(event.target.value); };
  return <main className="ap-root" style={{ display: 'block', padding: 24, maxWidth: 850, margin: 'auto' }}>
    <h1>Searchable dropdown QA</h1>
    <form id="dropdown-form" onSubmit={event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); window.dropdownFormData = data; setSubmitted(data); }} onReset={() => { setValue('alpha'); setSubmitted(null); }} style={{ display: 'grid', gap: 24 }}>
      <label htmlFor="controlled">Controlled choice</label>
      <SearchableDropdown id="controlled" name="controlled" value={value} onChange={record}>
        <option value="alpha">Alpha club</option><option value="beta">Beta club</option><option value="gamma">Gamma club</option>
        <option value="blocked" disabled>Blocked club</option>
        <optgroup label="Cape region"><option value="cape">Cape Town club</option><option value="coast">Coastal club</option></optgroup>
        <optgroup label="Unavailable region" disabled><option value="closed">Closed club</option></optgroup>
      </SearchableDropdown>
      <label>Uncontrolled choice<SearchableDropdown name="uncontrolled" defaultValue="second"><option value="first">First option</option><option value="second">Second option</option><option value="third">Third option</option></SearchableDropdown></label>
      <label htmlFor="required-choice">Required choice</label>
      <SearchableDropdown id="required-choice" name="requiredChoice" required defaultValue=""><option value="">Choose an option</option><option value="ready">Ready option</option></SearchableDropdown>
      <label>Disabled choice<SearchableDropdown name="disabledChoice" disabled defaultValue="disabled"><option value="disabled">Disabled field</option></SearchableDropdown></label>
      <div><button type="submit">Submit choices</button><button type="reset">Reset choices</button><button type="button" onClick={() => setDialogOpen(true)}>Open modal</button></div>
    </form>
    <output data-testid="controlled-value">{value}</output>
    <output data-testid="submitted">{submitted ? JSON.stringify(submitted) : 'Not submitted'}</output>
    {dialogOpen && <dialog ref={dialog} aria-labelledby="qa-modal-title" onClose={() => setDialogOpen(false)} style={{ width: 'min(480px, calc(100vw - 32px))', boxSizing: 'border-box', padding: 24, overflow: 'auto' }}>
      <h2 id="qa-modal-title">Dropdown inside modal</h2>
      <label htmlFor="modal-choice">Modal choice</label>
      <SearchableDropdown id="modal-choice" name="modalChoice" value={dialogValue} onChange={event => setDialogValue(event.target.value)}><option value="one">One team</option><option value="two">Two teams</option><option value="three">Three teams</option></SearchableDropdown>
      <button type="button" onClick={() => dialog.current.close()}>Close modal</button>
    </dialog>}
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
