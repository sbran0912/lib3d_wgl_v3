/**
 * main.ts  –  Demo: Nur Gitter + Kugel
 */

import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
import { getLineIntersections, createBoxBody, createGridBody } from "./lib-body.ts";

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

const grid = createGridBody(600, 24, 0, 0, 0);
grid.color = "#777774";

interface LineDef {
  p1: l3d.Vec3;
  p2: l3d.Vec3;
  color: string;
  lineWidth: number;
}

const lines: LineDef[] = [
  { p1: new l3d.Vec3(0, 0, -40),  p2: new l3d.Vec3(0, 10, 160), color: "#ff8800", lineWidth: 2 },
  { p1: new l3d.Vec3(0, 0, -40),  p2: new l3d.Vec3(0, 60, 160), color: "#ff8800", lineWidth: 2 },
];

const box = createBoxBody(40, 80, 60, 0, 20, 100);
box.color = "#00ffff";
box.lineWidth = 2;

const bodies = [box];

// ====================================================================
// LINE↔BOX INTERSECTION – LINES CLIPPEN
// ====================================================================
const boxPlanes = box.getFacePlanes();

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

  for (const line of lines) {
    wgl.setModelView(l3d.multMatrix(view, l3d.identityMatrix()));
    const { entry, exit } = getLineIntersections(line.p1, line.p2, boxPlanes);

    // Ganze Linie zeichnen
    wgl.strokeColor(line.color);
    wgl.strokeWidth(line.lineWidth);
    wgl.line(line.p1.x, line.p1.y, line.p1.z, line.p2.x, line.p2.y, line.p2.z);

    // Entry-Punkt markieren (rot)
    if (entry) {
      wgl.strokeColor("#ff0000");
      wgl.point(entry.x, entry.y, entry.z);
    }
    // Exit-Punkt markieren (grün)
    if (exit) {
      wgl.strokeColor("#00ff00");
      wgl.point(exit.x, exit.y, exit.z);
    }
  }

}

// ====================================================================
// START
// ====================================================================

wgl.init(SCREEN_W, SCREEN_H);
wgl.startAnimation(draw);