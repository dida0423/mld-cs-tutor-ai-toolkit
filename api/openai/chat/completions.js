import handler from '../[...path].js'

export default async function chatCompletions(req, res) {
  req.query = { ...(req.query || {}), path: ['chat', 'completions'] }
  return handler(req, res)
}
