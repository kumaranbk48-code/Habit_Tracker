/**
 * Fetches every row from a Supabase/PostgREST query by paging in bounded windows.
 * PostgREST enforces a default 1000-row cap when `.range()` is omitted.
 */
export async function fetchAllSupabaseRows(buildQuery, pageSize = 1000) {
  const allRows = [];
  let offset = 0;

  while (true) {
    const query = buildQuery();
    const { data, error } = typeof query?.range === 'function'
      ? await query.range(offset, offset + pageSize - 1)
      : await query;

    if (error) {
      return { data: null, error };
    }

    const batch = Array.isArray(data) ? data : [];
    allRows.push(...batch);

    if (typeof query?.range !== 'function' || batch.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return { data: allRows, error: null };
}

