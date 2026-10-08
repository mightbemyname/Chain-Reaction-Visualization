import { describe, expect, it } from 'vitest';
import { createGraph, changeMode } from './graphs';
import { parseGraph, serialize } from './storage';

describe('graph interchange', () => {
  it('round-trips positions, source, mode and individual probabilities', () => {
    const g = createGraph('Diamond'); g.edges[0].probability = 0.27;
    expect(parseGraph(serialize(g))).toEqual(g);
  });
  it('rejects dangling connections and duplicate node IDs', () => {
    const g = createGraph('Triangle'); g.edges[0].target = 'missing';
    expect(() => parseGraph(serialize(g))).toThrow();
    g.nodes[1].id = g.nodes[0].id;
    expect(() => parseGraph(serialize(g))).toThrow();
  });
  it('rejects invalid probabilities and unsupported versions', () => {
    const g = createGraph('Chain', 2); g.probability = -0.1;
    expect(() => parseGraph(serialize(g))).toThrow();
    expect(() => parseGraph('{"version":2}')).toThrow();
  });
  it('expands adjacency into independent arcs when changing mode', () => {
    const g = createGraph('Chain', 3);
    expect(changeMode(g, 'directed').edges).toHaveLength(4);
    expect(changeMode(changeMode(g, 'directed'), 'undirected').edges).toHaveLength(2);
  });
  it('reserves existing edge and node IDs when creating reverse arcs', () => {
    const g = createGraph('Triangle');
    g.edges[1].id = 'e1-reverse';
    g.nodes[2].id = 'e1-reverse-1';
    g.edges.forEach(e => { if (e.source === '3') e.source = 'e1-reverse-1'; if (e.target === '3') e.target = 'e1-reverse-1'; });
    const directed = changeMode(g, 'directed');
    expect(new Set(directed.edges.map(e => e.id)).size).toBe(directed.edges.length);
    expect(parseGraph(serialize(directed))).toEqual(directed);
  });
  it('matches the reference lattice and its three source neighbours', () => {
    const g = createGraph('Reddit lattice');
    expect(g.nodes).toHaveLength(14);
    expect(g.edges).toHaveLength(29);
    expect(g.mode).toBe('symmetric');
    const source = g.nodes.find(n => n.id === g.source)!;
    expect(source.x).toBe(Math.min(...g.nodes.map(n => n.x)));
    expect(source.y).toBeCloseTo((Math.min(...g.nodes.map(n => n.y)) + Math.max(...g.nodes.map(n => n.y))) / 2);
    expect(g.edges.filter(e => e.source === g.source || e.target === g.source)).toHaveLength(3);
    expect(parseGraph(serialize(g))).toEqual(g);
  });
});
