import React, { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './SearchableDropdown.css';

// Keep the real select as the form/validation/event authority. Unsupported
// multi-select/listbox presentation stays native instead of changing semantics.
const SearchableDropdown = forwardRef(function SearchableDropdown({ searchable = true, ...props }, ref) {
  if (!searchable || props.multiple || Number(props.size) > 1) return <select {...props} ref={ref}/>;
  return <SingleDropdown {...props} nativeRef={ref}/>;
});

function SingleDropdown({ children, className = '', style, nativeRef, onChange, onInvalid, onFocus, onBlur, onKeyDown, onClick, autoFocus, ...props }) {
  const select = useRef(null), trigger = useRef(null), popup = useRef(null), search = useRef(null), wrapper = useRef(null);
  const uid = useId(), listId = `${uid}-options`, errorId = `${uid}-error`;
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(-1);
  const [options, setOptions] = useState([]), [selected, setSelected] = useState(''), [label, setLabel] = useState('');
  const [validation, setValidation] = useState('');
  const actualValue = props.value !== undefined ? String(props.value ?? '') : selected;
  const shown = options.filter(option => !option.hidden && `${option.label} ${option.group}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const enabled = shown.filter(option => !option.disabled);
  const chosen = options.find(option => option.value === actualValue);
  const name = props['aria-label'] || label || props.title || props.name || 'Select an option';
  const setNative = node => { select.current = node; if (typeof nativeRef === 'function') nativeRef(node); else if (nativeRef) nativeRef.current = node; };

  // DOM options preserve native text/value defaults, optgroup disabling and
  // fragments without inventing a second parser for React children.
  useLayoutEffect(() => {
    const node = select.current;
    const next = [...node.options].map((option, index) => ({ value: option.value, label: option.label || option.textContent, index, group: option.parentElement.tagName === 'OPTGROUP' ? option.parentElement.label : '', disabled: option.disabled || (option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled), hidden: option.hidden || option.parentElement.hidden }));
    setOptions(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    setSelected(current => current === node.value ? current : node.value);
    const labels = [...(node.labels || [])];
    if (!labels.length) {
      let sibling = wrapper.current?.previousElementSibling;
      while (sibling && sibling.tagName !== 'LABEL') sibling = sibling.previousElementSibling;
      if (sibling) labels.push(sibling);
    }
    const text = labels.map(element => { const copy = element.cloneNode(true); copy.querySelectorAll('.ap-searchable-select,select,input,button,textarea').forEach(child => child.remove()); return copy.textContent.trim(); }).filter(Boolean).join(' ');
    setLabel(current => current === text ? current : text);
  });

  useEffect(() => {
    const node = select.current;
    const reset = () => { setOpen(false); setValidation(''); setTimeout(() => { if (select.current) setSelected(select.current.value); }, 0); };
    node.form?.addEventListener('reset', reset);
    if (autoFocus) trigger.current?.focus();
    return () => node.form?.removeEventListener('reset', reset);
  }, [autoFocus]);

  const close = (restore = true) => { setOpen(false); setQuery(''); if (restore) trigger.current?.focus(); };
  const show = last => {
    if (select.current?.matches(':disabled')) return;
    setQuery('');
    const available = options.filter(option => !option.hidden && !option.disabled);
    const selectedOption = available.find(option => option.value === actualValue);
    setActive((last ? available.at(-1) : selectedOption || available[0])?.index ?? -1);
    setOpen(true);
  };
  const choose = option => {
    if (!option || option.disabled || select.current.matches(':disabled')) return;
    select.current.value = option.value;
    select.current.dispatchEvent(new Event('change', { bubbles: true }));
    setValidation(''); close();
  };
  useLayoutEffect(() => {
    if (!open) { if (popup.current?.hidePopover && popup.current.matches(':popover-open')) popup.current.hidePopover(); return; }
    const panel = popup.current;
    const position = () => {
      const rect = trigger.current.getBoundingClientRect(), viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      const panelWidth = Math.min(Math.max(rect.width, 240), width - 16);
      const below = height - rect.bottom - 12, above = rect.top - 12;
      const limit = Math.min(360, Math.max(120, below >= 200 || below >= above ? below : above));
      panel.style.width = `${panelWidth}px`; panel.style.maxHeight = `${limit}px`;
      panel.style.left = `${Math.max(8, Math.min(rect.left, width - panelWidth - 8))}px`;
      panel.style.top = `${below >= 200 || below >= above ? rect.bottom + 4 : Math.max(8, rect.top - Math.min(panel.scrollHeight, limit) - 4)}px`;
    };
    if (panel.showPopover && !panel.matches(':popover-open')) panel.showPopover();
    position(); search.current?.focus();
    const outside = event => { if (!wrapper.current?.contains(event.target)) close(false); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open]);
  useEffect(() => { if (open) popup.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled]);

  const navigate = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') { close(); /* Default Tab then moves past the trigger. */ }
    else if (event.key === 'Enter') { event.preventDefault(); choose(shown.find(option => option.index === active)); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = enabled.findIndex(option => option.index === active);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : event.key === 'ArrowDown' ? (index + 1) % enabled.length : (index - 1 + enabled.length) % enabled.length;
      setActive(enabled[next]?.index ?? -1);
    }
  };
  return <span className="ap-searchable-select" ref={wrapper} hidden={props.hidden}>
    <select {...props} ref={setNative} className="ap-select-native" tabIndex={-1} aria-hidden="true" onChange={event => { setSelected(event.target.value); setValidation(''); onChange?.(event); }} onFocus={() => trigger.current?.focus()} onInvalid={event => { onInvalid?.(event); event.preventDefault(); setValidation(event.currentTarget.validationMessage); trigger.current?.focus(); }}>{children}</select>
    <button ref={trigger} type="button" className={`ap-select-trigger ${className}`} style={style} disabled={props.disabled} tabIndex={props.tabIndex} title={props.title} onFocus={onFocus} onBlur={onBlur} aria-label={name} aria-labelledby={props['aria-labelledby']} aria-describedby={[props['aria-describedby'], validation ? errorId : ''].filter(Boolean).join(' ') || undefined} aria-invalid={validation ? true : props['aria-invalid']} aria-required={props.required || undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={event => { onClick?.(event); if (event.defaultPrevented) return; event.preventDefault(); open ? close() : show(false); }} onKeyDown={event => { onKeyDown?.(event); if (event.defaultPrevented) return; if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); show(event.key === 'ArrowUp'); } }}>
      <span>{chosen?.label || props.placeholder || 'Select an option'}</span><span className="ap-select-chevron" aria-hidden="true">⌄</span>
    </button>
    <div ref={popup} popover="auto" className={`ap-select-popover${open ? ' is-open' : ''}`} onToggle={event => { if (event.newState === 'closed') setOpen(false); }} onClick={event => event.stopPropagation()} onKeyDown={navigate}>
      <div className="ap-select-search"><input ref={search} type="search" role="combobox" aria-label={`Search ${name}`} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 && shown.some(option => option.index === active) ? `${uid}-option-${active}` : undefined} value={query} placeholder="Search options…" autoComplete="off" onChange={event => { const value = event.target.value; setQuery(value); setActive(options.find(option => !option.hidden && !option.disabled && `${option.label} ${option.group}`.toLocaleLowerCase().includes(value.toLocaleLowerCase()))?.index ?? -1); }}/></div>
      <div id={listId} role="listbox" aria-label={name} className="ap-select-options">{shown.map((option, index) => <React.Fragment key={option.index}>{option.group && (index === 0 || shown[index - 1].group !== option.group) && <div className="ap-select-group" aria-hidden="true">{option.group}</div>}<div id={`${uid}-option-${option.index}`} role="option" aria-selected={option.value === actualValue} aria-disabled={option.disabled || undefined} aria-label={option.group ? `${option.group}: ${option.label}` : undefined} data-option-index={option.index} className={`ap-select-option${active === option.index ? ' is-active' : ''}`} onPointerMove={() => { if (!option.disabled) setActive(option.index); }} onPointerDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); choose(option); }}><span>{option.label || 'None'}</span>{option.value === actualValue && <span aria-hidden="true">✓</span>}</div></React.Fragment>)}{!shown.length && <p className="ap-select-empty" role="status">No matching options</p>}</div>
    </div>
    {validation && <span id={errorId} className="ap-select-error" role="alert">{validation}</span>}
  </span>;
}

export default SearchableDropdown;
