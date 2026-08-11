/**
 * lib-body.ts  –  Physik-fähiger 3D-Körper
 *
 * Kapselt ein Solid mit Position, Rotation, Geschwindigkeit und Farbe.
 * Der Mesh-Buffer liegt im Solid (einmaliger GPU-Upload, shared).
 */

import * as l3d from "./lib-3d.ts";
import * as wgl from "./lib-wgl.ts";
import { Solid, createBoxSolid, createGridSolid, createSphereSolid, createPyramidSolid } from "./lib-solids.ts";

// ====================================================================
// BODYCONFIG (entspricht C BodyConfig + BODY_CONFIG_DEFAULT)
// ====================================================================
export interface BodyConfig {
  color?: string;
  lineWidth?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
}

export const BODY_CONFIG_DEFAULT: BodyConfig = {
  color: "#ffffff",
  lineWidth: 1,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
};

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

  constructor(solid: Solid, x: number, y: number, z: number, cfg: BodyConfig = BODY_CONFIG_DEFAULT) {
    this.solid = solid;
    this.pos = new l3d.Vec3(x, y, z);
    this.vel = new l3d.Vec3(0, 0, 0);
    this.color = cfg.color ?? "#ffffff";
    this.lineWidth = cfg.lineWidth ?? 1;
    this.rotX = cfg.rotX ?? 0;
    this.rotY = cfg.rotY ?? 0;
    this.rotZ = cfg.rotZ ?? 0;
    solid.retain();
  }

  /** Gibt die Solid-Referenz frei.
   *  GPU-Buffer wird erst gelöscht, wenn der letzte Body
   *  dieses Solid dispose() aufruft. */
  dispose(): void {
    this.solid.release();
  }

  // ================================================================
  // FACE / INTERSECTION
  // ================================================================

  /**
   * Liefert die Face-Planes dieses Körpers in Weltkoordinaten.
   * Berücksichtigt sowohl Translation als auch Rotation.
   * Nur Bodies mit gesetzten `faces` liefern Ergebnisse.
   */
  getFacePlanes(): l3d.Plane[] {
    if (!this.faces || this.faces.length === 0) return [];

    // Rotation + Translation auf alle Vertices anwenden (wie in C)
    const rot = l3d.rotateMatrix(this.rotX, this.rotY, this.rotZ);
    const worldVerts = this.solid.vertices.map(v =>
      v.transform(rot).add(this.pos),
    );
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
    wgl.strokeColor(this.color);

    // ── Solid zeichnet mit shared Mesh-Buffer + eigener ModelView ──
    this.solid.draw(view, world);
  }

  /** Distanz zu einem anderen Body (Mittelpunkt zu Mittelpunkt). */
  distanceTo(other: Body): number {
    return this.pos.distanceTo(other.pos);
  }
}

// ====================================================================
// LINIE IN WELTKOORDINATEN (2-Punkt-Zeichnen)
// ====================================================================
export class Line {
  p1: l3d.Vec3;
  p2: l3d.Vec3;
  color = "#ffffff";
  lineWidth = 1;

  constructor(p1: l3d.Vec3, p2: l3d.Vec3) {
    this.p1 = p1;
    this.p2 = p2;
  }

  draw(view: l3d.Matrix4x4, toPoint?: l3d.Vec3) {
    wgl.setModelView(l3d.multMatrix(view, l3d.identityMatrix()));
    wgl.strokeColor(this.color);
    wgl.strokeWidth(this.lineWidth);
    const end = toPoint ?? this.p2;
    wgl.line(this.p1.x, this.p1.y, this.p1.z, end.x, end.y, end.z);
  }
}

// ====================================================================
// FACTORIES (freistehende Funktionen)
// ====================================================================
/** Erzeugt eine Line aus zwei Weltkoordinaten-Punkten. */
export function createLine(p1: l3d.Vec3, p2: l3d.Vec3): Line {
  return new Line(p1, p2);
}

/**
 * Erzeugt einen achsenparallelen Quader (Box) mit faces-Topologie.
 *
 * @param w Breite (X-Richtung)
 * @param h Höhe   (Y-Richtung)
 * @param d Tiefe  (Z-Richtung)
 * @param x,y,z Weltposition
 */
export function createBox(w: number, h: number, d: number, x: number, y: number, z: number, cfg?: BodyConfig): Body {
  const box = new Body(createBoxSolid(w, h, d), x, y, z, cfg);
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
export function createPyramid(base: number, height: number, x: number, y: number, z: number, cfg?: BodyConfig): Body {
  const pyr = new Body(createPyramidSolid(base, height), x, y, z, cfg);
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
export function createGrid(size: number, cells: number, x: number, y: number, z: number, cfg?: BodyConfig): Body {
  return new Body(createGridSolid(size, cells), x, y, z, cfg);
}

/**
 * Erzeugt eine Drahtgitter-Kugel (UV-Sphere).
 */
export function createSphere(radius: number, slices: number, stacks: number, x: number, y: number, z: number, cfg?: BodyConfig): Body {
  return new Body(createSphereSolid(radius, slices, stacks), x, y, z, cfg);
}

// ====================================================================
// VEHICLE – Physik-fähiges Fahrzeug mit Steering Behaviors
// ====================================================================
export class Vehicle {
  body: Body;
  vel: l3d.Vec3;
  accel: l3d.Vec3;
  heading: l3d.Vec3;

  constructor(body: Body) {
    this.body = body;
    this.vel = new l3d.Vec3(0, 0, 0);
    this.accel = new l3d.Vec3(0, 0, 0);
    this.heading = new l3d.Vec3(0, 0, 0);
  }

  /** Richtung des Bodys an die aktuelle Geschwindigkeit anpassen. */
  alignToVelocity() {
    const v = this.vel;
    const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (mag < 0.0001) return;

    const magXZ = Math.sqrt(v.x * v.x + v.z * v.z);
    this.body.rotX = Math.acos(v.y / mag);
    this.body.rotY = magXZ < 0.0001 ? 0 : Math.atan2(v.x / magXZ, v.z / magXZ);
    this.body.rotZ = 0;

    this.heading = new l3d.Vec3(v.x / mag, v.y / mag, v.z / mag);
  }

  /** Kraft auf das Fahrzeug anwenden (akkumuliert in accel). */
  applyForce(force: l3d.Vec3) {
    this.accel = this.accel.add(force);
  }

  /** Physik-Update: Geschwindigkeit aus Beschleunigung, Position aus Geschwindigkeit. */
  update() {
    this.vel = this.vel.add(this.accel);
    this.accel = new l3d.Vec3(0, 0, 0);
    this.body.pos = this.body.pos.add(this.vel);
  }

  /** Steering: Seek-Verhalten – bewegt sich mit maxSpeed=3, maxForce=1 auf ein Ziel zu. */
  seek(target: l3d.Vec3) {
    const desired = target.sub(this.body.pos).mag(3);
    const steer = desired.sub(this.vel).limit(1);
    this.applyForce(steer.scale(0.2));
  }
}

/** Erzeugt einen Array von Futter-Körpern an Zufallspositionen. */
export function createFood(count: number, color: string, randomFn: (min: number, max: number) => number): Body[] {
  const food: Body[] = [];
  const singleFoodMesh = createSphereSolid(3, 8, 8);
  const cfg: BodyConfig = { color, lineWidth: 1 };
  for (let i = 0; i < count; i++) {
    food.push(new Body(singleFoodMesh, randomFn(-100, 100), randomFn(-100, 100), randomFn(-100, 100), cfg));
  }
  return food;
}

/** Lässt ein Vehicle das nächste Futter suchen und fressen. */
export function vehicleEatFood(vehic: Vehicle, food: Body[]) {
  let mindist = Infinity;
  let idx = -1;

  for (let i = 0; i < food.length; i++) {
    const distance = vehic.body.pos.distanceTo(food[i].pos);
    if (distance < 100 && distance < mindist) {
      mindist = distance;
      idx = i;
    }
  }

  if (idx > -1) {
    if (vehic.body.pos.distanceTo(food[idx].pos) < 3) {
      food.splice(idx, 1);  // eat food
    } else {
      vehic.seek(food[idx].pos);
    }
  }
}