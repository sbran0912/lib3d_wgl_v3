/**
 * main.ts  –  Demo: Nur Gitter + Kugel
 */

import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
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

const grid = Body.createGrid(600, 24, 0, 0, 0);
grid.color = "#777774";

const line1 = Body.createLine(0, 0, 0, 0, 10, 150, 0, 0, -40);
line1.color = "#ff8800";
line1.lineWidth = 2;

const line2 = Body.createLine(0, 0, 0, 0, 60, 150, 0, 0, -40);
line2.color = "#ff8800";
line2.lineWidth = 2;

const box = Body.createBox(40, 80, 60, 0, 20, 100);
box.color = "#00ffff";
box.lineWidth = 2;

const bodies = [box, line1, line2];

// ====================================================================
// LINE↔BOX INTERSECTION – LINES CLIPPEN
// ====================================================================
const boxPlanes = box.getFacePlanes();
for (const line of [line1, line2]) {
  box.clipLineEntry(line, boxPlanes);
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
  grid.draw(view);

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