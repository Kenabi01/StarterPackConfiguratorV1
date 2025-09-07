import { CanvasEngine } from "./engine/CanvasEngine.js";
import { ConfigManager } from "./state/ConfigManager.js";
import { Controls } from "./ui/Controls.js";
import { SHOW_GRID_DEFAULT } from "./settings.js";

const canvas = document.getElementById('viewport');
const engine = new CanvasEngine(canvas);
const cm = new ConfigManager(engine);

const controlsHost = document.getElementById('controls');
const controls = new Controls(controlsHost, engine, cm);

const toggleGrid = document.getElementById('toggleGrid');
toggleGrid.checked = SHOW_GRID_DEFAULT;
toggleGrid.addEventListener('change', ()=>engine.setShowGrid(toggleGrid.checked));

// Basic preset demonstration: could be replaced with real assets
// engine.addImageItem({ id: 'preset1', url: '/apps/configurator/public/presets/example1.png', category: 'object' });

// iFrame communication: report size and selection changes
function post(message) {
  try { window.parent.postMessage(message, '*'); } catch {}
}

post({ type: 'configurator-ready' });

// Resizing observer for iframe
const ro = new ResizeObserver(()=>{
  post({ type: 'resize', width: document.body.scrollWidth, height: document.body.scrollHeight });
});
ro.observe(document.body);

