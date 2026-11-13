/**
 * Fetches all pages from a bounded array GET endpoint (e.g., `/api/tracking`).
 * Keeps paging until a batch returns fewer rows than `pageSize` or `X-Total-Count` is met.
 */
export async function fetchAllPaginated(url, init = {}, fetchImpl = fetch, pageSize = 1000) {
  const allItems = [];
  let offset = 0;

  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const pageUrl = `${url}${sep}limit=${pageSize}&offset=${offset}`;
    const res = await fetchImpl(pageUrl, init);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { ok: false, status: res.status, data: [], errorData };
    }

    const batch = await res.json();
    if (!Array.isArray(batch)) {
      return { ok: true, status: res.status, data: batch, errorData: null };
    }

    allItems.push(...batch);

    const totalHeader = res.headers?.get?.('X-Total-Count');
    const totalCount = totalHeader !== null && totalHeader !== undefined ? parseInt(totalHeader, 10) : NaN;
    if (batch.length < pageSize || (Number.isFinite(totalCount) && allItems.length >= totalCount)) {
      break;
    }

    offset += pageSize;
  }

  return { ok: true, status: 200, data: allItems, errorData: null };
}

