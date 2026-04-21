/* global process */

export default async function handler(req, res) {
  const { path = [] } = req.query
  const tail = Array.isArray(path) ? path.join('/') : String(path || '')
  const upstream = `https://api.openai.com/v1/${tail}`
  const apiKey =
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_KEY ??
    process.env.VITE_OPENAI_API_KEY ??
    ''
  const maskedKey = apiKey ? `${apiKey.slice(0, 7)}...(${apiKey.length})` : '(missing)'
  console.log('[openai-proxy] request', {
    method: req.method || 'GET',
    tail,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    has_OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    has_OPENAI_KEY: Boolean(process.env.OPENAI_KEY),
    has_VITE_OPENAI_API_KEY: Boolean(process.env.VITE_OPENAI_API_KEY),
    apiKeyMasked: maskedKey,
  })

  if (!apiKey) {
    return res.status(500).json({
      error: {
        message:
          'Missing OpenAI key env var. Set OPENAI_API_KEY in Vercel Project Settings, then redeploy.',
      },
      diagnostics: {
        vercelEnv: process.env.VERCEL_ENV ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
        has_OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
        has_OPENAI_KEY: Boolean(process.env.OPENAI_KEY),
        has_VITE_OPENAI_API_KEY: Boolean(process.env.VITE_OPENAI_API_KEY),
      },
    })
  }

  try {
    const method = req.method || 'GET'
    const isBodyAllowed = !['GET', 'HEAD'].includes(method)

    const upstreamRes = await fetch(upstream, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: isBodyAllowed && req.body != null ? JSON.stringify(req.body) : undefined,
    })
    console.log('[openai-proxy] upstream response', { status: upstreamRes.status, ok: upstreamRes.ok, tail })

    const text = await upstreamRes.text()
    res.status(upstreamRes.status)
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json')
    return res.send(text)
  } catch (err) {
    console.error('[openai-proxy] error', { tail, message: err?.message || String(err) })
    return res.status(500).json({
      error: { message: err?.message || 'OpenAI proxy request failed.' },
    })
  }
}
