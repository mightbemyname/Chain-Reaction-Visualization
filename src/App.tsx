import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, Check, ChevronDown, CirclePlus, Download, Eraser, Expand, FlaskConical, GitBranch, Link2, MousePointer2, Pause, Play, Plus, Redo2, RotateCcw, Share2, SkipForward, Target, Trash2, Undo2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Graph } from './model';
import { EXACT_NODE_LIMIT, runTrial, seededRandom, tail, type Trial } from './probability';
import GraphCanvas, { type GraphCanvasProps } from './GraphCanvas';
import { createGraph, changeMode, presets, type Preset } from './graphs';
import { download, loadGraph, parseGraph, serialize, STORAGE_KEY } from './storage';
import { useCalculation } from './useCalculation';
import { ComparisonCharts, DistributionChart, pct } from './Charts';
import { createNodeColorScale } from './colorScale';
import { formatFullActivationPercent, formatInverseOdds } from './format';

type Tool = GraphCanvasProps['tool'];
const tools: { id: Tool; title: string; icon: typeof MousePointer2; key: string }[] = [
  { id: 'select', title: 'Select', icon: MousePointer2, key: 'V' }, { id: 'add', title: 'Add node', icon: CirclePlus, key: 'N' },
  { id: 'connect', title: 'Connect', icon: Link2, key: 'E' }, { id: 'source', title: 'Set source', icon: Target, key: 'S' }, { id: 'delete', title: 'Delete', icon: Eraser, key: 'D' },
];
const initialDisplay: GraphCanvasProps['display'] = { nodeLabels: true, nodeProbabilities: true, nodeColors: true, adaptiveNodeColors: true, edgeLabels: false, edgeColors: false, directions: true, rawProbabilities: true, lowColor: '#db6574', highColor: '#55c99f' };
const defaultProbabilities = '0, 5, 10, 20, 30, 50, 75, 100';

export default function App() {
  const [loaded] = useState(loadGraph);
  const [graph, setGraph] = useState<Graph>(loaded.graph);
  const graphRef = useRef(graph); graphRef.current = graph;
  const [undo, setUndo] = useState<Graph[]>([]); const [redo, setRedo] = useState<Graph[]>([]);
  const [tool, setTool] = useState<Tool>('select'); const [selected, setSelected] = useState<string | null>(null);
  const [count, setCount] = useState(8); const [preset, setPreset] = useState<Preset>('Reddit lattice');
  const [command, setCommand] = useState<GraphCanvasProps['command']>();
  const [display, setDisplay] = useState(initialDisplay);
  const [tab, setTab] = useState<'distribution' | 'compare' | 'math'>('distribution');
  const [message, setMessage] = useState(loaded.error || '');
  const [trials, setTrials] = useState(10000); const [seed, setSeed] = useState('');
  const [autoSimulation, setAutoSimulation] = useState(false); const [simRevision, setSimRevision] = useState(0);
  const [simEnabled, setSimEnabled] = useState(false); const [useSimulation, setUseSimulation] = useState(false);
  const [threshold, setThreshold] = useState(3); const [thresholdPercent, setThresholdPercent] = useState(75);
  const [probabilityText, setProbabilityText] = useState(defaultProbabilities); const [probabilities, setProbabilities] = useState([0, .05, .1, .2, .3, .5, .75, 1]);
  const [overlay, setOverlay] = useState<number[]>([]); const [comparisonActive, setComparisonActive] = useState(false);
  const [compareThresholdA, setCompareThresholdA] = useState(50); const [compareThresholdB, setCompareThresholdB] = useState(75);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [trial, setTrial] = useState<Trial>(); const [step, setStep] = useState(0); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(650);
  const fileInput = useRef<HTMLInputElement>(null);
  const n = graph.nodes.length;
  const exactAvailable = n > 0 && n <= EXACT_NODE_LIMIT;
  const exact = useCalculation(graph, 'exact', exactAvailable, trials, seed);
  const simulation = useCalculation(graph, 'simulation', n > 0 && (autoSimulation || simEnabled || !exactAvailable), trials, seed, simRevision);
  const comparison = useCalculation(graph, 'comparison', comparisonActive && n > 0, Math.min(trials, 100000), seed, 0, probabilities);
  const result = useSimulation && simulation.result ? simulation.result : exact.result || simulation.result;
  const busy = exact.busy || (!exactAvailable && simulation.busy);

  function commit(next: Graph) {
    const previous = graphRef.current;
    if (JSON.stringify(next) === JSON.stringify(previous)) return;
    setUndo(h => [...h.slice(-79), previous]); setRedo([]); setGraph(next);
  }
  function undoEdit() { if (!undo.length) return; setRedo(h => [...h, graph]); setGraph(undo[undo.length - 1]); setUndo(h => h.slice(0, -1)); setSelected(null); }
  function redoEdit() { if (!redo.length) return; setUndo(h => [...h, graph]); setGraph(redo[redo.length - 1]); setRedo(h => h.slice(0, -1)); setSelected(null); }
  function canvasCommand(action: NonNullable<GraphCanvasProps['command']>['action']) { setCommand(c => ({ action, nonce: (c?.nonce || 0) + 1 })); }
  function replaceGraph(next: Graph) { commit(next); setSelected(null); setHighlight([]); setTimeout(() => canvasCommand('fit'), 0); }
  function deleteSelected() {
    if (!selected) return;
    const nodes = graph.nodes.filter(node => node.id !== selected);
    commit({ ...graph, nodes, edges: graph.edges.filter(edge => edge.id !== selected && edge.source !== selected && edge.target !== selected), source: graph.source === selected ? nodes[0]?.id || '' : graph.source });
    setSelected(null);
  }
  function addNode() {
    let id = 1; const ids = new Set([...graph.nodes.map(node => node.id), ...graph.edges.map(e => e.id)]); while (ids.has(String(id))) id++;
    commit({ ...graph, nodes: [...graph.nodes, { id: String(id), x: 250 + Math.random() * 130, y: 160 + Math.random() * 130 }], source: graph.source || String(id) });
  }
  function startTrial(play = true) { if (!n) return; setTrial(runTrial(graph, seed ? seededRandom(seed) : Math.random)); setStep(0); setPlaying(play); setHighlight([]); }
  const topologyKey = JSON.stringify({ nodes: graph.nodes.map(node => node.id), edges: graph.edges, source: graph.source, mode: graph.mode, probability: graph.probability });
  useEffect(() => { setTrial(undefined); setPlaying(false); setStep(0); setHighlight([]); setSimEnabled(false); }, [topologyKey]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, serialize(graph)); } catch { setMessage('Browser storage is unavailable or full. Export JSON to keep your graph.'); }
  }, [graph]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 8000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    if (!playing || !trial) return;
    if (step >= trial.trace.length) { setPlaying(false); return; }
    const timer = setTimeout(() => setStep(s => s + 1), speed); return () => clearTimeout(timer);
  }, [playing, trial, step, speed]);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, select, textarea, [contenteditable=true]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoEdit() : undoEdit(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoEdit(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
      if (e.key === 'Escape') { setSelected(null); setTool('select'); setHighlight([]); setPlaying(false); }
      if (e.key.toLowerCase() === 'f') canvasCommand('fit');
      tools.forEach(t => { if (e.key.toUpperCase() === t.key) setTool(t.id); });
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  });
  async function share() {
    const url = new URL(location.href); url.hash = new URLSearchParams({ graph: serialize(graph) }).toString();
    try { await navigator.clipboard.writeText(url.toString()); setMessage(`Graph link copied${url.toString().length > 8000 ? ' · this large link may exceed some apps’ URL limits; JSON export is more reliable' : ''}.`); }
    catch { setMessage('Clipboard unavailable. A share link is now in the address bar; copy it from there.'); history.replaceState(null, '', url); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 15000000) { setMessage('That file is too large. Choose a graph JSON file under 15 MB.'); return; }
    try { replaceGraph(parseGraph(await file.text())); setMessage('Graph imported.'); } catch (e) { setMessage(`Import failed: ${e instanceof Error ? e.message : String(e)}`); }
  }
  useEffect(() => {
    const loadSharedHash = () => {
      const shared = new URLSearchParams(location.hash.slice(1)).get('graph');
      if (!shared) return;
      try { replaceGraph(parseGraph(shared)); } catch (e) { setMessage(`Shared graph could not be loaded: ${e instanceof Error ? e.message : String(e)}`); }
    };
    window.addEventListener('hashchange', loadSharedHash);
    return () => window.removeEventListener('hashchange', loadSharedHash);
  }, []);
  function updateProbabilities() {
    const parts = probabilityText.split(',').map(s => s.trim()); const values = parts.map(Number);
    if (parts.some(s => !s) || values.some(v => !Number.isFinite(v) || v < 0 || v > 100) || values.length > 25) { setMessage('Enter up to 25 comma-separated percentages between 0 and 100.'); return; }
    setProbabilities([...new Set(values.map(v => v / 100))].sort((a, b) => a - b)); setComparisonActive(true);
  }
  const selectedNode = graph.nodes.find(node => node.id === selected);
  const selectedEdge = graph.edges.find(edge => edge.id === selected);
  const attempts = trial?.trace.slice(0, step) || [];
  const active = trial ? [graph.source, ...attempts.filter(a => a.success).map(a => a.target)] : [];
  const overlayResults = comparison.results.filter(c => overlay.includes(c.probability));
  const colorScale = createNodeColorScale(graph, result?.nodeProbabilities, display.adaptiveNodeColors);
  const numerical = (v?: number, digits = 3) => v === undefined ? '—' : v.toFixed(digits);
  const toggleDisplay = (key: keyof typeof initialDisplay) => setDisplay(d => ({ ...d, [key]: !d[key] }));

  return <div className="app-shell">
    <header className="app-header"><a className="brand" href={location.pathname} aria-label="Chain Reaction Lab home"><span className="brand-icon"><GitBranch size={24} /></span><span>Chain Reaction <strong>Lab</strong><small>THE PROBABILITY PLAYGROUND</small></span></a><div className="header-middle"><span className="status-dot" /> Client-side. Open-ended.</div><div className="header-actions"><button onClick={() => fileInput.current?.click()}><Upload size={15} /><span>Import</span></button><button onClick={() => download(serialize(graph), 'chain-reaction-graph.json')}><Download size={15} /><span>Export</span></button><button className="primary" onClick={share}><Share2 size={15} /><span>Share graph</span></button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></div></header>
    <div className="intro"><div><div className="eyebrow">EXPLORE • CONNECT • DISCOVER</div><h1>One spark. How far does it go?</h1><p>Build a graph and discover the mathematics of a chain reaction.</p></div><div className="model-badge"><FlaskConical size={17} /><span>Independent cascade model<small>Every connection is a new chance.</small></span></div></div>
    <main className="laboratory">
      <aside className="panel editor-panel">
        <div className="panel-heading"><h2>Graph builder</h2><span className="tiny-tag">01</span></div>
        <div className="tool-grid">{tools.map(t => <button key={t.id} aria-label={t.title} title={`${t.title} (${t.key})`} className={tool === t.id ? 'tool active' : 'tool'} onClick={() => setTool(t.id)}><t.icon size={18} /><span>{t.title}</span><kbd aria-hidden="true">{t.key}</kbd></button>)}</div>
        <p className="help-text">{tool === 'connect' ? 'Click two nodes to toggle a connection. The first node is the source of a directed arc.' : tool === 'add' ? 'Click the canvas to place a node.' : tool === 'source' ? 'Click a node to make it the initial activation source.' : tool === 'delete' ? 'Click a node or connection to remove it.' : 'Drag nodes to arrange. Click to inspect. Scroll to zoom.'}</p>
        <div className="history-row"><button disabled={!undo.length} onClick={undoEdit} title="Undo (Ctrl+Z)"><Undo2 size={15} /> Undo</button><button disabled={!redo.length} onClick={redoEdit} title="Redo (Ctrl+Shift+Z)"><Redo2 size={15} /> Redo</button></div>
        <div className="divider" />
        <label className="field-label" htmlFor="graph-mode">CONNECTION MODE</label><select id="graph-mode" value={graph.mode} onChange={e => { commit(changeMode(graph, e.target.value as Graph['mode'])); setSelected(null); }}><option value="undirected">Undirected adjacency</option><option value="symmetric">Symmetric directed</option><option value="directed">General directed</option></select>
        <p className="help-text">{graph.mode === 'directed' ? 'Each arrow transmits in one direction.' : 'Each adjacency has two independent directional opportunities.'}{graph.mode === 'directed' ? '' : ' Switching from directed merges pairs; the first arc’s override is kept.'}</p>
        <div className="divider" /><div className="label-row"><span className="field-label">START WITH A PRESET</span><GitBranch size={13} /></div>
        <div className="preset-grid">{presets.map(p => <button key={p} className={preset === p ? 'preset active' : 'preset'} onClick={() => { setPreset(p); replaceGraph(createGraph(p, count, graph.mode, graph.probability)); }}><span className="preset-symbol" aria-hidden="true">{p === 'Diamond' ? '◇' : p === 'Triangle' ? '△' : p === 'Chain' ? '╌' : p === 'Ring' ? '○' : p === 'Star' ? '✳' : p === 'Complete' ? '⌘' : p.includes('grid') ? '▦' : p.includes('lattice') ? '⋰' : p === 'Random' ? '⁙' : '＋'}</span>{p}</button>)}</div>
        <div className="inline-field"><label htmlFor="initial-count">Preset node count</label><input id="initial-count" type="number" min="1" max="200" value={count} onChange={e => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} /></div><button className="full" onClick={() => replaceGraph(createGraph(preset, count, graph.mode, graph.probability))}>Generate {preset.toLowerCase()} <ArrowRight size={14} /></button>
        <div className="divider" />
        <div className="selection-box"><span className="field-label">INSPECT SELECTION</span>{selectedNode ? <><h3>Node {selectedNode.id}</h3><p className="muted">Activation probability: {result ? pct(result.nodeProbabilities[selectedNode.id], 6) : 'calculating…'}</p><button className="full" onClick={() => commit({ ...graph, source: selectedNode.id })}><Target size={14} /> Set as initial source</button></> : selectedEdge ? <><h3>{selectedEdge.source} {graph.mode === 'directed' ? '→' : '↔'} {selectedEdge.target}</h3><label className="check"><input type="checkbox" checked={selectedEdge.probability !== undefined} onChange={e => commit({ ...graph, edges: graph.edges.map(edge => edge.id === selected ? { ...edge, probability: e.target.checked ? graph.probability : undefined } : edge) })} /> Override probability</label>{selectedEdge.probability !== undefined && <div className="inline-field"><label htmlFor="edge-prob">Transmission (%)</label><input id="edge-prob" type="number" min="0" max="100" step="0.1" value={selectedEdge.probability * 100} onChange={e => commit({ ...graph, edges: graph.edges.map(edge => edge.id === selected ? { ...edge, probability: Math.max(0, Math.min(1, Number(e.target.value) / 100)) } : edge) })} /></div>}<p className="help-text">Hover the connection for conditional probability and simulation-only attempt and causation metrics.</p></> : <p className="muted">Select a node or connection to inspect it.</p>}{selected && <button className="danger full" onClick={deleteSelected}><Trash2 size={14} /> Delete selection</button>}</div>
      </aside>

      <section className="panel graph-panel">
        <div className="canvas-header"><div><span className="status-dot" /><h2>Graph canvas</h2><span className="muted">{n} nodes <span className="dot-separator">·</span> {graph.edges.length} connections</span></div><span className="tiny-tag">{graph.mode === 'directed' ? 'DIRECTED' : graph.mode === 'symmetric' ? 'SYMMETRIC' : 'UNDIRECTED'}</span></div>
        <div className="canvas-body"><div className="canvas-source"><Target size={13} /> INITIAL SOURCE <strong>{graph.source || '—'}</strong></div>
          <GraphCanvas graph={graph} result={simulation.result?.arcs && result ? { ...result, arcs: simulation.result.arcs } : result} tool={tool} selected={selected} onSelect={setSelected} onChange={commit} display={display} highlight={highlight} animation={trial ? { active, attempts } : undefined} command={command} />
          {!n && <div className="canvas-empty"><CirclePlus size={30} /><h3>A blank canvas. A new possibility.</h3><p>Add your first node or choose a preset.</p><button className="primary" onClick={addNode}><Plus size={15} /> Add a node</button></div>}
          <div className="canvas-controls"><button title="Zoom in" aria-label="Zoom in" onClick={() => canvasCommand('zoomIn')}><ZoomIn size={17} /></button><button title="Zoom out" aria-label="Zoom out" onClick={() => canvasCommand('zoomOut')}><ZoomOut size={17} /></button><div /><button title="Fit graph (F)" aria-label="Fit graph" onClick={() => canvasCommand('fit')}><Expand size={17} /></button><button title="Reset layout" aria-label="Reset layout" onClick={() => canvasCommand('layout')}><RotateCcw size={16} /></button></div>
          <div className="canvas-legend"><span>{colorScale.adaptive ? 'Activation · adaptive (source excluded)' : 'Activation probability'}</span><div className="gradient" style={{ background: `linear-gradient(90deg, ${display.lowColor}, ${display.highColor})` }} /><div className="legend-values"><span>{pct(colorScale.low, 2)}</span><span>{pct(colorScale.mid, 2)}</span><span>{pct(colorScale.high, 2)}</span></div></div>
          <span className="resize-hint">↕ Drag corner to resize</span>
        </div>
        <div className="playback"><div className="playback-title"><Activity size={17} /><div><strong>Watch a cascade</strong><small>{trial ? `${active.length} of ${n} active · ${step}/${trial.trace.length} attempts${step === trial.trace.length ? ' · complete' : ''}` : 'One experiment. Every attempt, made visible.'}</small></div></div><div className="playback-buttons"><button className="primary" disabled={!n} onClick={() => { if (!trial || step === trial.trace.length) startTrial(); else setPlaying(p => !p); }}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : 'Asplode!'}</button><button title="Step one attempt" aria-label="Step one attempt" disabled={!n} onClick={() => { setPlaying(false); if (!trial) startTrial(false); else setStep(s => Math.min(trial.trace.length, s + 1)); }}><SkipForward size={16} /></button><button title="Restart experiment" aria-label="Restart experiment" disabled={!n} onClick={() => startTrial(false)}><RotateCcw size={15} /></button><select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1300}>0.5×</option><option value={650}>1×</option><option value={250}>2.5×</option><option value={80}>8×</option></select></div></div>
        {trial && <div className="trace-log"><span className="muted">FIFO · source then connection order</span>{attempts.slice(-4).map((a, i) => <span key={i} className={a.success ? 'success-text' : 'failure-text'}>{a.source} → {a.target} {a.success ? 'activated' : 'failed'}</span>)}<button className="subtle" onClick={() => { setTrial(undefined); setPlaying(false); }}>Clear</button></div>}
      </section>

      <aside className="panel stats-panel">
        <div className="panel-heading"><h2>Propagation</h2><span className="tiny-tag">02</span></div>
        <div className="probability-number"><span>{(graph.probability * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}<small>%</small></span><span className="probability-label">chance per<br />transmission</span></div>
        <input className="probability-slider" aria-label="Global propagation probability" type="range" min="0" max="100" step="0.1" value={graph.probability * 100} onChange={e => commit({ ...graph, probability: Number(e.target.value) / 100 })} />
        <div className="range-labels"><span>0%</span><span>50%</span><span>100%</span></div><div className="inline-field"><label htmlFor="global-prob">Exact value (%)</label><input id="global-prob" type="number" min="0" max="100" step="0.01" value={Number((graph.probability * 100).toFixed(8))} onChange={e => commit({ ...graph, probability: Math.max(0, Math.min(1, Number(e.target.value) / 100)) })} /></div>
        <div className="divider" /><div className="label-row"><span className="field-label">LIVE STATISTICS</span><span className={`method-badge ${busy ? 'calculating' : ''}`}>{busy ? 'CALCULATING' : result?.method === 'exact' ? 'EXACT' : result ? 'MONTE CARLO' : 'READY'}</span></div>
        <div className="stat-hero"><span>All nodes activate</span><strong>{result ? formatFullActivationPercent(result.all) : '—'}</strong>{result && <span className="inverse-odds">{result.all > 0 ? `≈ ${formatInverseOdds(result.all)}` : result.method === 'simulation' ? 'No full activations observed' : formatInverseOdds(0)}</span>}<small>Probability of a complete cascade</small></div>
        <div className="stat-grid"><div><span>Expected count</span><strong>{numerical(result?.mean)}</strong><small>out of {n} nodes</small></div><div><span>Std. deviation</span><strong>{numerical(result?.sd)}</strong><small>σ · population</small></div><div><span>Median</span><strong>{result?.median ?? '—'}</strong><small>50th percentile</small></div><div><span>Middle 80%</span><strong>{result ? `${result.p10}–${result.p90}` : '—'}</strong><small>10th–90th percentile</small></div></div>
        <div className="thresholds"><div className="inline-field"><label htmlFor="threshold">Activated nodes K</label><input id="threshold" type="number" min="1" max={Math.max(n, 1)} value={threshold} onChange={e => setThreshold(Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></div><div className="metric-row"><span>P(K = {threshold})</span><strong>{result ? pct(result.distribution[threshold] || 0, 5) : '—'}</strong></div><div className="metric-row"><span>P(K ≥ {threshold})</span><strong>{result ? pct(tail(result.distribution, threshold), 5) : '—'}</strong></div><div className="inline-field"><label htmlFor="threshold-percent">At least (%) of nodes</label><input id="threshold-percent" type="number" min="0" max="100" value={thresholdPercent} onChange={e => setThresholdPercent(Math.max(0, Math.min(100, Number(e.target.value))))} /></div><div className="metric-row"><span>P(K ≥ {Math.ceil(n * thresholdPercent / 100)})</span><strong>{result ? pct(tail(result.distribution, n * thresholdPercent / 100), 5) : '—'}</strong></div></div>
        <details className="settings-details"><summary>Calculation & simulation <ChevronDown size={14} /></summary><p className="help-text">Exact subset DP: up to {EXACT_NODE_LIMIT} nodes. {n > EXACT_NODE_LIMIT ? 'This graph uses Monte Carlo automatically.' : 'Simulate to compare with the exact result.'}</p><label className="field-label" htmlFor="trials">SIMULATION TRIALS</label><select id="trials" value={[1000, 10000, 100000, 1000000].includes(trials) ? trials : 'custom'} onChange={e => e.target.value === 'custom' ? setTrials(50000) : setTrials(Number(e.target.value))}><option value={1000}>1,000</option><option value={10000}>10,000</option><option value={100000}>100,000</option><option value={1000000}>1,000,000</option><option value="custom">Custom</option></select><div className="inline-field"><label htmlFor="custom-trials">Trial count</label><input id="custom-trials" type="number" min="1" max="10000000" value={trials} onChange={e => setTrials(Math.max(1, Math.min(10000000, Math.floor(Number(e.target.value) || 1))))} /></div><label className="field-label" htmlFor="seed">RANDOM SEED · OPTIONAL</label><input id="seed" type="text" placeholder="e.g. curious-cascade" value={seed} onChange={e => setSeed(e.target.value)} /><p className="help-text">Used by both simulations and animation. Same graph + seed = same experiment.</p><label className="check"><input type="checkbox" checked={autoSimulation} onChange={e => setAutoSimulation(e.target.checked)} /> Simulate automatically after edits</label><label className="check"><input type="checkbox" checked={useSimulation} onChange={e => setUseSimulation(e.target.checked)} /> Use simulation estimates in statistics</label><div className="history-row"><button className="primary" disabled={!n} onClick={() => { setSimEnabled(true); setSimRevision(r => r + 1); }}><Play size={13} /> Run</button><button disabled={!simulation.busy} onClick={simulation.cancel}>Cancel</button></div>{simulation.busy && <><progress value={simulation.progress} max="1" /><small className="muted">{(simulation.progress * 100).toFixed(0)}% complete</small></>}{simulation.result && <p className="help-text">{simulation.result.trials?.toLocaleString()} trials · P(all) {pct(simulation.result.all, 5)}<br />95% Wilson interval: {pct(simulation.result.confidenceIntervals?.[n]?.low || 0, 5)}–{pct(simulation.result.confidenceIntervals?.[n]?.high || 0, 5)}. Rare events may require more trials.</p>}{simulation.status === 'cancelled' && <p className="muted">Simulation cancelled.</p>}</details>
        <details className="settings-details"><summary>Graph display <ChevronDown size={14} /></summary>{([
          ['nodeProbabilities', 'Node activation probabilities'], ['nodeColors', 'Colour nodes by activation chance'], ['adaptiveNodeColors', 'Adaptive colour curve (exclude source)'], ['nodeLabels', 'Node IDs'], ['edgeLabels', 'Connection probability labels'], ['edgeColors', 'Colour connections by transmission'], ['rawProbabilities', 'Raw conditional p (otherwise simulated causation)'], ['directions', 'Connection directions'],
        ] as const).map(([key, label]) => <label className="check" key={key}><input type="checkbox" checked={display[key]} onChange={() => toggleDisplay(key)} />{label}</label>)}<p className="help-text">Attempt and causation are simulation-only and depend on FIFO order. Configured p is conditional on an eligible attempt.</p><div className="inline-field"><label htmlFor="low-color">Low probability</label><input id="low-color" type="color" value={display.lowColor} onChange={e => setDisplay(d => ({ ...d, lowColor: e.target.value }))} /></div><div className="inline-field"><label htmlFor="high-color">High probability</label><input id="high-color" type="color" value={display.highColor} onChange={e => setDisplay(d => ({ ...d, highColor: e.target.value }))} /></div></details>
        {(exact.error || simulation.error) && <p className="error-message" role="alert">{exact.error || simulation.error}</p>}
        {result?.precisionWarning && <p className="notice" role="status">{result.precisionWarning}</p>}
      </aside>
    </main>

    <section className="analysis-section panel"><div className="analysis-nav"><div className="analysis-tabs"><button className={tab === 'distribution' ? 'active' : ''} onClick={() => setTab('distribution')}><Activity size={15} /> Distribution</button><button className={tab === 'compare' ? 'active' : ''} onClick={() => { setTab('compare'); setComparisonActive(true); }}><GitBranch size={15} /> Compare probabilities</button><button className={tab === 'math' ? 'active' : ''} onClick={() => setTab('math')}><FlaskConical size={15} /> Behind the maths</button></div><span className="analysis-note"><span className="status-dot" /> Updates as you explore</span></div>
      {tab === 'distribution' && <DistributionChart result={result} simulated={exact.result ? simulation.result : undefined} overlays={overlayResults} />}
      {tab === 'compare' && <div className="analysis-content"><div className="section-title"><div><h2>A small change. A different cascade.</h2><p>Compare global probabilities. Connection overrides stay fixed.</p></div><span className="method-badge">{exactAvailable ? 'EXACT' : 'SIMULATED'}</span></div><div className="comparison-controls"><label htmlFor="comparison-values">Transmission percentages</label><input id="comparison-values" value={probabilityText} onChange={e => setProbabilityText(e.target.value)} /><button className="primary" onClick={updateProbabilities}>Apply</button><label htmlFor="compare-a">Thresholds (%)</label><input id="compare-a" type="number" min="0" max="100" value={compareThresholdA} onChange={e => setCompareThresholdA(Math.max(0, Math.min(100, Number(e.target.value))))} /><input aria-label="Second comparison threshold" type="number" min="0" max="100" value={compareThresholdB} onChange={e => setCompareThresholdB(Math.max(0, Math.min(100, Number(e.target.value))))} /></div>
        {comparison.busy && <div className="calculation-progress"><progress value={comparison.progress} max="1" /><span>Computing probability settings… {(comparison.progress * 100).toFixed(0)}%</span><button onClick={comparison.cancel}>Cancel</button></div>}{comparison.error && <p className="error-message">{comparison.error}</p>}
        {comparison.results.some(c => c.result.precisionWarning) && <p className="notice">Some cyclic outcomes are close to floating-point resolution. Tiny values may round to zero; their relative accuracy is unknown.</p>}<ComparisonCharts comparisons={comparison.results} /><div className="table-scroll"><table><thead><tr><th>Overlay</th><th>Transmission p</th><th>P(all)</th><th>Mean</th><th>Std. deviation</th><th>P(≥{compareThresholdA}%)</th><th>P(≥{compareThresholdB}%)</th><th>Median</th><th>10th–90th</th></tr></thead><tbody>{comparison.results.map(c => <tr key={c.probability}><td><input type="checkbox" aria-label={`Overlay ${pct(c.probability)}`} checked={overlay.includes(c.probability)} onChange={e => setOverlay(v => e.target.checked ? [...v, c.probability] : v.filter(p => p !== c.probability))} /></td><td><button className="subtle" onClick={() => commit({ ...graph, probability: c.probability })}>{pct(c.probability, 1)}</button></td><td>{pct(c.result.all, 5)}</td><td>{c.result.mean.toFixed(4)}</td><td>{c.result.sd.toFixed(4)}</td><td>{pct(tail(c.result.distribution, n * compareThresholdA / 100), 5)}</td><td>{pct(tail(c.result.distribution, n * compareThresholdB / 100), 5)}</td><td>{c.result.median}</td><td>{c.result.p10}–{c.result.p90}</td></tr>)}</tbody></table></div><p className="muted">Select overlays, then open Distribution to compare outcome shapes. For graphs above {EXACT_NODE_LIMIT} nodes, comparison uses up to 100,000 seeded trials per setting.</p></div>}
      {tab === 'math' && <div className="analysis-content"><div className="section-title"><div><h2>Every outcome has a story.</h2><p>Final subsets containing the initial source, with their exact probabilities.</p></div>{highlight.length > 0 && <button onClick={() => setHighlight([])}>Clear highlight</button>}</div><details className="math-explanation" open><summary>How subset dynamic programming works</summary><p>Imagine sampling each directed transmission independently in advance. The final activated set is exactly the set reachable from the source through successful arcs. The processing order changes which arc gets credit, but not this final-set distribution.</p><p>For a subset S containing the source, F(S) is the chance all of S is reached using only connections inside S. Start with F({'{source}'}) = 1. Subtract all smaller possible final sets T: each must activate internally, and all arcs from T to S ∖ T must fail.</p><div className="formula">F(S) = 1 − Σ<sub>T ⊊ S, s ∈ T</sub> F(T) · ∏<sub>u ∈ T, v ∈ S ∖ T</sub> (1 − p<sub>uv</sub>)</div><p>In the full graph, a final set T requires its internal activation and every outgoing arc to fail:</p><div className="formula">P(final = T) = F(T) · ∏<sub>u ∈ T, v ∉ T</sub> (1 − p<sub>uv</sub>)</div><p>No outgoing arc means an empty product of 1. Both directions are independent; only arcs pointing out of the subset enter its failure product.</p></details>
        {exact.result && n <= 8 ? <><div className="table-scroll"><table><thead><tr><th>Final activated subset</th><th>Internal F(T)</th><th>Outward arcs</th><th>Failure factors</th><th>Outward failure</th><th>Final probability</th></tr></thead><tbody>{exact.result.subsets?.map(s => <tr key={s.mask} className={JSON.stringify(highlight) === JSON.stringify(s.nodeIds) ? 'highlight-row' : ''} onClick={() => setHighlight(s.nodeIds)}><td><button className="subset-button">{'{'}{s.nodeIds.join(', ')}{'}'}</button></td><td>{pct(s.internal, 6)}</td><td>{s.outwardArcs}</td><td>{s.failureFactors.length ? s.failureFactors.map(f => Number(f.toFixed(5))).join(' × ') : '1 (empty product)'}</td><td>{pct(s.failure, 6)}</td><td>{pct(s.probability, 8)}</td></tr>)}</tbody><tfoot><tr><td colSpan={5}>Sum of all final outcomes</td><td>{pct(exact.result.subsets?.reduce((sum, s) => sum + s.probability, 0) || 0, 10)}</td></tr></tfoot></table></div><p className="muted">Click a row to highlight its nodes. The diamond has 8 final subsets; the triangle has 4.</p></> : <p className="notice">{n > 8 ? 'The explanation table is shown for up to 8 nodes to keep it readable. Exact calculations still include every subset up to 14 nodes.' : 'Add a node or wait for the exact calculation to see the subset table.'}</p>}
      </div>}
    </section>
    <footer><span><GitBranch size={13} /> Chain Reaction Lab <span className="dot-separator">·</span> Made for curious minds.</span><span>Browser-local storage <Check size={12} /> <span className="dot-separator">·</span> No accounts. No backend.</span></footer>
    {message && <div className="toast" role="status"><span>{message}</span><button aria-label="Dismiss notification" onClick={() => setMessage('')}><X size={16} /></button></div>}
  </div>;
}
