// A fake Cache Storage and a fake fetch for the tests.
export function fakeCaches() {
  const stores = new Map();
  const make = (name) => {
    const m = (stores.get(name) ?? stores.set(name, new Map()).get(name));
    return {
      async match(url) { const b = m.get(url); return b ? new Response(b.slice()) : undefined; },
      async put(url, res) { m.set(typeof url === "string" ? url : url.url, new Uint8Array(await res.arrayBuffer())); },
      async keys() { return [...m.keys()].map((url) => ({ url })); },
      async delete(req) { return m.delete(req.url ?? req); },
    };
  };
  return { stores, async open(name) { return make(name); }, async delete(name) { return stores.delete(name); } };
}

// `files`: Map url -> bytes (Uint8Array or string). Records every request.
export function fakeFetch(files) {
  const log = [];
  const fetch = async (url, init) => {
    log.push({ url, init });
    if (!files.has(url)) return new Response("nope", { status: 404 });
    const body = files.get(url);
    return new Response(typeof body === "string" ? body : body.slice(), { headers: { "content-type": "application/octet-stream" } });
  };
  return { fetch, log };
}
