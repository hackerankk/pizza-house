export function orderCanEdit(order = {}) {
  return !['out_for_delivery', 'delivered', 'cancelled'].includes(order.status)
    && !(order.status === 'picked_up' && ['takeaway', 'dine_in'].includes(order.order_type));
}

// Fetch every page; selectors must not silently omit older catalog entries.
export async function loadCatalog(request, path) {
  const items = [];
  const seen = new Set();
  const pageSize = 200;
  for (let page = 1; ; page += 1) {
    const data = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=${pageSize}&page=${page}`);
    const rows = data.items || [];
    let added = 0;
    for (const row of rows) {
      if (seen.has(String(row.id))) continue;
      seen.add(String(row.id)); items.push(row); added += 1;
    }
    if (!data.pagination || rows.length < Number(data.pagination.per_page || pageSize)) return { ...data, items };
    if (!added) throw new Error('Catalog pagination did not advance. Please retry.');
  }
}
