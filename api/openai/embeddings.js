import handler from './[...path].js'

export default async function embeddings(req, res) {
  req.query = { ...(req.query || {}), path: ['embeddings'] }
  return handler(req, res)
}
