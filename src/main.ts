/**
 * main.ts  –  Demo: Nur Gitter + Kugel
 */

import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
import { createBox, createGrid, createSphere } from "./lib-solids.ts";
import { Body } from "./lib-body.ts";

// ====================================================================
// KONFIGURATION
// ====================================================================

const SCREEN_W = 800;
const SCREEN_H = 600;

const FOV_Y = 1.2;
const Z_NEAR = 0.1;
const Z_FAR = 1000;

const CAM_POS    = new l3d.Vec3(40, 140, -180);
const CAM_TARGET = new l3d.Vec3(0, 0, 0);
const CAM_UP     = new l3d.Vec3(0, 1, 0);

// ====================================================================
// SZENE AUFBAUEN
// ====================================================================

const grid = createGrid(600, 24);

const sphere = new Body(createSphere(35, 12, 9), 130, 25, -200);
sphere.color   = "#66ff88";
sphere.lineWidth = 1;

const box = new Body(createBox(20, 20, 20), 0, 0, 0);
box.color   = "#ff66cc";
box.lineWidth = 1;

const bodies = [sphere, box];

// ====================================================================
// Pivot / Orbit für die Kugel
// ====================================================================

const pivot = new l3d.Vec3(0, 0, 0);

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
  // 2. KUGEL – Orbit um Pivot + Eigenrotation
  // ================================================================
  const sphereOrbitAngle = time * 0.5;
  const sphereOrbitPos = l3d.rotateAround(
    new l3d.Vec3(120, 30, 0),
    pivot,
    l3d.rotateMatrix(0, sphereOrbitAngle, 0),
  );
  sphere.pos = sphereOrbitPos;
  sphere.rotY = time * 0.8;

  // ================================================================
  // 3. GRÜNER BOX – Orbit um Pivot + Eigenrotation
  // ================================================================
  const boxOrbitAngle = time * 0.9;
  const boxOrbitPos = l3d.rotateAround(
    new l3d.Vec3(70, 10, 0),
    pivot,
    l3d.rotateMatrix(0, boxOrbitAngle, 0),
  );
  box.pos = boxOrbitPos;
  box.rotY = time * 1.2;

  // ================================================================
  // 4. ALLE BODYS ZEICHNEN
  // ================================================================
  for (const b of bodies) {
    b.draw(view);
  }

  // ================================================================
  // 5. PIVOT-MARKER
  // ================================================================
  // ModelView zurücksetzen, damit der Pivot in Weltkoordinaten erscheint
  wgl.setModelView(l3d.multMatrix(view, l3d.identityMatrix()));
  wgl.strokeColor("#ffffff66");
  wgl.pointSize(6);
  wgl.point(pivot.x, pivot.y, pivot.z);
}

// ====================================================================
// START
// ====================================================================

wgl.init(SCREEN_W, SCREEN_H);
wgl.startAnimation(draw);
