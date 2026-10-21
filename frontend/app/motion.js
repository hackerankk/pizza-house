// Read the current OS/browser preference at the moment an interaction happens.
// This also respects changes made while the page is open.
export function reducedMotionPreferred() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export function scrollBehavior() {
  return reducedMotionPreferred() ? 'instant' : 'smooth';
}
