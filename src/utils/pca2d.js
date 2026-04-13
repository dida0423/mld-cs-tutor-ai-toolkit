import { centerRows } from './vectorMath.js'

/**
 * Multiply symmetric n×n matrix K by vector v.
 */
function symMatVec(K, v) {
  const n = K.length
  const out = new Array(n).fill(0)
  for (let i = 0; i < n; i += 1) {
    let s = 0
    const row = K[i]
    for (let j = 0; j < n; j += 1) s += row[j] * v[j]
    out[i] = s
  }
  return out
}

function normalizeVec(v) {
  let nrm = 0
  for (let i = 0; i < v.length; i += 1) nrm += v[i] * v[i]
  nrm = Math.sqrt(nrm) || 1
  return v.map((x) => x / nrm)
}

/**
 * Dominant eigenpair of symmetric K via power iteration.
 */
function dominantEigenpair(K, iterations = 120) {
  const n = K.length
  let v = normalizeVec(Array.from({ length: n }, () => Math.random() - 0.5))
  for (let t = 0; t < iterations; t += 1) {
    v = normalizeVec(symMatVec(K, v))
  }
  const Av = symMatVec(K, v)
  let lambda = 0
  for (let i = 0; i < n; i += 1) lambda += v[i] * Av[i]
  return { eigenvector: v, eigenvalue: Math.max(lambda, 0) }
}

/**
 * Spectral deflation for symmetric matrix (remove rank-one component).
 */
function deflateSymmetric(K, lambda, w) {
  return K.map((row, i) => row.map((val, j) => val - lambda * w[i] * w[j]))
}

/**
 * Build Gram matrix G = X X^T for row vectors X (already centered).
 */
function gramMatrix(rows) {
  const n = rows.length
  const G = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      let s = 0
      const a = rows[i]
      const b = rows[j]
      for (let k = 0; k < a.length; k += 1) s += a[k] * b[k]
      G[i][j] = s
      G[j][i] = s
    }
  }
  return G
}

/**
 * First two principal coordinate scores using the dual (Gram) formulation.
 * Works well when n (number of points) is small even if embedding dim is large.
 *
 * @param {number[][]} vectors - row vectors (not necessarily centered)
 * @returns {{ x: number[], y: number[], varExplained: [number, number] }}
 */
export function pca2ScoresFromRows(vectors) {
  if (vectors.length < 2) {
    return { x: vectors.map(() => 0), y: vectors.map(() => 0), varExplained: [0, 0] }
  }
  const X = centerRows(vectors)
  let G = gramMatrix(X)

  const { eigenvector: w1, eigenvalue: lam1 } = dominantEigenpair(G)
  const x = w1.map((wi) => Math.sqrt(lam1) * wi)

  const G2 = deflateSymmetric(G, lam1, w1)
  const { eigenvector: w2, eigenvalue: lam2 } = dominantEigenpair(G2)
  const y = w2.map((wi) => Math.sqrt(Math.max(lam2, 0)) * wi)

  const totalVar = lam1 + Math.max(lam2, 0) + 1e-9
  const varExplained = [lam1 / totalVar, Math.max(lam2, 0) / totalVar]

  return { x, y, varExplained }
}

/**
 * Min-max scale coordinates into [pad, size - pad] for SVG placement.
 */
export function fit2DToSvg(xs, ys, width, height, pad = 28) {
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const dx = maxX - minX || 1
  const dy = maxY - minY || 1
  const innerW = width - 2 * pad
  const innerH = height - 2 * pad
  const scale = Math.min(innerW / dx, innerH / dy)
  return xs.map((xv, i) => ({
    x: pad + (xv - minX) * scale,
    y: pad + (ys[i] - minY) * scale,
  }))
}
