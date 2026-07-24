/**
 * main.ts  –  Demo: Nur Gitter + Kugel
 */

import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
import { Solid, createBox, createGrid, createLine, createSphere } from "./lib-solids.ts";
import { Body } from "./lib-body.ts";

// ====================================================================
// KONFIGURATION
// ====================================================================

const SCREEN_W = 800;
const SCREEN_H = 600;

const FOV_Y = 1.2;
const Z_NEAR = 0.1;
const Z_FAR = 1000;

const CAM_POS    = new l3d.Vec3(-40, 140, -180);
const CAM_TARGET = new l3d.Vec3(0, 0, 0);
const CAM_UP     = new l3d.Vec3(0, 1, 0);

// ====================================================================
// SZENE AUFBAUEN
// ====================================================================

const grid = createGrid(600, 24);

const line1 = new Body(createLine(0, 0, 0, 0, 10, 150), 0, 0, -40);
line1.color = "#ff8800";
line1.lineWidth = 2;

const line2 = new Body(createLine(0, 0, 0, 100, 60, 150), 0, 0, -40);
line2.color = "#ff8800";
line2.lineWidth = 2;

const box = new Body(createBox(40, 80, 60), 0, 20, 100);
box.color = "#00ffff";
box.lineWidth = 1;

const bodies = [box, line1, line2];

// ====================================================================
// LINE↔BOX INTERSECTION – LINES CLIPPEN
// ====================================================================
const boxVertsWorld = box.solid.vertices.map(v => v.add(box.pos));

for (const line of [line1, line2]) {
  const p1 = line.solid.vertices[0].add(line.pos);
  const p2 = line.solid.vertices[1].add(line.pos);

  const hits = l3d.intersectLineBoxAll(p1, p2, boxVertsWorld);
  if (hits.length === 0) continue;

  const startInside = l3d.isPointInsideBox(p1, boxVertsWorld);

  const newVerts: l3d.Vec3[] = [];
  const newEdges: [number, number][] = [];

  if (hits.length === 1 && startInside) {
    // Inside → Outside: exit → end
    newVerts.push(hits[0].sub(line.pos), line.solid.vertices[1]);
    newEdges.push([0, 1]);
  } else {
    // Outside → irgendwo: start → erster Treffer (komplett abgeschnitten)
    newVerts.push(line.solid.vertices[0], hits[0].sub(line.pos));
    newEdges.push([0, 1]);
  }

  line.solid = new Solid(newVerts, newEdges);
}

// ====================================================================
// DRAW-SCHLEIFE
// ====================================================================

let time = 0;

function draw() {
  time += 0.02;

  wgl.background(40, 40, 40);

  const view = l3d.lookAtMatrix(CAM_POS, CAM_TARGET, CAM_UP);
  const proj = l3d.perspectiveMatrix(FOV_Y, SCREEN_W / SCREEN_H, Z_NEAR, Z_FAR);
  wgl.setProjection(proj);

  // ================================================================
  // 1. BODEN-GITTER
  // ================================================================
  wgl.strokeColor("#445");
  wgl.strokeWidth(1);
  grid.draw(view, l3d.identityMatrix());

  // ================================================================
  // 2. ALLE BODYS ZEICHNEN
  // ================================================================
  for (const b of bodies) {
    b.draw(view);
  }

}

// ====================================================================
// START
// ====================================================================

wgl.init(SCREEN_W, SCREEN_H);
wgl.startAnimation(draw);
