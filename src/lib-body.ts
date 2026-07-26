/**
 * lib-body.ts  –  Physik-fähiger 3D-Körper
 *
 * Kapselt ein Solid mit Position, Rotation, Geschwindigkeit und Farbe.
 * Der Mesh-Buffer liegt im Solid (einmaliger GPU-Upload, shared).
 */

import * as l3d from "./lib-3d.ts";
import * as wgl from "./lib-wgl.ts";
import { Solid, darkenHex, createBox, createLine, createGrid, createSphere, createPyramid } from "./lib-solids.ts";

// ====================================================================
// BODY
// ====================================================================

export class Body {
  /** Geometrie (shared – kann zwischen Bodies geteilt werden) */
  solid: Solid;

  /** Position im Weltraum */
  pos: l3d.Vec3;

  /** Geschwindigkeit (für Physik) */
  vel: l3d.Vec3;

  /** Rotation um X-, Y- und Z-Achse (in Radian) */
  rotX = 0;
  rotY = 0;
  rotZ = 0;

  /** Darstellung */
  color = "#ffffff";
  lineWidth = 1;

  /**
   * Face-Topologie: Arrays von Vertex-Indizes, die jeweils ein konvexes
   * Face-Polygon definieren. z.B. [[0,3,2,1], [4,5,6,7], ...].
   * Nur für geschlossene Körper (Box, Pyramide, etc.) gesetzt.
   */
  faces?: number[][];

  /**
   * Körper-Nebel: ganzer Körper wird dunkler, je weiter er
   * von der Kamera entfernt ist (absolute Kameratiefe).
   */
  static bodyFogNear = 50;
  static bodyFogFar = 400;
  static bodyFogMax = 0.6;

  constructor(solid: Solid, x: number, y: number, z: number) {
    this.solid = solid;
    this.pos = new l3d.Vec3(x, y, z);
    this.vel = new l3d.Vec3(0, 0, 0);
  }

  // ================================================================
  // FACE / INTERSECTION
  // ================================================================

  /**
   * Liefert die Face-Planes dieses Körpers in Weltkoordinaten.
   * Nur Bodies mit gesetzten `faces` liefern Ergebnisse.
   */
  getFacePlanes(): l3d.Plane[] {
    if (!this.faces || this.faces.length === 0) return [];

    const worldVerts = this.solid.vertices.map(v => v.add(this.pos));
    return this.faces.map(faceIdx =>
      l3d.Plane.fromFace(faceIdx.map(i => worldVerts[i])),
    );
  }

  /**
   * Kürzt eine Linie (line) auf den Eintrittspunkt in diesen Body.
   * Der Startpunkt von `line` muss außerhalb des Bodys liegen.
   *
   * @param line Die zu kürzende Linie (wird bei Erfolg in-place geändert)
   * @param planes Face-Planes dieses Bodys (via getFacePlanes())
   * @returns true wenn ein Treffer gefunden wurde, false sonst
   */
  clipLineEntry(line: Body, planes: l3d.Plane[]): boolean {
    if (planes.length === 0) return false;

    const p1 = line.solid.vertices[0].add(line.pos);
    const p2 = line.solid.vertices[1].add(line.pos);

    let closestHit: l3d.Vec3 | null = null;
    let closestDistSq = Infinity;
    for (const face of planes) {
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

    if (!closestHit) return false;

    // Linie startet immer von außerhalb → erster Hit = Entry
    const newVerts = [line.solid.vertices[0], closestHit.sub(line.pos)] as l3d.Vec3[];
    const newEdges: [number, number][] = [[0, 1]];

    line.solid = new Solid(newVerts, newEdges);
    return true;
  }

  /** Zeichnet den Body. Farbe und ModelView werden pro Body gesetzt,
   *  der Mesh-Buffer kommt aus dem Solid (shared). */
  draw(view: l3d.Matrix4x4): void {
    // ── World-Matrix bauen ──
    const t = l3d.translateMatrix(this.pos.x, this.pos.y, this.pos.z);
    let world: l3d.Matrix4x4;
    if (this.rotX === 0 && this.rotY === 0 && this.rotZ === 0) {
      world = t;
    } else {
      world = l3d.multMatrix(t, l3d.rotateMatrix(this.rotX, this.rotY, this.rotZ));
    }

    wgl.strokeWidth(this.lineWidth);

    // ── Körper-Nebel (absolute Tiefe) → Basis-Farbe abdunkeln ──
    const centerCam = this.pos.transform(view);
    const depth = centerCam.z;
    let bodyFog = 0;
    if (depth > Body.bodyFogNear) {
      const t = Math.min(1, (depth - Body.bodyFogNear) / (Body.bodyFogFar - Body.bodyFogNear));
      bodyFog = t * Body.bodyFogMax;
    }
    wgl.strokeColor(darkenHex(this.color, bodyFog));

    // ── Solid zeichnet mit shared Mesh-Buffer + eigener ModelView ──
    this.solid.draw(view, world);
  }

  /** Distanz zu einem anderen Body (Mittelpunkt zu Mittelpunkt). */
  distanceTo(other: Body): number {
    return this.pos.distanceTo(other.pos);
  }
}

// ====================================================================
// BODY-FACTORIES (freistehende Funktionen, analog lib-solids.ts)
// ====================================================================

/**
 * Erzeugt einen achsenparallelen Quader (Box) mit faces-Topologie.
 *
 * @param w Breite (X-Richtung)
 * @param h Höhe   (Y-Richtung)
 * @param d Tiefe  (Z-Richtung)
 * @param x,y,z Weltposition
 */
export function createBoxBody(w: number, h: number, d: number, x: number, y: number, z: number): Body {
  const box = new Body(createBox(w, h, d), x, y, z);
  box.faces = [
    [0, 3, 2, 1], // front
    [4, 5, 6, 7], // back
    [0, 4, 7, 3], // left
    [1, 2, 6, 5], // right
    [0, 1, 5, 4], // bottom
    [3, 7, 6, 2], // top
  ];
  return box;
}

/**
 * Erzeugt eine quadratische Pyramide mit faces-Topologie.
 */
export function createPyramidBody(base: number, height: number, x: number, y: number, z: number): Body {
  const pyr = new Body(createPyramid(base, height), x, y, z);
  pyr.faces = [
    [0, 1, 4],       // vorne
    [1, 2, 4],       // rechts
    [2, 3, 4],       // hinten
    [3, 0, 4],       // links
    [3, 2, 1, 0],    // Basis (CCW von unten)
  ];
  return pyr;
}

/**
 * Erzeugt eine einzelne Linie zwischen zwei 3D-Punkten.
 */
export function createLineBody(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  px: number, py: number, pz: number,
): Body {
  return new Body(createLine(x1, y1, z1, x2, y2, z2), px, py, pz);
}

/**
 * Erzeugt ein Gitter (Grid) in der XZ-Ebene.
 */
export function createGridBody(size: number, cells: number, x: number, y: number, z: number): Body {
  return new Body(createGrid(size, cells), x, y, z);
}

/**
 * Erzeugt eine Drahtgitter-Kugel (UV-Sphere).
 */
export function createSphereBody(radius: number, slices: number, stacks: number, x: number, y: number, z: number): Body {
  return new Body(createSphere(radius, slices, stacks), x, y, z);
}