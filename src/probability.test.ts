import { describe, expect, it } from 'vitest'
import { graphArcs, type Graph } from './model'
import { EXACT_NODE_LIMIT, exactDistribution, percentile, runTrial, seededRandom, simulate, tail } from './probability'

function graph(n: number, edges: [number, number, number?][], probability = .1, mode: Graph['mode'] = 'undirected'): Graph {
  return {
    nodes: Array.from({ length: n }, (_, i) => ({ id: String(i), x: i * 100, y: 0 })),
    edges: edges.map(([u, v, p], i) => ({ id: `e${i}`, source: String(u), target: String(v), probability: p })),
    source: '0', probability, mode,
  }
}

/** Independent oracle: enumerate every directed live-arc state, then reachability. */
function bruteForce(g: Graph): number[] {
  const arcs = graphArcs(g)
  const distribution = Array<number>(g.nodes.length + 1).fill(0)
  for (let state = 0; state < 2 ** arcs.length; state++) {
    let probability = 1
    const reached = new Set([g.source])
    const live = arcs.filter((arc, i) => {
      const success = !!(state & (1 << i))
      probability *= success ? arc.probability : 1 - arc.probability
      return success
    })
    let changed = true
    while (changed) {
      changed = false
      for (const arc of live) if (reached.has(arc.source) && !reached.has(arc.target)) {
        reached.add(arc.target)
        changed = true
      }
    }
    distribution[reached.size] += probability
  }
  return distribution
}

describe('exact subset calculation', () => {
  it.each([
    ['isolated source', graph(1, []), 1],
    ['two nodes', graph(2, [[0, 1]]), .1],
    ['endpoint line', graph(3, [[0, 1], [1, 2]]), .01],
    ['triangle', graph(3, [[0, 1], [1, 2], [0, 2]]), .028],
    ['five-adjacency diamond', graph(4, [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3]]), .00694],
  ])('%s has its known full activation probability', (_, g, expected) => {
    expect(exactDistribution(g as Graph).all).toBeCloseTo(expected as number, 12)
  })

  it('retains eight source-containing diamond subsets with normalized statistics', () => {
    const result = exactDistribution(graph(4, [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3]]))
    expect(result.subsets).toHaveLength(8)
    expect(result.subsets!.reduce((sum, subset) => sum + subset.probability, 0)).toBeCloseTo(1, 14)
    expect(result.distribution.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14)
    expect(result.mean).toBeCloseTo(Object.values(result.nodeProbabilities).reduce((a, b) => a + b, 0), 13)
    expect(result.sd).toBeGreaterThanOrEqual(0)
    expect(result.all).toBe(result.distribution[4])
    expect(result.nodeProbabilities['0']).toBeCloseTo(1, 14)
  })

  it.each([
    graph(3, [[0, 1], [1, 2], [0, 2]]),
    graph(4, [[0, 1, .2], [1, 2, .7], [0, 2, .4], [2, 3, .9]], .1, 'directed'),
    graph(3, [[1, 0], [0, 2], [2, 1]], .35, 'directed'),
    graph(4, [[0, 1], [2, 3]], .8),
    graph(3, [[0, 1, 0], [1, 2, 1], [0, 2, .6]]),
  ])('agrees with independent live-directed-arc enumeration %#', g => {
    const result = exactDistribution(g)
    const oracle = bruteForce(g)
    for (let k = 0; k < oracle.length; k++) expect(result.distribution[k]).toBeCloseTo(oracle[k], 12)
  })

  it('handles certain/zero transmissions and disconnected directed graphs', () => {
    expect(exactDistribution(graph(3, [[0, 1], [1, 2]], 0)).distribution).toEqual([0, 1, 0, 0])
    expect(exactDistribution(graph(3, [[0, 1], [1, 2]], 1)).distribution).toEqual([0, 0, 0, 1])
    const disconnected = exactDistribution(graph(4, [[0, 1], [2, 3]], 1))
    expect(disconnected.distribution).toEqual([0, 0, 1, 0, 0])
    expect(disconnected.nodeProbabilities['2']).toBe(0)
    expect(exactDistribution(graph(2, [[1, 0]], 1, 'directed')).all).toBe(0)
  })

  it('treats symmetric and undirected adjacencies as independent opposing arcs', () => {
    const g = graph(3, [[0, 1], [1, 2], [0, 2]], .3)
    expect(graphArcs(g)).toHaveLength(6)
    expect(exactDistribution({ ...g, mode: 'symmetric' }).distribution).toEqual(exactDistribution(g).distribution)
  })

  it('multiplies heterogeneous outward failures', () => {
    const result = exactDistribution(graph(3, [[0, 1, .2], [0, 2, .7]], .1, 'directed'))
    const sourceOnly = result.subsets!.find(subset => subset.nodeIds.length === 1)!
    expect(sourceOnly.failureFactors).toEqual([.8, .30000000000000004])
    expect(sourceOnly.failure).toBeCloseTo(.24, 14)
    expect(result.all).toBeCloseTo(.14, 14)
  })

  it('handles parallel directed opportunities and self loops', () => {
    const g = graph(2, [[0, 1, .2], [0, 1, .3], [0, 0, 1]], .1, 'directed')
    expect(exactDistribution(g).all).toBeCloseTo(1 - .8 * .7, 14)
    expect(bruteForce(g)[2]).toBeCloseTo(exactDistribution(g).all, 14)
  })

  it('preserves rare outcomes along long unique paths without cancellation', () => {
    const n = EXACT_NODE_LIMIT
    const g = graph(n, Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as [number, number]), .01)
    const result = exactDistribution(g)
    expect(result.all).toBeGreaterThan(0)
    expect(result.all / (.01 ** (n - 1))).toBeCloseTo(1, 12)
    expect(result.precisionWarning).toBeUndefined()
    expect(result.distribution.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14)
  })

  it('warns when subtraction loses a positive rare cyclic outcome', () => {
    const result = exactDistribution(graph(3, [[0, 1], [1, 2], [0, 2]], 1e-9))
    // The true triangle probability is 3p² - 2p³, below subtraction resolution.
    expect(3 * (1e-9 ** 2) - 2 * (1e-9 ** 3)).toBeGreaterThan(0)
    expect(result.precisionWarning).toContain('displayed zeros may represent positive probabilities')
    expect(result.precisionWarning).toContain('Monte Carlo')
  })

  it.each([1, 1 - 1e-9, .1])('does not warn for well-resolved cyclic outcomes at p=%s', p => {
    const result = exactDistribution(graph(3, [[0, 1], [1, 2], [0, 2]], p))
    expect(result.precisionWarning).toBeUndefined()
    expect(result.all).toBeCloseTo(3 * p ** 2 - 2 * p ** 3, 12)
  })

  it('does not warn for a truly unreachable cyclic subset', () => {
    expect(exactDistribution(graph(4, [[1, 2], [2, 3], [1, 3]], 1e-9)).precisionWarning).toBeUndefined()
  })

  it('enforces calculation limits and valid models', () => {
    expect(() => exactDistribution(graph(EXACT_NODE_LIMIT + 1, []))).toThrow('limited')
    expect(() => exactDistribution(graph(0, []))).toThrow('at least one')
    expect(() => exactDistribution(graph(2, [[0, 1]], 2))).toThrow('between')
  })
})

describe('FIFO Monte Carlo', () => {
  it('reproduces a seed and converges to the exact diamond distribution', () => {
    const g = graph(4, [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3]], .4)
    const estimated = simulate(g, 100_000, 'test-seed')
    expect(simulate(g, 100_000, 'test-seed')).toEqual(estimated)
    const exact = exactDistribution(g)
    for (let k = 1; k <= 4; k++) {
      const standardError = Math.sqrt(exact.distribution[k] * (1 - exact.distribution[k]) / 100_000)
      expect(Math.abs(estimated.distribution[k] - exact.distribution[k])).toBeLessThan(5 * standardError + 1 / 100_000)
    }
    expect(estimated.mean).toBeCloseTo(Object.values(estimated.nodeProbabilities).reduce((a, b) => a + b, 0), 12)
    expect(estimated.confidenceIntervals).toHaveLength(5)
    for (const node of g.nodes) {
      const inboundCauses = estimated.arcs!.filter(arc => arc.target === node.id).reduce((sum, arc) => sum + arc.causeProbability, 0)
      expect(inboundCauses).toBeCloseTo(node.id === g.source ? 0 : estimated.nodeProbabilities[node.id], 12)
    }
    for (const arc of estimated.arcs!) {
      expect(arc.causeProbability).toBeLessThanOrEqual(arc.attemptProbability)
      expect(arc.attemptProbability).toBeLessThanOrEqual(arc.sourceProbability)
    }
  })

  it('allows a failed first attempt to be followed by success from another neighbor', () => {
    const values = [.9, .1, .1]
    const g = graph(3, [[0, 1], [0, 2], [2, 1]], .5, 'directed')
    const trial = runTrial(g, () => values.shift()!)
    expect(trial.activated).toEqual(['0', '2', '1'])
    expect(trial.trace.map(attempt => attempt.success)).toEqual([false, true, true])
  })

  it('does not retry, reactivate, or attempt arcs into an already active target', () => {
    const g = graph(3, [[0, 1], [0, 2], [1, 2]], 1)
    const trial = runTrial(g, () => 0)
    expect(trial.activated).toEqual(['0', '1', '2'])
    expect(trial.trace).toHaveLength(2)
    const result = simulate(g, 10, 1)
    const lateArc = result.arcs!.find(arc => arc.id === 'e2:forward')!
    expect(lateArc.sourceProbability).toBe(1)
    expect(lateArc.configured).toBe(1)
    expect(lateArc.attemptProbability).toBe(0)
    expect(lateArc.causeProbability).toBe(0)
  })

  it('reports progress and validates trial counts', () => {
    const progress: number[] = []
    simulate(graph(1, []), 10, 1, value => progress.push(value))
    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBe(1)
    expect(() => simulate(graph(1, []), 0)).toThrow('trial count')
    expect(runTrial(graph(1, []), seededRandom('x')).activated).toEqual(['0'])
  })

  it('uses the same seeded sampling and FIFO order in animation and simulation', () => {
    const g = graph(4, [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3]], .45)
    for (const seed of ['one', 'two', 'three', 'four']) {
      const trial = runTrial(g, seededRandom(seed))
      const result = simulate(g, 1, seed)
      expect(result.distribution[trial.activated.length]).toBe(1)
      for (const node of g.nodes) expect(result.nodeProbabilities[node.id]).toBe(trial.activated.includes(node.id) ? 1 : 0)
    }
  })
})

it('calculates integer quantiles and inclusive survival tails', () => {
  const distribution = [0, .6, .3, .1]
  expect(percentile(distribution, .5)).toBe(1)
  expect(percentile(distribution, .9)).toBe(2)
  expect(tail(distribution, 2)).toBeCloseTo(.4, 14)
  expect(tail(distribution, 2.1)).toBeCloseTo(.1, 14)
  expect(tail(distribution, 4)).toBe(0)
})
