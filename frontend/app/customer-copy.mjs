// Omit setup/import notes from public content without changing the saved catalog.
export function menuDescription(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^imported from the restaurant menu pdf\.?$/i.test(text) ? '' : text;
}

export function publicPickupAddress(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^(?:update restaurant address in admin settings|restaurant pickup address is managed in admin settings)\.?$/i.test(text) ? '' : text;
}
