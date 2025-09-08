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

// Canvas responsive: fit to parent container (mobile-friendly)
function fitCanvasToParent(){
  const parent = canvas.parentElement || document.body;
  const rect = parent.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const cssW = Math.max(200, Math.floor(rect.width));
  const cssH = Math.max(200, Math.floor(rect.height));
  const pxW = Math.max(200, Math.floor(cssW * dpr));
  const pxH = Math.max(200, Math.floor(cssH * dpr));
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW; canvas.height = pxH;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    engine.requestRender?.();
  }
}
fitCanvasToParent();

// iFrame communication: report size and selection changes
function post(message) {
  try { window.parent.postMessage(message, '*'); } catch {}
}

post({ type: 'configurator-ready' });

// Resizing observers: update canvas and inform parent iframe
const ro = new ResizeObserver(()=>{
  fitCanvasToParent();
  post({ type: 'resize', width: document.body.scrollWidth, height: document.body.scrollHeight });
});
ro.observe(document.body);
const roMain = new ResizeObserver(()=>{ fitCanvasToParent(); });
roMain.observe(canvas.parentElement || document.body);
