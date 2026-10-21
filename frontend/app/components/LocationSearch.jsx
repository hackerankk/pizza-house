'use client';

import { useEffect, useRef, useState } from 'react';

const withTimeout = promise => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Location search timed out. Check your connection and try again.')), 10000);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});

export default function LocationSearch({ ready, onStart, onSelect, onEnd }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState('');
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const requestRef = useRef(0);
  const sessionRef = useRef(null);

  useEffect(() => {
    const request = ++requestRef.current;
    setSuggestions([]);
    setActive(-1);
    if (!ready || !open || query.trim().length < 2) { setStatus(''); return; }
    const timer = setTimeout(async () => {
      setStatus('Searching locations…');
      try {
        const places = await withTimeout(window.google.maps.importLibrary('places'));
        if (!places.AutocompleteSuggestion) throw new Error('Places search is unavailable. Enable Places API (New) for the configured browser key.');
        sessionRef.current ||= new places.AutocompleteSessionToken();
        const result = await withTimeout(places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query.trim(), sessionToken: sessionRef.current }));
        if (request !== requestRef.current) return;
        const predictions = result.suggestions.map(row => row.placePrediction).filter(Boolean);
        setSuggestions(predictions);
        setStatus(predictions.length ? '' : 'No locations found. Try an area, street, building or landmark.');
      } catch (error) {
        if (request === requestRef.current) setStatus('Location search is unavailable. Try again, use your current location, or enter delivery coordinates below.');
      }
    }, 300);
    return () => { clearTimeout(timer); ++requestRef.current; };
  }, [query, ready, open]);

  async function choose(prediction) {
    const request = ++requestRef.current;
    const selection = onStart();
    setStatus('Loading selected address…');
    try {
      const place = prediction.toPlace();
      await withTimeout(place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] }));
      if (request !== requestRef.current) return;
      if (!place.location) throw new Error('This place has no delivery coordinates. Choose another suggestion.');
      onSelect(selection, place.location.lat(), place.location.lng(), place.formattedAddress || place.displayName);
      sessionRef.current = null;
      setQuery(place.formattedAddress || place.displayName || '');
      setSuggestions([]);
      setStatus('');
      setOpen(false);
    } catch (error) {
      if (request === requestRef.current) setStatus(error.message || 'Unable to load this location. Try another result.');
    } finally {
      onEnd(selection);
    }
  }

  return <div className="location-search-box">
    <input className="location-search" role="combobox" aria-label="Search delivery address" aria-autocomplete="list" aria-expanded={open && suggestions.length > 0} aria-controls="location-suggestions" aria-activedescendant={active >= 0 ? `location-result-${active}` : undefined} value={query} disabled={!ready} placeholder={ready ? 'Search area, street, building or landmark' : 'Loading Google Maps…'} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(value + 1, suggestions.length - 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(value - 1, 0)); }
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Enter' && suggestions[active]) { event.preventDefault(); choose(suggestions[active]); }
    }} />
    {open && suggestions.length > 0 ? <ul id="location-suggestions" role="listbox" className="location-suggestions">{suggestions.map((prediction, index) => <li key={prediction.placeId} role="option" id={`location-result-${index}`} aria-selected={index === active}><button type="button" className="ghost" onClick={() => choose(prediction)}>{prediction.text.toString()}</button></li>)}<li className="small-note">Powered by Google Maps</li></ul> : null}
    {status ? <p role="status" className="small-note">{status}</p> : null}
  </div>;
}
