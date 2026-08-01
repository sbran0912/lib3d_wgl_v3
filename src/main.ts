/**
 * main.ts  –  Demo: Nur Gitter + Kugel
 */

import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
import { createBox, createGrid, createLine, Line } from "./lib-body.ts";

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

const grid = createGrid(600, 24, 0, 0, 0);
grid.color = "#777774";

// Lichtkegel: 20 Linien, gemeinsame Spitze, Enden kreisförmig angeordnet
const APEX = new l3d.Vec3(0, 0, -40);
const CONE_LEN = 400;
const CONE_ANGLE = Math.PI / 48; 
const CONE_R = CONE_LEN * Math.sin(CONE_ANGLE);
const CONE_Z = CONE_LEN * Math.cos(CONE_ANGLE);

const lines: Line[] = [];
for (let i = 0; i < 20; i++) {
  const a = (2 * Math.PI * i) / 20;
  const end = new l3d.Vec3(
    APEX.x + Math.cos(a) * CONE_R,
    APEX.y + Math.sin(a) * CONE_R,
    APEX.z + CONE_Z,
  );
  const l = createLine(APEX, end);
  l.color = "#ff8800";
  l.lineWidth = 2;
  lines.push(l);
}

const box = createBox(40, 80, 60, 0, 0, 100);
box.color = "#00ffff";
box.lineWidth = 2;

const box2 = createBox(60, 100, 40, -70, 0, 100);
box2.color = "#ff4444";
box2.lineWidth = 2;

const box3 = createBox(50, 70, 50, 100, 0, 0);
box3.color = "#44ff44";
box3.lineWidth = 2;

const bodies = [box, box2, box3];

// ====================================================================
// LINE↔BOX INTERSECTION – LINES CLIPPEN
// ====================================================================
const boxPlanes = [box.getFacePlanes(), box2.getFacePlanes(), box3.getFacePlanes()];

// ====================================================================
// DRAW-SCHLEIFE
// ====================================================================

let time = 0;
let coneRotY = 0;

const ROT_DELTA = 0.01;

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

  coneRotY += ROT_DELTA;
  const coneRot = l3d.rotateMatrix(0, coneRotY, 0);

  for (const line of lines) {
    const rotatedEnd = l3d.rotateAround(line.p2, line.p1, coneRot);
    let endpoint = rotatedEnd;
    let maxdist = rotatedEnd.sub(line.p1).squaredLength();
    for (const bp of boxPlanes) {
      for (const face of bp) {
        const hit = face.intersectLine(line.p1, rotatedEnd);
        if (hit) {
          const dist = hit.sub(line.p1).squaredLength();
          if ( dist < maxdist) {
            endpoint = hit;
            maxdist = dist;
          }
        }
      }
    }
    line.draw(view, endpoint);
    wgl.strokeColor("#ff0000");
    wgl.point(endpoint.x, endpoint.y, endpoint.z);
  }
}

// ====================================================================
// START
// ====================================================================

wgl.init(SCREEN_W, SCREEN_H);
wgl.startAnimation(draw);