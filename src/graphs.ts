import type { Graph } from './model';

export const presets = ['Reddit lattice', 'Diamond', 'Triangle', 'Chain', 'Ring', 'Star', 'Complete', 'Square grid', 'Triangular lattice', 'Random', 'Empty'] as const;
export type Preset = typeof presets[number];

export function createGraph(preset: Preset, count = 8, mode: Graph['mode'] = 'undirected', probability = 0.1): Graph {
  if (preset === 'Reddit lattice') return createRedditGraph(probability);
  const n = preset === 'Empty' ? 0 : preset === 'Diamond' ? 4 : preset === 'Triangle' ? 3 : Math.max(1, Math.min(200, Math.floor(count)));
  const ids = preset === 'Diamond' ? ['1', 'A', 'B', 'C'] : Array.from({ length: n }, (_, i) => String(i + 1));
  const width = Math.ceil(Math.sqrt(n));
  const nodes = ids.map((id, i) => {
    let x = 310 + 190 * Math.cos(2 * Math.PI * i / n - Math.PI / 2);
    let y = 230 + 170 * Math.sin(2 * Math.PI * i / n - Math.PI / 2);
    if (preset === 'Diamond') [x, y] = [[310, 65], [125, 250], [310, 400], [495, 250]][i];
    if (preset === 'Chain') { x = 80 + i * 100; y = 230; }
    if (preset === 'Star' && i === 0) { x = 310; y = 230; }
    if (preset.includes('grid') || preset.includes('lattice')) { x = 100 + (i % width) * 105 + (preset.includes('lattice') && Math.floor(i / width) % 2 ? 52 : 0); y = 90 + Math.floor(i / width) * 95; }
    return { id, x, y };
  });
  const pairs: [number, number][] = [];
  const add = (a: number, b: number) => { if (a !== b && b < n && !pairs.some(([u, v]) => (u === a && v === b) || (u === b && v === a))) pairs.push([a, b]); };
  if (preset === 'Diamond') [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3]].forEach(([a, b]) => add(a, b));
  if (preset === 'Triangle' || preset === 'Ring') { for (let i = 0; i < n; i++) add(i, (i + 1) % n); }
  if (preset === 'Chain') for (let i = 0; i < n - 1; i++) add(i, i + 1);
  if (preset === 'Star') for (let i = 1; i < n; i++) add(0, i);
  if (preset === 'Complete' || preset === 'Random') for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (preset === 'Complete' || Math.random() < Math.min(0.25, 4 / n)) add(i, j);
  if (preset.includes('grid') || preset.includes('lattice')) for (let i = 0; i < n; i++) {
    if ((i + 1) % width) add(i, i + 1);
    add(i, i + width);
    if (preset.includes('lattice')) { const next = i + width + (Math.floor(i / width) % 2 ? 1 : -1); if (next >= 0 && Math.floor(next / width) === Math.floor(i / width) + 1) add(i, next); }
  }
  return { nodes, edges: pairs.map(([a, b], i) => ({ id: `e${i + 1}`, source: ids[a], target: ids[b] })), source: ids[0] || '', probability, mode };
}

/** The supplied 2–3–4–3–2 triangular arrangement; source is the left middle. */
export function createRedditGraph(probability = 0.1): Graph {
  const spacing = 150;
  const rows = [[1, 2], [.5, 1.5, 2.5], [0, 1, 2, 3], [.5, 1.5, 2.5], [1, 2]];
  const coordinates = rows.flatMap((columns, row) => columns.map(column => ({
    x: 80 + column * spacing,
    y: 70 + row * spacing * Math.sqrt(3) / 2,
  })));
  const nodes = coordinates.map((position, index) => ({ id: String(index === 5 ? 1 : index < 5 ? index + 2 : index + 1), ...position }));
  const edges: Graph['edges'] = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) <= spacing * 1.01) edges.push({ id: `e${edges.length + 1}`, source: nodes[i].id, target: nodes[j].id });
  }
  return { nodes, edges, mode: 'symmetric', source: '1', probability };
}

export function changeMode(graph: Graph, mode: Graph['mode']): Graph {
  if (graph.mode === mode) return graph;
  if (mode === 'directed') {
    const ids = new Set([...graph.nodes.map(n => n.id), ...graph.edges.map(e => e.id)]);
    return { ...graph, mode, edges: graph.edges.flatMap(e => {
      let id = `${e.id}-reverse`; let suffix = 1;
      while (ids.has(id)) id = `${e.id}-reverse-${suffix++}`;
      ids.add(id);
      return [e, { ...e, id, source: e.target, target: e.source }];
    }) };
  }
  if (graph.mode !== 'directed') return { ...graph, mode };
  const seen = new Set<string>();
  return { ...graph, mode, edges: graph.edges.filter(e => { const key = JSON.stringify([e.source, e.target].sort()); if (seen.has(key)) return false; seen.add(key); return true; }) };
}
