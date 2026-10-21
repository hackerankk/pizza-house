'use client';

import { useEffect, useRef } from 'react';

const openDialogs = [];
let previousOverflow;

// Keep keyboard focus inside the topmost dialog and return it to its opener.
// The shared stack also handles a product dialog opened from the cart drawer.
export function activateDialogFocus(dialog, onClose) {
  const document = dialog.ownerDocument;
  const previousFocus = document.activeElement;
  const entry = { dialog };
  if (!openDialogs.length) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openDialogs.push(entry);
  const isTop = () => openDialogs[openDialogs.length - 1] === entry;
  const focusables = () => Array.from(dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
  const focusFirst = () => (focusables()[0] || dialog).focus({ preventScroll: true });
  const timer = setTimeout(() => { if (isTop()) focusFirst(); }, 0);
  const onKey = event => {
    if (!isTop()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = focusables();
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!nodes.length) { event.preventDefault(); dialog.focus(); }
    else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };
  const onFocus = event => { if (isTop() && !dialog.contains(event.target)) focusFirst(); };
  document.addEventListener('keydown', onKey);
  document.addEventListener('focusin', onFocus);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('focusin', onFocus);
    const wasTop = isTop();
    openDialogs.splice(openDialogs.indexOf(entry), 1);
    if (!openDialogs.length) document.body.style.overflow = previousOverflow;
    if (wasTop && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
}

export default function useDialogFocus(open, onClose) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !dialogRef.current) return undefined;
    return activateDialogFocus(dialogRef.current, () => closeRef.current());
  }, [open]);
  return dialogRef;
}
