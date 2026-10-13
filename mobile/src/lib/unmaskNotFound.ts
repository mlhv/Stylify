type FetchLike = (input: any, init?: any) => Promise<Response>

// Until 2026-10-13 CloudFront rewrote an origin 404 on the live site into 200 text/html (the web
// app's index.html), so a missing item arrived as a "successful" page. The distribution no longer
// does that; this stays as a guard in case the masking returns. Every Stylify API route answers
// JSON, so a 2xx that declares a non-JSON content type is really a 404.
export function unmaskNotFound<F extends FetchLike>(fetchImpl: F): F {
  return (async (input, init) => {
    const res = await fetchImpl(input, init)
    const type = res.headers.get('Content-Type')
    if (res.status >= 200 && res.status < 300 && type && !type.includes('application/json')) {
      return new Response(null, { status: 404 })
    }
    return res
  }) as F
}
