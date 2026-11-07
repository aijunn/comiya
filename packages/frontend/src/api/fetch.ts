async function handleFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);

  if (!res.ok) {
    try {
      const data = await res.json();
      throw new Error(data.msg);
    } catch {
      throw new Error(`${res.status} ${res.statusText}`);
    }
  }

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(data.msg);
  }

  return data.data;
}

function get(url: string, params?: Record<string, unknown>) {
  let fullUrl = url;
  if (params) {
    const tranformed = Object.fromEntries(
      Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
    );
    const queryString = new URLSearchParams(tranformed).toString();
    fullUrl = `${url}?${queryString}`;
  }

  return handleFetch(fullUrl);
}

function post(url: string, data?: unknown) {
  return handleFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

export { get, post };
