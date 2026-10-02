// The public product page; no login. Throws on anything but 200 so a failed
// lookup is told apart from a product the store does not list.
export async function fetchProductPage(
  productId: string,
  locale: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(
    `https://store.playstation.com/${locale.toLowerCase()}/product/${encodeURIComponent(productId)}`,
    { headers: { "User-Agent": "Mozilla/5.0 (playstation-games list sync)" } },
  );
  if (!res.ok) throw new Error(`Store page for ${productId} failed with status ${res.status}`);
  return await res.text();
}
