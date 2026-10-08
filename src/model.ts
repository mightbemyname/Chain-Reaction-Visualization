export type GraphMode = 'undirected' | 'symmetric' | 'directed'

export interface GraphNode { id: string; x: number; y: number }
export interface GraphEdge { id: string; source: string; target: string; probability?: number }
export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  mode: GraphMode
  source: string
  probability: number
}

export interface Arc { id: string; edgeId: string; source: string; target: string; probability: number }

/** Adjacencies in undirected/symmetric modes provide two independent opportunities. */
export function graphArcs(graph: Graph): Arc[] {
  return graph.edges.flatMap(edge => {
    const probability = edge.probability ?? graph.probability
    const arc = { edgeId: edge.id, source: edge.source, target: edge.target, probability }
    return graph.mode === 'directed'
      ? [{ ...arc, id: edge.id }]
      : [{ ...arc, id: `${edge.id}:forward` }, { ...arc, id: `${edge.id}:reverse`, source: edge.target, target: edge.source }]
  })
}

export function validateGraph(graph: Graph): void {
  if (!graph.nodes.length) throw new Error('Add at least one node to calculate activation probabilities.')
  const ids = new Set(graph.nodes.map(node => node.id))
  if (ids.size !== graph.nodes.length) throw new Error('Node IDs must be unique.')
  if (!ids.has(graph.source)) throw new Error('Choose an existing initial activation source.')
  if (!['undirected', 'symmetric', 'directed'].includes(graph.mode)) throw new Error('Unknown graph mode.')
  if (!Number.isFinite(graph.probability) || graph.probability < 0 || graph.probability > 1) throw new Error('Propagation probability must be between 0 and 1.')
  const edgeIds = new Set<string>()
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) throw new Error('Connection IDs must be unique.')
    edgeIds.add(edge.id)
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error('Connections must reference existing nodes.')
    if (edge.probability !== undefined && (!Number.isFinite(edge.probability) || edge.probability < 0 || edge.probability > 1)) throw new Error('Connection probability must be between 0 and 1.')
  }
}
