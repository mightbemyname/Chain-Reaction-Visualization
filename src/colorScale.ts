import type { Graph } from './model'

const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

/** Adapt the node colour range to calculated probabilities, excluding the certain source. */
export function createNodeColorScale(graph: Graph, probabilities?: Record<string, number>, adaptive = true) {
  const absolute = { map: clamp, low: 0, mid: .5, high: 1, adaptive: false }
  if (!adaptive || !probabilities) return absolute
  const values = graph.nodes.filter(node => node.id !== graph.source)
    .map(node => probabilities[node.id]).filter(value => Number.isFinite(value)).map(clamp)
  const positive = values.filter(value => value > 0)
  if (!positive.length) return absolute
  const high = values.reduce((maximum, value) => Math.max(maximum, value), 0)
  const minimum = values.reduce((minimum, value) => Math.min(minimum, value), 1)
  const low = minimum === high ? 0 : minimum
  const pivot = positive.reduce((minimum, value) => Math.min(minimum, value), 1)
  const transform = (value: number) => {
    const ratio = value / pivot
    return Number.isFinite(ratio) ? Math.log1p(ratio) : Math.log(value) - Math.log(pivot)
  }
  const start = transform(low), end = transform(high)
  const mid = Math.exp(Math.log(pivot) + start + (end - start) / 2) - pivot
  return {
    low, mid, high, adaptive: true,
    map: (value: number) => clamp((transform(clamp(value)) - start) / (end - start)),
  }
}
