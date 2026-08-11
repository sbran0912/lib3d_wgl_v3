import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
import { createBox, createGrid, createLine, createPyramid, Line, Body } from "./lib-body.ts";

// ====================================================================
// KONFIGURATION
// ====================================================================

const SCREEN_W = 800;
const SCREEN_H = 600;

const FOV_Y = 1.2;
const Z_NEAR = 0.1;
const Z_FAR = 1000;

const CAM_TARGET = new l3d.Vec3(0, 0, 0);
const CAM_UP     = new l3d.Vec3(0, 1, 0);
const CAM_RADIUS = Math.sqrt(40 * 40 + 180 * 180);
const CAM_HEIGHT = 140;
const CAM_SPEED  = 0.15;

// ====================================================================
// SZENE AUFBAUEN
// ====================================================================

const grid = createGrid(600, 24, 0, 0, 0);
grid.color = "#777774";

// Lichtkegel
const APEX = new l3d.Vec3(0, 0, -40);
const CONE_LEN = 600;
const CONE_ANGLE = Math.PI / 60;
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
  l.lineWidth = 1;
  lines.push(l);
}

const box = createBox(40, 80, 60, 0, 0, 100);
box.color = "#00ffff";
box.lineWidth = 2;

const box2 = createBox(200, 100, 40, -140, 0, 150);
box2.color = "#ff4444";
box2.lineWidth = 2;

const box3 = createBox(50, 70, 100, 100, 0, 0);
box3.color = "#44ff44";
box3.lineWidth = 2;

const box4 = createBox(60, 70, 50, 0, 0, -150);
box4.color = "#aa66ff";
box4.lineWidth = 2;

// ── Pyramide im Orbit um Y-Achse ──
const PYRAMID_RADIUS = 120;
const PYRAMID_SPEED  = 0.02;

const pyramid = createPyramid(10, 20, PYRAMID_RADIUS, 50, 0);
pyramid.color = "#ffcc00";
pyramid.lineWidth = 2;

const bodies = [box, box2, box3, box4, pyramid];

// ====================================================================
// LINE↔BODY INTERSECTION
// ====================================================================
const boxPlanes = [box.getFacePlanes(), box2.getFacePlanes(), box3.getFacePlanes(), box4.getFacePlanes()];

// ====================================================================
// alignToVelocity – Pyramide zeigt mit Spitze in Flugrichtung
// ====================================================================
function alignToVelocity(body: Body) {
  const v = body.vel;
  const magXZ = Math.sqrt(v.x * v.x + v.z * v.z);
  if (magXZ < 0.0001) return;

  // rotX = π/2  →  Spitze (Y+) wird nach Z+ gekippt
  // rotY        →  dreht Z+ in gewünschte XZ-Richtung
  body.rotX = Math.PI / 2;
  body.rotY = Math.atan2(v.x / magXZ, v.z / magXZ);
  body.rotZ = 0;
}

// ====================================================================
// DRAW-SCHLEIFE
// ====================================================================

let time = 0;
let coneRotY = 0;
let pyramidAngle = 0;

const ROT_DELTA = 0.01;

function draw() {
  time += 0.02;

  wgl.background(40, 40, 40);
  wgl.setFog(100, 600, 0.25, 0.25, 0.25, 1);

  const camAngle = time * CAM_SPEED;
  const camPos = new l3d.Vec3(
    Math.sin(camAngle) * CAM_RADIUS,
    CAM_HEIGHT,
    Math.cos(camAngle) * CAM_RADIUS,
  );
  const view = l3d.lookAtMatrix(camPos, CAM_TARGET, CAM_UP);
  const proj = l3d.perspectiveMatrix(FOV_Y, SCREEN_W / SCREEN_H, Z_NEAR, Z_FAR);
  wgl.setProjection(proj);

  // 1. Gitter
  grid.draw(view);

  // 2. Pyramide – Orbit + Ausrichtung
  pyramidAngle += PYRAMID_SPEED;

  pyramid.pos.x = Math.cos(pyramidAngle) * PYRAMID_RADIUS;
  pyramid.pos.y = 50;
  pyramid.pos.z = Math.sin(pyramidAngle) * PYRAMID_RADIUS;

  // Tangentialgeschwindigkeit (Ableitung der Kreisbahn)
  const vMag = PYRAMID_RADIUS * PYRAMID_SPEED;
  pyramid.vel.x = -Math.sin(pyramidAngle) * vMag;
  pyramid.vel.y = 0;
  pyramid.vel.z =  Math.cos(pyramidAngle) * vMag;

  alignToVelocity(pyramid);

  // 3. Alle Bodys zeichnen
  for (const b of bodies) {
    b.draw(view);
  }

  // 4. Lichtkegel rotieren + Clipping
  coneRotY += ROT_DELTA;
  const coneRot = l3d.rotateMatrix(0, coneRotY, 0);

  // Clipping-Ebenen: statische Boxen + Pyramide (pro Frame neu!)
  const allPlanes = [...boxPlanes, pyramid.getFacePlanes()];

  for (const line of lines) {
    const rotatedEnd = l3d.rotateAround(line.p2, line.p1, coneRot);
    let endpoint = rotatedEnd;
    let maxdist = rotatedEnd.sub(line.p1).squaredLength();
    for (const bp of allPlanes) {
      for (const face of bp) {
        const hit = face.intersectLine(line.p1, rotatedEnd);
        if (hit) {
          const dist = hit.sub(line.p1).squaredLength();
          if (dist < maxdist) {
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
