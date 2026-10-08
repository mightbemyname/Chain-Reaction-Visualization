import { describe, expect, it } from 'vitest'
import type { Graph } from './model'
import { createNodeColorScale } from './colorScale'

const graph: Graph = {
  nodes: ['s', 'a', 'b', 'c'].map(id => ({ id, x: 0, y: 0 })),
  edges: [], source: 's', mode: 'symmetric', probability: .1,
}

describe('adaptive node colour scale', () => {
  it('excludes the source and spreads probabilities across orders of magnitude', () => {
    const scale = createNodeColorScale(graph, { s: 1, a: .00001, b: .001, c: .1 })
    expect(scale.low).toBe(.00001)
    expect(scale.high).toBe(.1)
    expect(scale.map(.00001)).toBe(0)
    expect(scale.map(.1)).toBe(1)
    expect(scale.map(.001)).toBeGreaterThan(.4)
    expect(scale.map(.001)).toBeLessThan(.6)
    expect(scale.map(scale.mid)).toBeCloseTo(.5)
    expect(scale.map(1)).toBe(1)
  })

  it('is monotonic, clamps values and assigns equal values equal colours', () => {
    const scale = createNodeColorScale(graph, { s: 1, a: 0, b: .01, c: .5 })
    const values = [-1, 0, .001, .01, .1, .5, 1, 2].map(scale.map)
    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(values[0]).toBe(0)
    expect(values.at(-1)).toBe(1)
    expect(scale.map(.01)).toBe(scale.map(.01))
    expect(scale.map(NaN)).toBe(0)
  })

  it('handles uniform positive, all-zero and source-only results', () => {
    const uniform = createNodeColorScale(graph, { s: 1, a: .02, b: .02, c: .02 })
    expect(uniform.low).toBe(0)
    expect(uniform.map(.02)).toBe(1)
    expect(Number.isFinite(uniform.mid)).toBe(true)
    for (const scale of [
      createNodeColorScale(graph, { s: 1, a: 0, b: 0, c: 0 }),
      createNodeColorScale({ ...graph, nodes: graph.nodes.slice(0, 1) }, { s: 1 }),
      createNodeColorScale(graph, undefined),
      createNodeColorScale(graph, { s: 1, a: .01 }, false),
    ]) {
      expect(scale.adaptive).toBe(false)
      expect(scale.map(.5)).toBe(.5)
      expect(scale.low).toBe(0)
      expect(scale.high).toBe(1)
    }
  })
})
