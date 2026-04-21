/* global process */

export default async function handler(req, res) {
  const { path = [] } = req.query
  const tail = Array.isArray(path) ? path.join('/') : String(path || '')
  const upstream = `https://api.openai.com/v1/${tail}`

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: { message: 'Missing OPENAI_API_KEY' } })
  }

  try {
    const method = req.method || 'GET'
    const isBodyAllowed = !['GET', 'HEAD'].includes(method)

    const upstreamRes = await fetch(upstream, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: isBodyAllowed && req.body != null ? JSON.stringify(req.body) : undefined,
    })

    const text = await upstreamRes.text()
    res.status(upstreamRes.status)
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json')
    return res.send(text)
  } catch (err) {
    return res.status(500).json({
      error: { message: err?.message || 'OpenAI proxy request failed.' },
    })
  }
}
