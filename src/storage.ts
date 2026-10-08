import type { Graph } from './model';
import { createGraph } from './graphs';

export const STORAGE_KEY = 'chain-reaction-lab-v1';
export type SavedState = { version: 1; graph: Graph };
export function serialize(graph: Graph): string { return JSON.stringify({ version: 1, graph }, null, 2); }

export function parseGraph(json: string): Graph {
  const value = JSON.parse(json);
  if (value.version !== 1 || !value.graph || typeof value.graph !== 'object') throw new Error('Expected a version 1 Chain Reaction Lab file.');
  const g = value.graph;
  if (!['undirected', 'symmetric', 'directed'].includes(g.mode)) throw new Error('Unknown graph mode.');
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges) || g.nodes.length > 2000 || g.edges.length > 100000) throw new Error('Graph must contain at most 2,000 nodes and 100,000 connections.');
  const validP = (p: unknown) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;
  if (!validP(g.probability)) throw new Error('Propagation probability must be between 0 and 1.');
  const ids = new Set<string>();
  const nodes = g.nodes.map((node: Record<string, unknown>) => {
    if (!node || typeof node.id !== 'string' || !node.id || node.id.length > 80 || ids.has(node.id)) throw new Error('Node IDs must be unique, nonempty strings (up to 80 characters).');
    if (typeof node.x !== 'number' || typeof node.y !== 'number' || !Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new Error('Node positions must be finite numbers.');
    ids.add(node.id); return { id: node.id, x: node.x, y: node.y };
  });
  if (typeof g.source !== 'string' || (nodes.length ? !ids.has(g.source) : g.source !== '')) throw new Error('The starting node must exist.');
  const edgeIds = new Set<string>(); const pairs = new Set<string>();
  const edges = g.edges.map((e: Record<string, unknown>) => {
    if (!e || typeof e.id !== 'string' || !e.id || e.id.length > 120 || edgeIds.has(e.id) || ids.has(e.id)) throw new Error('Connection IDs must be unique and distinct from node IDs.');
    if (typeof e.source !== 'string' || typeof e.target !== 'string' || !ids.has(e.source) || !ids.has(e.target) || e.source === e.target) throw new Error('Connections must join two existing, different nodes.');
    if (e.probability !== undefined && !validP(e.probability)) throw new Error('Connection probabilities must be between 0 and 1.');
    const pair = JSON.stringify(g.mode === 'directed' ? [e.source, e.target] : [e.source, e.target].sort());
    if (pairs.has(pair)) throw new Error('Duplicate connections are not supported.');
    pairs.add(pair); edgeIds.add(e.id);
    return { id: e.id, source: e.source, target: e.target, ...(e.probability !== undefined ? { probability: e.probability as number } : {}) };
  });
  return { nodes, edges, mode: g.mode, probability: g.probability, source: g.source };
}

export function loadGraph(): { graph: Graph; error?: string } {
  try {
    const shared = new URLSearchParams(location.hash.slice(1)).get('graph');
    if (shared) return { graph: parseGraph(shared) };
    const stored = localStorage.getItem(STORAGE_KEY);
    return { graph: stored ? parseGraph(stored) : createGraph('Reddit lattice') };
  } catch (e) { return { graph: createGraph('Reddit lattice'), error: `Saved graph could not be loaded: ${e instanceof Error ? e.message : String(e)}` }; }
}

export function download(content: string | Blob, name: string, type = 'application/json') {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
