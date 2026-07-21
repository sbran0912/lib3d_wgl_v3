/*
-----------------------------------------------------------------
WebGL Implementierung  –  Echter 3D-Renderer (GPU-Transformation)
-----------------------------------------------------------------
Koordinatensystem: +Y zeigt nach oben, Kamera blickt in +Z.
Die 3D-Transformation (Model/View/Projection) läuft im Vertex-Shader.
Depth-Testing ist aktiviert.

Shader-Modi (setEffect):
  "flat"      – einfache Volltonfarbe  (Standard)
  "gradient"  – radialer Verlauf von Farbe A nach Farbe B (im Kamera-Raum)
  "pulse"     – pulsierende Helligkeit über die Zeit
-----------------------------------------------------------------
*/

/* =================================================================
   INTERNER GLSL-CODE
================================================================= */

// Vertex-Shader:
// 3D-Transformation über ModelView- und Projection-Matrix.
// aPos = 3D-Punkt in Objektkoordinaten.
const VERT_SRC = `
  attribute vec3 aPos;
  uniform mat4 uModelView;
  uniform mat4 uProjection;
  uniform float uPointSize;

  varying vec3 vCamPos;

  void main() {
    vec4 camPos = uModelView * vec4(aPos, 1.0);
    vCamPos = camPos.xyz;
    gl_Position = uProjection * camPos;
    gl_PointSize = uPointSize;
  }
`;

// Fragment-Shader:
// uMode  0 = flat      – einfache Farbe uColor
// uMode  1 = gradient  – radialer Verlauf (vom Zentrum in Kamera-Koordinaten)
// uMode  2 = pulse     – flat mit sinusförmiger Helligkeitspulsation
const FRAG_SRC = `
  precision mediump float;

  uniform int   uMode;
  uniform vec4  uColor;
  uniform vec4  uColor2;
  uniform float uTime;
  uniform vec3  uShapeCenter;   // Zentrum in Kamera-Koordinaten
  uniform float uShapeRadius;
  varying vec3  vCamPos;

  void main() {
    if (uMode == 0) {
      gl_FragColor = uColor;
    } else if (uMode == 1) {
      float d = distance(vCamPos, uShapeCenter);
      float t = clamp(d / max(uShapeRadius, 1.0), 0.0, 1.0);
      gl_FragColor = mix(uColor, uColor2, t);
    } else if (uMode == 2) {
      float brightness = 0.6 + 0.4 * sin(uTime * 3.0);
      gl_FragColor = vec4(uColor.rgb * brightness, uColor.a);
    } else {
      gl_FragColor = uColor;
    }
  }
`;

/* =================================================================
   TYPEN & INTERNER ZUSTAND
================================================================= */

export type DrawStyle  = 0 | 1 | 2;           // 0=stroke, 1=fill, 2=both
export type EffectMode = "flat" | "gradient" | "pulse";

interface ColorState { r: number; g: number; b: number; a: number; }

interface DrawState {
  fill:   ColorState;
  stroke: ColorState;
  lineW:  number;
  effect: EffectMode;
  grad2:  ColorState;
}

// Canvas / GL
let canv: HTMLCanvasElement;
let gl:   WebGLRenderingContext;
let prog: WebGLProgram;

// Shader-Locations
let locPos:         number;
let locModelView:   WebGLUniformLocation;
let locProjection:  WebGLUniformLocation;
let locPointSize:   WebGLUniformLocation;
let locMode:        WebGLUniformLocation;
let locColor:       WebGLUniformLocation;
let locColor2:      WebGLUniformLocation;
let locTime:        WebGLUniformLocation;
let locCenter:      WebGLUniformLocation;
let locRadius:      WebGLUniformLocation;

// Animation
let looping   = true;
let startTime = 0;

// Maus
export let mouseX = 0;
export let mouseY = 0;
let mouseStatus = 0;

// Zeichenzustand-Stack
const stateStack: DrawState[] = [];
let state: DrawState = {
  fill:   { r: 1, g: 1, b: 1, a: 1 },
  stroke: { r: 0, g: 0, b: 0, a: 1 },
  lineW:  1,
  effect: "flat",
  grad2:  { r: 0, g: 0, b: 0, a: 1 },
};

/* =================================================================
   HILFSFUNKTIONEN (intern)
================================================================= */

/** Parst varargs in { r,g,b,a } mit Werten 0..1 */
function parseColor(...c: (string | number)[]): ColorState {
  if (c.length === 1 && typeof c[0] === "string") {
    let hex = (c[0] as string).replace("#", "");
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const n = parseInt(hex, 16);
    return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255, a: 1 };
  }
  if (c.length === 1 && typeof c[0] === "number") {
    const v = (c[0] as number) / 255;
    return { r: v, g: v, b: v, a: 1 };
  }
  if (c.length === 3) {
    return { r: (c[0] as number)/255, g: (c[1] as number)/255, b: (c[2] as number)/255, a: 1 };
  }
  if (c.length === 4) {
    return { r: (c[0] as number)/255, g: (c[1] as number)/255, b: (c[2] as number)/255, a: (c[3] as number)/255 };
  }
  return { r: 1, g: 1, b: 1, a: 1 };
}

/** Kompiliert einen einzelnen GLSL-Shader */
function compileShader(type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error("Shader-Fehler: " + gl.getShaderInfoLog(shader));
  }
  return shader;
}

/** Verknüpft Vertex- und Fragment-Shader zu einem WebGL-Programm */
function createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl.VERTEX_SHADER,   vertSrc));
  gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Programm-Fehler: " + gl.getProgramInfoLog(p));
  }
  return p;
}

/** 4x4-Matrix als Float32Array flach machen (row-major) */
/** 4x4-Matrix row-major → column-major Float32Array (für WebGL1 transpose=false) */
function flattenMatrix(m: number[][]): Float32Array {
  return new Float32Array([
    m[0][0], m[1][0], m[2][0], m[3][0],
    m[0][1], m[1][1], m[2][1], m[3][1],
    m[0][2], m[1][2], m[2][2], m[3][2],
    m[0][3], m[1][3], m[2][3], m[3][3],
  ]);
}

/** Setzt Shader-Uniforms aus dem aktuellen Zustand */
function applyUniforms(useStroke = false) {
  let col: ColorState;
  if (useStroke) {
    col = state.stroke;
  } else {
    col = state.fill;
  }

  let mode: number;
  if (state.effect === "flat") {
    mode = 0;
  } else if (state.effect === "gradient") {
    mode = 1;
  } else {
    mode = 2;   // pulse
  }
  gl.uniform1i(locMode,   mode);
  gl.uniform4f(locColor,  col.r, col.g, col.b, col.a);
  gl.uniform4f(locColor2, state.grad2.r, state.grad2.g, state.grad2.b, state.grad2.a);
}

/** Überträgt 3D-Vertices an die GPU und löst einen Draw-Call aus */
function drawVertices3D(verts: Float32Array, mode: number) {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(locPos);
  gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(mode, 0, verts.length / 3);
  gl.deleteBuffer(buf);
}

/** Erzeugt einen persistenten WebGL-Buffer aus einem flachen Vertex-Array.
 *  Einmal angelegt, mit drawMesh() zeichnen – kein createBuffer/deleteBuffer
 *  mehr pro Frame.
 *  @param flatVerts  Float32Array mit abwechselnd x,y,z,x,y,z,...
 *  @returns WebGLBuffer (STATIC_DRAW)
 */
export function createMesh(flatVerts: Float32Array): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, flatVerts, gl.STATIC_DRAW);
  return buf;
}

/** Zeichnet einen per createMesh() angelegten Buffer als Linien.
 *  @param buf    WebGLBuffer (von createMesh)
 *  @param count  Anzahl Vertices (z.B. edges.length * 2)
 */
export function drawMesh(buf: WebGLBuffer, count: number) {
  applyUniforms(true);
  gl.lineWidth(state.lineW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(locPos);
  gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, count);
}

/** Berechnet Mittelpunkt und maximale Ausdehnung einer 3D-Punktmenge */
function shapeMetrics3D(pts: number[]): { cx: number; cy: number; cz: number; r: number } {
  const n = pts.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < pts.length; i += 3) {
    cx += pts[i];
    cy += pts[i+1];
    cz += pts[i+2];
  }
  cx /= n; cy /= n; cz /= n;
  let r = 0;
  for (let i = 0; i < pts.length; i += 3) {
    r = Math.max(r, Math.hypot(pts[i] - cx, pts[i+1] - cy, pts[i+2] - cz));
  }
  return { cx, cy, cz, r };
}

/* =================================================================
   MAUS / TOUCH (intern)
================================================================= */

function onMouseMove(e: MouseEvent) {
  mouseX =  e.offsetX - canv.width  / 2;
  mouseY = -(e.offsetY - canv.height / 2);
}
function onMouseDown() { mouseStatus = 1; }
function onMouseUp()   { mouseStatus = 2; }

function onTouchMove(e: TouchEvent) {
  e.preventDefault();
  const rect  = (e.target as HTMLElement).getBoundingClientRect();
  const touch = e.targetTouches[0];
  mouseX =  (touch.pageX - rect.left)  - canv.width  / 2;
  mouseY = -((touch.pageY - rect.top) - canv.height / 2);
}
function onTouchStart(e: TouchEvent) { mouseStatus = 1; onTouchMove(e); }
function onTouchEnd()                { mouseStatus = 2; }

/* =================================================================
   ÖFFENTLICHE API – Setup & Matrizen
================================================================= */

export function getWidth():  number { return canv.width;  }
export function getHeight(): number { return canv.height; }

/** Stoppt die Animations-Schleife. */
export function noLoop() { looping = false; }

/** Gibt true zurück solange die Maustaste gedrückt ist. */
export function isMouseDown(): boolean { return mouseStatus === 1; }

/** Gibt einmalig true zurück wenn die Maustaste losgelassen wurde. */
export function isMouseUp(): boolean {
  if (mouseStatus === 2) { mouseStatus = 0; return true; }
  return false;
}

/** Setzt die Projection-Matrix für das 3D-Rendering. */
export function setProjection(m: number[][]) {
  gl.uniformMatrix4fv(locProjection, false, flattenMatrix(m));
}

/** Setzt die ModelView-Matrix für das 3D-Rendering.
 *  Typischerweise: view × world (siehe lib-3d.ts multMatrix).
 */
export function setModelView(m: number[][]) {
  gl.uniformMatrix4fv(locModelView, false, flattenMatrix(m));
}

/** Setzt das Zentrum für den Gradient-Effekt (in Kamera-Koordinaten). */
export function setGradientCenter(cx: number, cy: number, cz: number, radius: number) {
  gl.uniform3f(locCenter, cx, cy, cz);
  gl.uniform1f(locRadius, radius);
}

/** Initialisiert Canvas und WebGL-Kontext.
 *  Koordinatenursprung liegt in der Mitte, +Y zeigt nach oben.
 *  Depth-Testing ist aktiviert.
 */
export function init(w: number, h: number) {
  canv = document.querySelector("canvas") as HTMLCanvasElement;
  canv.width  = w;
  canv.height = h;

  gl = canv.getContext("webgl") as WebGLRenderingContext;
  if (!gl) throw new Error("WebGL wird nicht unterstützt.");

  prog = createProgram(VERT_SRC, FRAG_SRC);
  gl.useProgram(prog);

  locPos        = gl.getAttribLocation (prog, "aPos");
  locModelView  = gl.getUniformLocation(prog, "uModelView")!;
  locProjection = gl.getUniformLocation(prog, "uProjection")!;
  locPointSize  = gl.getUniformLocation(prog, "uPointSize")!;
  locMode       = gl.getUniformLocation(prog, "uMode")!;
  locColor      = gl.getUniformLocation(prog, "uColor")!;
  locColor2     = gl.getUniformLocation(prog, "uColor2")!;
  locTime       = gl.getUniformLocation(prog, "uTime")!;
  locCenter     = gl.getUniformLocation(prog, "uShapeCenter")!;
  locRadius     = gl.getUniformLocation(prog, "uShapeRadius")!;

  gl.uniform1f(locPointSize, 4.0);
  gl.uniform3f(locCenter, 0, 0, 0);
  gl.uniform1f(locRadius, 1);

  // Default-Matrizen (Identität)
  const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  gl.uniformMatrix4fv(locProjection, false, new Float32Array(identity));
  gl.uniformMatrix4fv(locModelView,  false, new Float32Array(identity));

  // Depth-Testing + Alpha-Blending
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.viewport(0, 0, w, h);
  startTime = performance.now();

  canv.addEventListener("mousemove",  onMouseMove);
  canv.addEventListener("mousedown",  onMouseDown);
  canv.addEventListener("mouseup",    onMouseUp);
  canv.addEventListener("touchmove",  onTouchMove,  { passive: false });
  canv.addEventListener("touchstart", onTouchStart, { passive: false });
  canv.addEventListener("touchend",   onTouchEnd);
}

/** Startet die Animations-Schleife mit requestAnimationFrame. */
export function startAnimation(fnDraw: () => void) {
  looping = true;
  const animate = () => {
    const t = (performance.now() - startTime) / 1000;
    gl.uniform1f(locTime, t);
    fnDraw();
    if (looping) window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
}

/* =================================================================
   ÖFFENTLICHE API – Zeichenzustand
================================================================= */

/** Speichert aktuellen Zeichen-Zustand (Farben, Effekt, Linienstärke). */
export function push() {
  stateStack.push(JSON.parse(JSON.stringify(state)) as DrawState);
}

/** Stellt den zuletzt gespeicherten Zeichen-Zustand wieder her. */
export function pop() {
  const s = stateStack.pop();
  if (s) state = s;
}

/** Füllfarbe setzen.  Hex-String | Grau(0-255) | r,g,b | r,g,b,a (0-255) */
export function fillColor(...color: (string | number)[]) {
  state.fill = parseColor(...color);
}

/** Linienfarbe setzen.  Hex-String | Grau | r,g,b | r,g,b,a (0-255) */
export function strokeColor(...color: (string | number)[]) {
  state.stroke = parseColor(...color);
}

/** Linienstärke in Pixeln (betrifft stroke-Darstellung). */
export function strokeWidth(w: number) {
  state.lineW = w;
}

/** Aktiven Shader-Effekt wählen.
 *  "flat"     – einfache Volltonfarbe (Standard)
 *  "gradient" – radialer Verlauf von fillColor nach setGradient-Farbe
 *               (im Kamera-Raum, relativ zu setGradientCenter)
 *  "pulse"    – pulsierende Helligkeit über die Zeit
 */
export function setEffect(effect: EffectMode) {
  state.effect = effect;
}

/** Zweite Farbe für den Gradient-Effekt.
 *  Hex-String | Grau | r,g,b | r,g,b,a (0-255)
 */
export function setGradient(...color: (string | number)[]) {
  state.grad2 = parseColor(...color);
}

/** Hintergrundfarbe (löscht den gesamten Canvas inkl. Tiefenpuffer).
 *  Hex-String | Grau | r,g,b (Werte 0-255)
 */
export function background(...color: (string | number)[]) {
  const c = parseColor(...color);
  gl.clearColor(c.r, c.g, c.b, c.a);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

/* =================================================================
   ÖFFENTLICHE API – 3D-Primitive
================================================================= */

/** Punktgröße in Pixeln setzen (betrifft point()-Zeichnung). */
export function pointSize(px: number) {
  gl.uniform1f(locPointSize, px);
}

/** 3D-Punkt bei (x,y,z) mit aktueller strokeColor, strokeWidth und pointSize. */
export function point(x: number, y: number, z: number) {
  applyUniforms(true);
  gl.lineWidth(state.lineW);
  drawVertices3D(new Float32Array([x, y, z]), gl.POINTS);
}

/** 3D-Linie von (x1,y1,z1) nach (x2,y2,z2). */
export function line(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
  applyUniforms(true);
  gl.lineWidth(state.lineW);
  drawVertices3D(new Float32Array([x1, y1, z1, x2, y2, z2]), gl.LINES);
}

/** 3D-Dreieck (fill/stroke).
 *  style: 0=stroke | 1=fill | 2=beide  (Standard: 0)
 */
export function triangle(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
  style: DrawStyle = 0,
) {
  const pts = [x1, y1, z1, x2, y2, z2, x3, y3, z3];
  const { cx, cy, cz, r } = shapeMetrics3D(pts);

  if (style === 1 || style === 2) {
    applyUniforms(false);
    drawVertices3D(new Float32Array(pts), gl.TRIANGLES);
  }
  if (style === 0 || style === 2) {
    applyUniforms(true);
    gl.lineWidth(state.lineW);
    drawVertices3D(
      new Float32Array([x1,y1,z1, x2,y2,z2,  x2,y2,z2, x3,y3,z3,  x3,y3,z3, x1,y1,z1]),
      gl.LINES,
    );
  }
}

/** 3D-Viereck mit 4 beliebigen Punkten.
 *  style: 0=stroke | 1=fill | 2=beide  (Standard: 0)
 */
export function shape(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
  x4: number, y4: number, z4: number,
  style: DrawStyle = 0,
) {
  const pts = [x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4];
  const { cx, cy, cz, r } = shapeMetrics3D(pts);

  if (style === 1 || style === 2) {
    applyUniforms(false);
    drawVertices3D(
      new Float32Array([x1,y1,z1, x2,y2,z2, x3,y3,z3,  x1,y1,z1, x3,y3,z3, x4,y4,z4]),
      gl.TRIANGLES,
    );
  }
  if (style === 0 || style === 2) {
    applyUniforms(true);
    gl.lineWidth(state.lineW);
    drawVertices3D(
      new Float32Array([x1,y1,z1, x2,y2,z2, x2,y2,z2, x3,y3,z3, x3,y3,z3, x4,y4,z4, x4,y4,z4, x1,y1,z1]),
      gl.LINES,
    );
  }
}

/** Achsenparalleles Rechteck in der XY-Ebene bei z=0.
 *  (x,y) = Mittelpunkt, w×h in der XY-Ebene.
 *  z = Höhe in Z-Richtung (Default: 0).
 *  style: 0=stroke | 1=fill | 2=beide  (Standard: 0)
 */
export function rect(x: number, y: number, w: number, h: number, style: DrawStyle = 0, z = 0) {
  const hw = w / 2, hh = h / 2;
  shape(x - hw, y - hh, z,  x + hw, y - hh, z,  x + hw, y + hh, z,  x - hw, y + hh, z, style);
}

/** 3D-Kreis (Ring) in der XY-Ebene bei z.
 *  (x,y,z) = Mittelpunkt.
 *  style:    0=stroke | 1=fill | 2=beide  (Standard: 0)
 *  segments: Anzahl der Dreiecks-Segmente  (Standard: 64)
 */
export function circle(
  x: number, y: number, z: number,
  radius: number,
  style: DrawStyle = 0,
  segments = 64,
) {
  const tau = Math.PI * 2;

  if (style === 1 || style === 2) {
    const fillVerts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a0 = (i       / segments) * tau;
      const a1 = ((i + 1) / segments) * tau;
      fillVerts.push(x, y, z);
      fillVerts.push(x + Math.cos(a0) * radius, y + Math.sin(a0) * radius, z);
      fillVerts.push(x + Math.cos(a1) * radius, y + Math.sin(a1) * radius, z);
    }
    applyUniforms(false);
    drawVertices3D(new Float32Array(fillVerts), gl.TRIANGLES);
  }

  if (style === 0 || style === 2) {
    const strokeVerts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * tau;
      strokeVerts.push(x + Math.cos(a) * radius, y + Math.sin(a) * radius, z);
    }
    applyUniforms(true);
    gl.lineWidth(state.lineW);
    drawVertices3D(new Float32Array(strokeVerts), gl.LINE_LOOP);
  }
}

/** Beliebiges 3D-Polygon als flaches Zahlen-Array [x0,y0,z0, x1,y1,z1, ...].
 *  style: 0=stroke | 1=fill | 2=beide  (Standard: 0)
 *  Hinweis: fill ist korrekt nur für konvexe Polygone (Fan-Triangulation).
 */
export function polygon(pts: number[], style: DrawStyle = 0) {
  if (pts.length < 4) return;
  const { cx, cy, cz, r } = shapeMetrics3D(pts);

  if (style === 1 || style === 2) {
    const fillVerts: number[] = [];
    for (let i = 3; i < pts.length - 3; i += 3) {
      fillVerts.push(pts[0], pts[1], pts[2], pts[i], pts[i+1], pts[i+2], pts[i+3], pts[i+4], pts[i+5]);
    }
    applyUniforms(false);
    drawVertices3D(new Float32Array(fillVerts), gl.TRIANGLES);
  }
  if (style === 0 || style === 2) {
    applyUniforms(true);
    gl.lineWidth(state.lineW);
    drawVertices3D(new Float32Array(pts), gl.LINE_LOOP);
  }
}
