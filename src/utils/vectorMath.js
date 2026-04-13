/** Dot product of two equal-length numeric vectors. */
export function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]
  return s
}

/** L2 norm. */
export function norm(a) {
  return Math.sqrt(dot(a, a)) || 1
}

/** Cosine similarity in [-1, 1]. */
export function cosineSimilarity(a, b) {
  return dot(a, b) / (norm(a) * norm(b))
}

/** Subtract column-wise mean from each row (embeddings as rows). */
export function centerRows(vectors) {
  if (vectors.length === 0) return []
  const dim = vectors[0].length
  const mean = new Array(dim).fill(0)
  for (const row of vectors) {
    for (let j = 0; j < dim; j += 1) mean[j] += row[j]
  }
  for (let j = 0; j < dim; j += 1) mean[j] /= vectors.length
  return vectors.map((row) => row.map((v, j) => v - mean[j]))
}
