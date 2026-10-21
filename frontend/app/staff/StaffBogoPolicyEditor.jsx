'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib';
import useDialogFocus from '../components/useDialogFocus';
import { staffBogoPolicyPayload, staffBogoSizeCode } from './staff-cart.mjs';

function PizzaSelection({ label, description, products, categories, value, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const text = query.trim().toLowerCase();
  const visible = products.filter(product => `${product.name} ${categories.find(category => Number(category.id) === Number(product.category_id))?.name || ''}`.toLowerCase().includes(text));
  const missing = value.filter(id => !products.some(product => Number(product.id) === id));
  function toggle(id, checked) { onChange(checked ? [...value.filter(value => value !== id), id] : value.filter(value => value !== id)); }
  return <fieldset disabled={disabled} className="option-section">
    <legend><strong>{label}</strong></legend>
    <p className="small-note">{description}</p>
    <label className="small-note">Filter {label.toLowerCase()}<input className="staff-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Pizza or category name" /></label>
    <div className="choice-list" style={{ maxHeight: '12rem', overflowY: 'auto' }}>
      {visible.map(product => <label className="choice-row" key={product.id}><input type="checkbox" checked={value.includes(Number(product.id))} onChange={event => toggle(Number(product.id), event.target.checked)} /><span>{product.name}<small className="small-note"> · {categories.find(category => Number(category.id) === Number(product.category_id))?.name || 'Pizza'}</small></span></label>)}
      {missing.map(id => <label className="choice-row" key={`missing-${id}`}><input type="checkbox" checked onChange={() => toggle(id, false)} /><span>Unavailable pizza #{id} · remove before saving</span></label>)}
      {!visible.length ? <p className="small-note">No available pizzas match this filter.</p> : null}
    </div>
    <p className="small-note">{value.length} selected</p>
  </fieldset>;
}

export default function StaffBogoPolicyEditor({ items, categories, onClose, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [revision, setRevision] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const requestRef = useRef(0);
  const savingRef = useRef(false);
  const dialogRef = useDialogFocus(true, () => { if (!savingRef.current) onClose(); });
  const productsForSizes = sizes => items.filter(item => (item.is_active === undefined || Number(item.is_active) === 1) && categories.some(category => Number(category.id) === Number(item.category_id) && (category.is_active === undefined || Number(category.is_active) === 1)) && (item.variants || []).some(variant => sizes.includes(staffBogoSizeCode(variant.name)) && (variant.is_active === undefined || Number(variant.is_active) === 1) && Number(Number(variant.price) > 0 ? variant.price : item.price) > 0));
  const paidProducts = productsForSizes(['M']);
  const freeProducts = productsForSizes(draft?.allowed_free_sizes?.M || ['M', 'S']);
  const eligibleCategories = categories.filter(category => paidProducts.some(product => Number(product.category_id) === Number(category.id)));

  const loadPolicy = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await api('/staff/bogo-policy', { authScope: 'staff' });
      if (request !== requestRef.current) return;
      setCanManage(Boolean(data.can_manage));
      if (!data.can_manage) {
        setError('Your account cannot change Staff BOGO rules. Ask an Admin to enable Can Manage Staff BOGO Rules in Staff Permissions.');
        return;
      }
      const policy = data.policy || {};
      setDraft({ name: policy.name || '', category_ids: (policy.category_ids || []).map(Number), product_ids: (policy.product_ids || []).map(Number), free_product_ids: (policy.free_product_ids || []).map(Number), allowed_free_sizes: { M: [...(policy.allowed_free_sizes?.M || [])] } });
      setRevision(data.revision);
      setConflict(false);
    } catch (err) {
      if (request !== requestRef.current) return;
      if (err.status === 403) setCanManage(false);
      setError(err.status === 403 ? 'Your permission to manage Staff BOGO rules is unavailable. Ask an Admin to review Staff Permissions.' : 'Staff BOGO rules could not be loaded. Retry to load the saved rules.');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicy();
    return () => { requestRef.current += 1; };
  }, [loadPolicy]);

  async function save(event) {
    event.preventDefault();
    if (savingRef.current || !canManage || conflict || revision == null) return;
    let policy;
    try {
      policy = staffBogoPolicyPayload(draft);
      if (policy.product_ids.some(id => !paidProducts.some(product => Number(product.id) === id)) || policy.free_product_ids.some(id => !freeProducts.some(product => Number(product.id) === id))) throw new Error('Remove unavailable pizzas before saving these rules.');
      if (policy.category_ids.some(id => !eligibleCategories.some(category => Number(category.id) === id))) throw new Error('Remove unavailable categories before saving these rules.');
    } catch (err) {
      setError(err.message);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const data = await api('/staff/bogo-policy', { method: 'PUT', authScope: 'staff', body: JSON.stringify({ policy, revision }) });
      await onSaved(data);
      onClose();
    } catch (err) {
      if (err.status === 409) {
        setConflict(true);
        setError('Another authorised user saved newer rules. Your draft has been kept. Discard this draft and reload the saved rules before making further changes.');
      } else if (err.status === 403) {
        setCanManage(false);
        setError('Your permission to manage Staff BOGO rules was removed. Your draft has been kept. Ask an Admin to review Staff Permissions.');
      } else {
        setError(err.status === 422 ? err.message : 'These rules could not be saved. Your draft has been kept. Please retry.');
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const missingCategories = (draft?.category_ids || []).filter(id => !eligibleCategories.some(category => Number(category.id) === id));
  return <div className="option-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section ref={dialogRef} className="option-modal bogo-modal" role="dialog" aria-modal="true" aria-labelledby="staff-bogo-policy-title" tabIndex={-1} aria-busy={loading || saving}>
      <div className="option-modal-header"><div><span className="eyebrow">Staff POS</span><h2 id="staff-bogo-policy-title">Manage Staff BOGO rules</h2><p>Save the rules for future Staff orders. Customer online offers keep their existing rules.</p></div><button type="button" className="icon-button" aria-label="Close Staff BOGO rules" disabled={saving} onClick={onClose}><X size={18} /></button></div>
      <p className="notice">Always available: all 7 days, any time. Buy 1 Medium pizza, get 1 eligible Medium or Small free. The free pizza stays in the same category and cannot cost more than the paid pizza.</p>
      {error ? <div className="notice warning" role="alert"><p>{error}</p>{!saving ? <button type="button" className="ghost" disabled={loading} onClick={loadPolicy}>{draft ? 'Discard draft and reload saved rules' : 'Retry loading rules'}</button> : null}</div> : null}
      {loading ? <p role="status" className="small-note">Loading saved Staff BOGO rules…</p> : null}
      {draft ? <form onSubmit={save}>
        <fieldset disabled={loading || saving || !canManage || conflict} className="option-section">
          <label>Staff offer name<input className="staff-input" required maxLength={120} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
          <fieldset className="option-section"><legend><strong>Eligible free sizes for a paid Medium</strong></legend><div className="choice-list">{[['M', 'Medium → Medium free'], ['S', 'Medium → Small free']].map(([size, label]) => <label className="choice-row" key={size}><input type="checkbox" checked={draft.allowed_free_sizes.M.includes(size)} onChange={event => setDraft(current => ({ ...current, allowed_free_sizes: { M: event.target.checked ? [...current.allowed_free_sizes.M.filter(value => value !== size), size] : current.allowed_free_sizes.M.filter(value => value !== size) } }))} /><span>{label}</span></label>)}</div><p className="small-note">Select at least one free size. One shared free pizza per paid Medium.</p></fieldset>
          <fieldset className="option-section"><legend><strong>Eligible pizza categories</strong></legend><p className="small-note">Categories and selected paid pizzas are combined. Leave both selections empty to allow all active pizzas with size pricing.</p><div className="choice-list">{eligibleCategories.map(category => <label className="choice-row" key={category.id}><input type="checkbox" checked={draft.category_ids.includes(Number(category.id))} onChange={event => setDraft(current => ({ ...current, category_ids: event.target.checked ? [...current.category_ids.filter(id => id !== Number(category.id)), Number(category.id)] : current.category_ids.filter(id => id !== Number(category.id)) }))} /><span>{category.name}</span></label>)}{missingCategories.map(id => <label className="choice-row" key={`missing-${id}`}><input type="checkbox" checked onChange={() => setDraft(current => ({ ...current, category_ids: current.category_ids.filter(value => value !== id) }))} /><span>Unavailable category #{id} · remove before saving</span></label>)}</div></fieldset>
          <PizzaSelection label="Selected paid pizzas" description="Add specific pizzas with an active Medium size alongside the selected categories." products={paidProducts} categories={categories} value={draft.product_ids} onChange={product_ids => setDraft(current => ({ ...current, product_ids }))} />
          <PizzaSelection label="Selected free pizzas" description="Optional: restrict free choices to these pizzas, within the paid pizza’s category. Leave empty to use the eligible categories and paid-pizza scope above." products={freeProducts} categories={categories} value={draft.free_product_ids} onChange={free_product_ids => setDraft(current => ({ ...current, free_product_ids }))} />
        </fieldset>
        <p className="small-note">Saving refreshes the current unsaved cart using these rules. Unchanged pizzas in placed orders retain their saved discount and price.</p>
        <div className="option-modal-footer"><button type="button" className="ghost" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={loading || saving || !canManage || conflict || revision == null}>{saving ? 'Saving…' : 'Save rules for future Staff orders'}</button></div>
      </form> : null}
    </section>
  </div>;
}
