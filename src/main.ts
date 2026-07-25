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
// LINE↔BOX INTERSECTION – LINES CLIPPEN (Plane.fromFace + Boundary)
// ====================================================================
const boxVertsWorld = box.solid.vertices.map(v => v.add(box.pos));
console.log(boxVertsWorld);
// 6 Face-Planes der Box, jeweils begrenzt durch das zugehörige Viereck.
// Plane.fromFace() erstellt die Ebene inkl. Polygon-Boundary, sodass
// intersectLine() nur Treffer innerhalb des Faces liefert.
const boxFaces = [
  l3d.Plane.fromFace([boxVertsWorld[0], boxVertsWorld[3], boxVertsWorld[2], boxVertsWorld[1]]), // front
  l3d.Plane.fromFace([boxVertsWorld[4], boxVertsWorld[5], boxVertsWorld[6], boxVertsWorld[7]]), // back
  l3d.Plane.fromFace([boxVertsWorld[0], boxVertsWorld[4], boxVertsWorld[7], boxVertsWorld[3]]), // left
  l3d.Plane.fromFace([boxVertsWorld[1], boxVertsWorld[2], boxVertsWorld[6], boxVertsWorld[5]]), // right
  l3d.Plane.fromFace([boxVertsWorld[0], boxVertsWorld[1], boxVertsWorld[5], boxVertsWorld[4]]), // bottom
  l3d.Plane.fromFace([boxVertsWorld[3], boxVertsWorld[7], boxVertsWorld[6], boxVertsWorld[2]]), // top
];
console.log(boxFaces);

for (const line of [line1, line2]) {
  const p1 = line.solid.vertices[0].add(line.pos);
  const p2 = line.solid.vertices[1].add(line.pos);

  // Nächsten Treffer zur Startlinie finden (Closest-Hit)
  let closestHit: l3d.Vec3 | null = null;
  let closestDistSq = Infinity;
  for (const face of boxFaces) {
    const hit = face.intersectLine(p1, p2);
    if (hit) {
      const dSq = hit.sub(p1).squaredLength();
      if (dSq < closestDistSq) {
        // Duplikat-Check: gleicher Punkt wie bisheriges Minimum?
        if (!closestHit || hit.sub(closestHit).squaredLength() > 1e-8) {
          closestDistSq = dSq;
          closestHit = hit;
        }
      }
    }
  }

  if (!closestHit) continue;

  // Linie startet immer von außerhalb → erster Hit = Entry
  const newVerts = [line.solid.vertices[0], closestHit.sub(line.pos)] as l3d.Vec3[];
  const newEdges: [number, number][] = [[0, 1]];

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
