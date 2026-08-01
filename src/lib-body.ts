/**
 * lib-body.ts  –  Physik-fähiger 3D-Körper
 *
 * Kapselt ein Solid mit Position, Rotation, Geschwindigkeit und Farbe.
 * Der Mesh-Buffer liegt im Solid (einmaliger GPU-Upload, shared).
 */

import * as l3d from "./lib-3d.ts";
import * as wgl from "./lib-wgl.ts";
import { Solid, darkenHex, createBox, createGrid, createSphere, createPyramid } from "./lib-solids.ts";

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
      l3d.createPlaneFromFace(faceIdx.map(i => worldVerts[i])),
    );
  }

  /** Zeichnet den Body. Farbe und ModelView werden pro Body gesetzt,
   *  der Mesh-Buffer kommt aus dem Solid (shared). */
  draw(view: l3d.Matrix4x4) {
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
// FREIE FUNKTIONEN
// ====================================================================

/**
 * Berechnet Entry- und Exit-Punkt einer Strecke durch einen Körper.
 * Die Strecke wird nicht verändert – reine Berechnung.
 *
 * @param p1     Startpunkt der Strecke (Weltkoordinaten)
 * @param p2     Endpunkt der Strecke (Weltkoordinaten)
 * @param planes Face-Planes des zu prüfenden Körpers
 * @returns { entry, exit } – null wenn kein Treffer
 */
export function getLineIntersections(
  p1: l3d.Vec3,
  p2: l3d.Vec3,
  planes: l3d.Plane[],
): { entry: l3d.Vec3 | null; exit: l3d.Vec3 | null } {
  if (planes.length === 0) return { entry: null, exit: null };

  const hits: { point: l3d.Vec3; distSq: number }[] = [];

  for (const face of planes) {
    const hit = face.intersectLine(p1, p2);
    if (hit) {
      hits.push({ point: hit, distSq: hit.sub(p1).squaredLength() });
    }
  }

  if (hits.length === 0) return { entry: null, exit: null };

  hits.sort((a, b) => a.distSq - b.distSq);

  // Entry = nächster Treffer, Exit = entferntester Treffer
  return {
    entry: hits[0].point,
    exit: hits.length > 1 ? hits[hits.length - 1].point : null,
  };
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