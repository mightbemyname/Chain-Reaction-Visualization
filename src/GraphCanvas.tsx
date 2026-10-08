import { useEffect, useRef, useState } from 'react';
import cytoscape, { type Core, type EventObject } from 'cytoscape';
import type { Graph } from './model';
import type { ProbabilityResult } from './probability';
import { createNodeColorScale } from './colorScale';

export interface GraphCanvasProps {
  graph: Graph;
  result?: ProbabilityResult;
  tool: 'select' | 'connect' | 'add' | 'delete' | 'source';
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (graph: Graph) => void;
  display: {
    nodeLabels: boolean; nodeProbabilities: boolean; nodeColors: boolean; adaptiveNodeColors: boolean;
    edgeLabels: boolean; edgeColors: boolean; directions: boolean;
    rawProbabilities: boolean; lowColor: string; highColor: string;
  };
  highlight: string[];
  animation?: { active: string[]; attempts: { arcId: string; source: string; target: string; success: boolean }[] };
  command?: { action: 'fit' | 'zoomIn' | 'zoomOut' | 'layout'; nonce: number };
}

function gradient(low: string, high: string, value: number) {
  const parse = (hex: string) => {
    const normalized = hex.replace('#', '');
    const full = normalized.length === 3 ? normalized.split('').map(c => c + c).join('') : normalized;
    return [0, 2, 4].map(offset => parseInt(full.slice(offset, offset + 2), 16));
  };
  const start = parse(low), end = parse(high);
  const p = Math.max(0, Math.min(1, value));
  return `rgb(${start.map((n, i) => Math.round(n + (end[i] - n) * p)).join(',')})`;
}

const percent = (value: number | undefined) => value === undefined ? 'calculating…' : `${(value * 100).toFixed(4)}%`;
// Separate namespaces keep arbitrary imported graph IDs from colliding in Cytoscape.
const nodeElementId = (id: string) => `node:${JSON.stringify(id)}`;
const edgeElementId = (id: string, direction: string) => `edge:${JSON.stringify([id, direction])}`;

export default function GraphCanvas(props: GraphCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const connectFrom = useRef<string | null>(null);
  const fitted = useRef(false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const topology = JSON.stringify([props.graph.mode, props.graph.nodes.map(node => node.id), props.graph.edges.map(edge => [edge.id, edge.source, edge.target])]);

  useEffect(() => {
    if (!container.current) return;
    fitted.current = false;
    const cy = cytoscape({
      container: container.current, elements: [], layout: { name: 'preset' },
      minZoom: 0.005, maxZoom: 4, wheelSensitivity: 0.65,
      style: [
        { selector: 'node', style: {
          width: 52, height: 52, 'background-color': 'data(color)', 'border-width': 2,
          'border-color': '#61738b', label: 'data(label)', color: '#f1f5f9',
          'font-size': 12, 'font-weight': 600, 'text-wrap': 'wrap',
          'text-valign': 'center', 'text-halign': 'center', 'text-outline-width': 2,
          'text-outline-color': '#142338', 'overlay-opacity': 0,
        } },
        { selector: 'edge', style: {
          width: 2.5, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)',
          'target-arrow-shape': edge => edge.data('arrow') === 'triangle' ? 'triangle' : 'none', 'curve-style': 'bezier',
          'control-point-step-size': 42, label: 'data(label)', 'font-size': 10,
          color: '#cbd5e1', 'text-background-color': '#101c2b',
          'text-background-opacity': 0.9, 'text-background-padding': '3px',
          'text-rotation': 'autorotate', 'overlay-opacity': 0,
        } },
        { selector: '.source', style: { 'border-width': 6, 'border-color': '#a78bfa', 'border-style': 'double' } },
        { selector: '.chosen', style: { 'overlay-color': '#38bdf8', 'overlay-opacity': 0.22, 'overlay-padding': 8 } },
        { selector: '.pending', style: { 'border-color': '#38bdf8', 'border-width': 5 } },
        { selector: '.highlighted', style: { 'overlay-color': '#a78bfa', 'overlay-opacity': 0.3, 'overlay-padding': 10 } },
        { selector: 'node.active', style: { 'background-color': '#fbbf24', 'border-color': '#fde68a' } },
        { selector: 'edge.success', style: { 'line-color': '#4ade80', 'target-arrow-color': '#4ade80', width: 5 } },
        { selector: 'edge.failure', style: { 'line-color': '#f87171', 'target-arrow-color': '#f87171', 'line-style': 'dashed', width: 4 } },
      ],
    });
    cyRef.current = cy;

    cy.on('tap', (event: EventObject) => {
      const { graph, tool, onChange, onSelect } = latest.current;
      const target = event.target;
      if (target === cy) {
        onSelect(null);
        cy.nodes().removeClass('pending');
        connectFrom.current = null;
        if (tool === 'add') {
          let number = graph.nodes.length + 1;
          while (graph.nodes.some(node => node.id === String(number)) || graph.edges.some(edge => edge.id === String(number))) number++;
          const id = String(number);
          onChange({ ...graph, nodes: [...graph.nodes, { id, x: event.position.x, y: event.position.y }], source: graph.source || id });
        }
        return;
      }
      if (target.isEdge()) {
        const id = target.data('editId') as string;
        onSelect(id);
        if (tool === 'delete') onChange({ ...graph, edges: graph.edges.filter(edge => edge.id !== id) });
        return;
      }
      const id = target.data('originalId') as string;
      onSelect(id);
      if (tool === 'source') onChange({ ...graph, source: id });
      if (tool === 'delete') {
        const nodes = graph.nodes.filter(node => node.id !== id);
        onChange({ ...graph, nodes, edges: graph.edges.filter(edge => edge.source !== id && edge.target !== id), source: graph.source === id ? nodes[0]?.id ?? '' : graph.source });
      }
      if (tool === 'connect') {
        const pending = connectFrom.current;
        const from = pending && graph.nodes.some(node => node.id === pending) ? pending : null;
        cy.nodes().removeClass('pending');
        if (!from) {
          connectFrom.current = id;
          target.addClass('pending');
        } else {
          connectFrom.current = null;
          if (from === id) return;
          const existing = graph.edges.find(edge => edge.source === from && edge.target === id || graph.mode !== 'directed' && edge.source === id && edge.target === from);
          if (existing) onChange({ ...graph, edges: graph.edges.filter(edge => edge.id !== existing.id) });
          else {
            let serial = graph.edges.length + 1;
            while (graph.edges.some(edge => edge.id === `e${serial}`) || graph.nodes.some(node => node.id === `e${serial}`)) serial++;
            onChange({ ...graph, edges: [...graph.edges, { id: `e${serial}`, source: from, target: id }] });
          }
        }
      }
    });
    cy.on('dragfree', 'node', () => {
      const { graph, onChange } = latest.current;
      onChange({ ...graph, nodes: graph.nodes.map(node => ({ ...node, ...cy.getElementById(nodeElementId(node.id)).position() })) });
    });
    cy.on('mouseover', 'node, edge', (event: EventObject) => {
      const { graph, result } = latest.current;
      const element = event.target;
      let text: string;
      if (element.isNode()) {
        const id = element.data('originalId') as string;
        const outgoing = graph.edges.filter(edge => edge.source === id || graph.mode !== 'directed' && edge.target === id).length;
        const incoming = graph.edges.filter(edge => edge.target === id || graph.mode !== 'directed' && edge.source === id).length;
        text = `Node ${id}${graph.source === id ? ' · initial source' : ''}\nActivation: ${percent(result?.nodeProbabilities[id])}\nOutgoing: ${outgoing} · incoming: ${incoming}`;
      } else {
        const source = element.data('originalSource') as string, target = element.data('originalTarget') as string;
        const edge = graph.edges.find(item => item.id === element.data('editId'));
        if (!edge) return;
        const arc = result?.arcs?.find(item => item.id === element.data('arcId'));
        text = `${source} → ${target}\nConditional transmission: ${percent(edge.probability ?? graph.probability)}\nSource activates: ${percent(result?.nodeProbabilities[source])}\nEligible attempt (FIFO simulation): ${arc ? percent(arc.attemptProbability) : 'run simulation'}\nCauses activation (FIFO simulation): ${arc ? percent(arc.causeProbability) : 'run simulation'}`;
        if (graph.mode === 'undirected') text += '\nReverse direction is an independent opportunity.';
      }
      const point = event.renderedPosition ?? { x: cy.width() / 2, y: cy.height() / 2 };
      setTooltip({ text, x: point.x + 15, y: point.y + 15 });
    });
    cy.on('mouseout', 'node, edge', () => setTooltip(null));
    cy.on('pan zoom drag', () => setTooltip(null));
    const resize = new ResizeObserver(() => cy.resize());
    resize.observe(container.current);
    return () => { resize.disconnect(); cy.destroy(); cyRef.current = null; };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const { graph, display, result, selected, animation, highlight } = props;
    const nodeColorScale = createNodeColorScale(graph, result?.nodeProbabilities, display.adaptiveNodeColors);
    const ids = new Set(graph.nodes.map(node => nodeElementId(node.id)));
    const arcMetrics = new Map(result?.arcs?.map(arc => [arc.id, arc] as const));
    const attempted = new Map(animation?.attempts.map(attempt => [attempt.arcId, attempt] as const));
    const edgeElements = graph.edges.flatMap(edge => {
      const directions = [{ source: edge.source, target: edge.target, suffix: 'f' }];
      if (graph.mode === 'symmetric') directions.push({ source: edge.target, target: edge.source, suffix: 'r' });
      return directions.map(direction => {
        const probability = edge.probability ?? graph.probability;
        const arcId = graph.mode === 'directed' ? edge.id : `${edge.id}:${direction.suffix === 'f' ? 'forward' : 'reverse'}`;
        const arc = arcMetrics.get(arcId);
        const showProbability = display.rawProbabilities ? probability : arc?.causeProbability;
        return { group: 'edges' as const, data: {
          id: edgeElementId(edge.id, direction.suffix), source: nodeElementId(direction.source), target: nodeElementId(direction.target),
          originalSource: direction.source, originalTarget: direction.target,
          editId: edge.id, arcId, color: display.edgeColors && showProbability !== undefined ? gradient(display.lowColor, display.highColor, showProbability) : '#566a86',
          arrow: display.directions && graph.mode !== 'undirected' ? 'triangle' : 'none',
          label: display.edgeLabels ? showProbability === undefined ? 'cause: run MC' : `${display.rawProbabilities ? 'p' : 'cause (MC)'} ${(showProbability * 100).toFixed(1)}%` : '',
        } };
      });
    });
    edgeElements.forEach(edge => ids.add(edge.data.id));
    cy.batch(() => {
      cy.elements().filter(element => !ids.has(element.id())).remove();
      graph.nodes.forEach(node => {
        const probability = result?.nodeProbabilities[node.id];
        const label = [display.nodeLabels ? node.id : '', display.nodeProbabilities ? probability === undefined ? '…' : `${(probability * 100).toFixed(1)}%` : ''].filter(Boolean).join('\n');
        const data = { id: nodeElementId(node.id), originalId: node.id, label, color: node.id === graph.source ? '#fbbf24' : display.nodeColors && probability !== undefined ? gradient(display.lowColor, display.highColor, nodeColorScale.map(probability)) : '#263b56' };
        const current = cy.getElementById(nodeElementId(node.id));
        if (current.empty()) cy.add({ group: 'nodes', data, position: { x: node.x, y: node.y } });
        else { current.data(data); if (!current.grabbed()) current.position({ x: node.x, y: node.y }); }
      });
      edgeElements.forEach(edge => {
        const current = cy.getElementById(edge.data.id);
        if (current.empty()) cy.add(edge);
        else if (current.data('source') !== edge.data.source || current.data('target') !== edge.data.target) { current.remove(); cy.add(edge); }
        else current.data(edge.data);
      });
      cy.elements().removeClass('source chosen highlighted active success failure');
      cy.nodes().forEach(node => {
        const id = node.data('originalId') as string;
        node.toggleClass('source', id === graph.source);
        node.toggleClass('chosen', id === selected);
        node.toggleClass('highlighted', highlight.includes(id));
        node.toggleClass('active', animation?.active.includes(id) ?? false);
      });
      cy.edges().forEach(edge => {
        edge.toggleClass('chosen', edge.data('editId') === selected);
        const attempt = attempted.get(edge.data('arcId')) ?? (graph.mode === 'undirected' ? attempted.get(`${edge.data('editId')}:reverse`) : undefined);
        if (attempt) edge.addClass(attempt.success ? 'success' : 'failure');
      });
    });
    if (!fitted.current && graph.nodes.length) { cy.fit(undefined, 65); fitted.current = true; }
  }, [props.graph, props.result, props.display, props.selected, props.highlight, props.animation]);

  useEffect(() => {
    connectFrom.current = null;
    cyRef.current?.nodes().removeClass('pending');
  }, [props.tool, topology]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !props.command) return;
    const action = props.command.action;
    if (action === 'fit') cy.fit(undefined, 65);
    if (action === 'zoomIn' || action === 'zoomOut') cy.zoom({ level: cy.zoom() * (action === 'zoomIn' ? 1.25 : 0.8), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    if (action === 'layout') {
      cy.layout({ name: 'circle', padding: 65, animate: false }).run();
      const { graph, onChange } = latest.current;
      onChange({ ...graph, nodes: graph.nodes.map(node => ({ ...node, ...cy.getElementById(nodeElementId(node.id)).position() })) });
    }
  }, [props.command]);

  return <div className="graph-canvas-shell" style={{ position: 'relative', height: '100%', minHeight: 420, overflow: 'hidden' }}>
    <div ref={container} className="graph-canvas" style={{ height: '100%', minHeight: 420, width: '100%' }} role="img" aria-label="Interactive graph. Use editing tools to add nodes and connections." />
    {tooltip && <div className="graph-tooltip" style={{ position: 'absolute', left: Math.min(tooltip.x, Math.max(8, (container.current?.clientWidth ?? 400) - 290)), top: Math.min(tooltip.y, Math.max(8, (container.current?.clientHeight ?? 420) - 170)), whiteSpace: 'pre-line', pointerEvents: 'none', maxWidth: 280, padding: '10px 12px', background: '#0b1325f2', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, fontSize: 12, zIndex: 5 }}>{tooltip.text}</div>}
  </div>;
}
