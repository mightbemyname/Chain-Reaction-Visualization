import { graphArcs, validateGraph, type Arc, type Graph } from './model'

export const EXACT_NODE_LIMIT = 14

export interface SubsetOutcome {
  mask: number
  nodeIds: string[]
  internal: number
  outwardArcs: number
  failure: number
  probability: number
  failureFactors: number[]
}
export interface ArcStatistics {
  id: string
  source: string
  target: string
  configured: number
  sourceProbability: number
  attemptProbability: number
  causeProbability: number
}
export interface Statistics {
  mean: number
  variance: number
  sd: number
  median: number
  p10: number
  p90: number
  all: number
}
export interface ProbabilityResult extends Statistics {
  method: 'exact' | 'simulation'
  distribution: number[]
  nodeProbabilities: Record<string, number>
  subsets?: SubsetOutcome[]
  arcs?: ArcStatistics[]
  trials?: number
  confidenceIntervals?: { low: number; high: number }[]
  precisionWarning?: string
}
export interface TransmissionAttempt { arcId: string; source: string; target: string; success: boolean }
export interface Trial { activated: string[]; trace: TransmissionAttempt[] }

const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function tail(distribution: readonly number[], k: number): number {
  let sum = 0
  for (let i = Math.max(0, Math.ceil(k)); i < distribution.length; i++) sum += distribution[i]
  return clamp(sum)
}

export function percentile(distribution: readonly number[], fraction: number): number {
  let cumulative = 0
  for (let k = 0; k < distribution.length; k++) {
    cumulative += distribution[k]
    if (cumulative >= fraction - 1e-12 && cumulative > 0) return k
  }
  return distribution.length - 1
}

export function summarize(distribution: readonly number[]): Statistics {
  let mean = 0
  for (let k = 0; k < distribution.length; k++) mean += k * distribution[k]
  let variance = 0
  for (let k = 0; k < distribution.length; k++) variance += (k - mean) ** 2 * distribution[k]
  return { mean, variance, sd: Math.sqrt(Math.max(0, variance)), median: percentile(distribution, .5), p10: percentile(distribution, .1), p90: percentile(distribution, .9), all: distribution.at(-1) ?? 0 }
}

/** Subset recurrence, O(n 3^(n-1)) time and O(n 2^n) storage. */
export function exactDistribution(graph: Graph): ProbabilityResult {
  validateGraph(graph)
  const n = graph.nodes.length
  if (n > EXACT_NODE_LIMIT) throw new Error(`Exact calculation is limited to ${EXACT_NODE_LIMIT} nodes. Use Monte Carlo for larger graphs.`)
  const ids = graph.nodes.map(node => node.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const arcs = graphArcs(graph).map(arc => ({ ...arc, u: index.get(arc.source)!, v: index.get(arc.target)! }))
  const size = 1 << n
  const full = size - 1
  const source = 1 << index.get(graph.source)!
  const pairFailures = Array.from({ length: n }, () => new Float64Array(n).fill(1))
  const pairLogFailures = Array.from({ length: n }, () => new Float64Array(n))
  const reachableArcs = new Int32Array(n)
  const undirectedNeighbors = new Int32Array(n)
  for (const arc of arcs) {
    pairFailures[arc.u][arc.v] *= 1 - arc.probability
    pairLogFailures[arc.u][arc.v] += Math.log1p(-arc.probability)
    if (arc.probability > 0) reachableArcs[arc.u] |= 1 << arc.v
    if (arc.probability > 0 && arc.u !== arc.v) {
      undirectedNeighbors[arc.u] |= 1 << arc.v
      undirectedNeighbors[arc.v] |= 1 << arc.u
    }
  }
  const pairSuccesses = pairLogFailures.map(row => row.map(value => -Math.expm1(value)))
  // Cache each node's product of failures to every possible destination subset.
  const rowFailures = pairFailures.map(row => {
    const products = new Float64Array(size)
    products[0] = 1
    for (let mask = 1; mask < size; mask++) {
      const bit = mask & -mask
      products[mask] = products[mask ^ bit] * row[31 - Math.clz32(bit)]
    }
    return products
  })
  const cutFailure = (from: number, to: number): number => {
    let product = 1
    while (from && product !== 0) {
      const bit = from & -from
      product *= rowFailures[31 - Math.clz32(bit)][to]
      from ^= bit
    }
    return product
  }
  const internallyReachable = (mask: number): boolean => {
    let reached = source
    let frontier = source
    while (frontier) {
      const bit = frontier & -frontier
      frontier ^= bit
      const added = reachableArcs[31 - Math.clz32(bit)] & mask & ~reached
      reached |= added
      frontier |= added
    }
    return reached === mask
  }
  const bitCount = (mask: number): number => {
    let count = 0
    while (mask) { mask &= mask - 1; count++ }
    return count
  }
  // On a tree each child has one possible incoming path. Direct multiplication
  // avoids subtractive cancellation for very rare long-chain outcomes.
  const treeInternal = (mask: number): number | undefined => {
    let adjacencyCount = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) adjacencyCount += bitCount(undirectedNeighbors[i] & mask)
    if (adjacencyCount !== 2 * (bitCount(mask) - 1)) return undefined
    let reached = source
    let frontier = source
    let product = 1
    while (frontier) {
      const bit = frontier & -frontier
      frontier ^= bit
      const u = 31 - Math.clz32(bit)
      let children = undirectedNeighbors[u] & mask & ~reached
      reached |= children
      frontier |= children
      while (children) {
        const child = children & -children
        children ^= child
        product *= pairSuccesses[u][31 - Math.clz32(child)]
      }
    }
    return product
  }
  const internal = new Float64Array(size)
  let precisionWarning: string | undefined
  internal[source] = 1
  for (let mask = 1; mask < size; mask++) {
    if (!(mask & source) || mask === source || !internallyReachable(mask)) continue
    const treeProbability = treeInternal(mask)
    if (treeProbability !== undefined) { internal[mask] = treeProbability; continue }
    // Kahan summation reduces accumulated rounding error before subtraction.
    let sum = 0
    let correction = 0
    const rest = mask ^ source
    for (let sub = (rest - 1) & rest; ; sub = (sub - 1) & rest) {
      const from = sub | source
      const value = internal[from] * cutFailure(from, mask ^ from) - correction
      const next = sum + value
      correction = (next - sum) - value
      sum = next
      if (sub === 0) break
    }
    const calculated = 1 - sum
    if (calculated <= 1e-12 || calculated > 1 + 1e-12) {
      precisionWarning = 'Floating-point subtraction may have lost precision in cyclic subset probabilities near 1e-12 or lower, or outside the valid range. Their relative error is unknown; displayed zeros may represent positive probabilities. Monte Carlo also cannot resolve rare events that were never observed.'
    }
    internal[mask] = clamp(calculated)
  }
  const distribution = Array<number>(n + 1).fill(0)
  const nodeProbabilities: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  const subsets: SubsetOutcome[] = []
  let total = 0
  for (let mask = 1; mask < size; mask++) {
    if (!(mask & source)) continue
    const failure = cutFailure(mask, full ^ mask)
    const probability = internal[mask] * failure
    const nodeIds = ids.filter((_, i) => mask & (1 << i))
    distribution[nodeIds.length] += probability
    total += probability
    for (const id of nodeIds) nodeProbabilities[id] += probability
    // The complete subset distribution is retained; explanation factors are cheap at this limit.
    const outward = arcs.filter(arc => (mask & (1 << arc.u)) && !(mask & (1 << arc.v)))
    subsets.push({ mask, nodeIds, internal: internal[mask], outwardArcs: outward.length, failure, probability, failureFactors: outward.map(arc => 1 - arc.probability) })
  }
  if (!Number.isFinite(total) || total <= 0 || Math.abs(total - 1) > 1e-7) throw new Error('Exact calculation lost numerical precision. Try Monte Carlo.')
  if (total !== 1) {
    for (let k = 0; k <= n; k++) distribution[k] /= total
    for (const id of ids) nodeProbabilities[id] = clamp(nodeProbabilities[id] / total)
    for (const subset of subsets) subset.probability /= total
  }
  return { method: 'exact', distribution, nodeProbabilities, subsets, precisionWarning, ...summarize(distribution) }
}

/** Reproducible 32-bit generator; omitted seeds use Math.random. */
export function seededRandom(seed: string | number): () => number {
  const text = String(seed)
  let state = 2166136261
  for (let i = 0; i < text.length; i++) state = Math.imul(state ^ text.charCodeAt(i), 16777619) >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function outgoingArcs(graph: Graph): Map<string, Arc[]> {
  const outgoing = new Map(graph.nodes.map(node => [node.id, [] as Arc[]]))
  for (const arc of graphArcs(graph)) outgoing.get(arc.source)!.push(arc)
  return outgoing
}

/** FIFO source processing and graph edge order define eligibility and causation. */
export function runTrial(graph: Graph, rng: () => number = Math.random): Trial {
  validateGraph(graph)
  const outgoing = outgoingArcs(graph)
  const activated = [graph.source]
  const seen = new Set(activated)
  const trace: TransmissionAttempt[] = []
  for (let cursor = 0; cursor < activated.length; cursor++) {
    for (const arc of outgoing.get(activated[cursor])!) {
      if (seen.has(arc.target)) continue
      const success = rng() < arc.probability
      trace.push({ arcId: arc.id, source: arc.source, target: arc.target, success })
      if (success) { seen.add(arc.target); activated.push(arc.target) }
    }
  }
  return { activated, trace }
}

function wilson(successes: number, trials: number): { low: number; high: number } {
  const z = 1.959963984540054
  const p = successes / trials
  const denominator = 1 + z * z / trials
  const center = (p + z * z / (2 * trials)) / denominator
  const half = z * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) }
}

export function simulate(graph: Graph, trials: number, seed?: string | number, onProgress?: (progress: number) => void): ProbabilityResult {
  validateGraph(graph)
  if (!Number.isSafeInteger(trials) || trials < 1 || trials > 10_000_000) throw new Error('Choose an integer trial count between 1 and 10,000,000.')
  const ids = graph.nodes.map(node => node.id)
  const indices = new Map(ids.map((id, i) => [id, i]))
  const arcs = graphArcs(graph)
  const outgoing = Array.from({ length: ids.length }, () => [] as { arc: number; target: number; p: number }[])
  for (let i = 0; i < arcs.length; i++) outgoing[indices.get(arcs[i].source)!].push({ arc: i, target: indices.get(arcs[i].target)!, p: arcs[i].probability })
  const source = indices.get(graph.source)!
  const counts = Array<number>(ids.length + 1).fill(0)
  const nodeCounts = new Float64Array(ids.length)
  const attempts = new Float64Array(arcs.length)
  const causes = new Float64Array(arcs.length)
  const visited = new Int32Array(ids.length)
  const queue = new Int32Array(ids.length)
  const rng = seed === undefined || seed === '' ? Math.random : seededRandom(seed)
  const progressInterval = Math.max(1, Math.ceil(trials / 100))
  onProgress?.(0)
  for (let trial = 1; trial <= trials; trial++) {
    let length = 1
    queue[0] = source
    visited[source] = trial
    for (let cursor = 0; cursor < length; cursor++) {
      const node = queue[cursor]
      nodeCounts[node]++
      for (const arc of outgoing[node]) {
        if (visited[arc.target] === trial) continue
        attempts[arc.arc]++
        if (rng() < arc.p) {
          causes[arc.arc]++
          visited[arc.target] = trial
          queue[length++] = arc.target
        }
      }
    }
    counts[length]++
    if (trial % progressInterval === 0 || trial === trials) onProgress?.(trial / trials)
  }
  const distribution = counts.map(count => count / trials)
  const nodeProbabilities = Object.fromEntries(ids.map((id, i) => [id, nodeCounts[i] / trials]))
  return {
    method: 'simulation', distribution, nodeProbabilities, trials,
    confidenceIntervals: counts.map(count => wilson(count, trials)),
    arcs: arcs.map((arc, i) => ({ id: arc.id, source: arc.source, target: arc.target, configured: arc.probability, sourceProbability: nodeProbabilities[arc.source], attemptProbability: attempts[i] / trials, causeProbability: causes[i] / trials })),
    ...summarize(distribution),
  }
}
