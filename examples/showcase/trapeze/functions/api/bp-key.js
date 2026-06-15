export function onRequestGet({ env }) {
  const apiKey = env.BP_APIKEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'BP_APIKEY not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ apiKey }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
}
