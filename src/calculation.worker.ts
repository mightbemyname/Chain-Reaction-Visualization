import type { Graph } from './model'
import { EXACT_NODE_LIMIT, exactDistribution, simulate } from './probability'

export interface CalculationRequest {
  id: number
  graph: Graph
  kind: 'exact' | 'simulation' | 'comparison'
  trials?: number
  seed?: string | number
  probabilities?: number[]
}

self.onmessage = (event: MessageEvent<CalculationRequest>) => {
  const { id, graph, kind, trials = 10_000, seed, probabilities = [] } = event.data
  try {
    if (kind === 'comparison') {
      const results = probabilities.map((probability, index) => {
        const configured = { ...graph, probability }
        const calculated = graph.nodes.length <= EXACT_NODE_LIMIT ? exactDistribution(configured) : simulate(configured, trials, seed)
        // Comparisons use summary/bin statistics; avoid cloning every subset or arc.
        const { subsets: _subsets, arcs: _arcs, ...result } = calculated
        self.postMessage({ id, type: 'progress', progress: (index + 1) / probabilities.length })
        return { probability, result }
      })
      self.postMessage({ id, type: 'result', results })
    } else {
      const result = kind === 'exact' ? exactDistribution(graph) : simulate(graph, trials, seed, progress => self.postMessage({ id, type: 'progress', progress }))
      self.postMessage({ id, type: 'result', result })
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : 'Calculation failed.' })
  }
}
