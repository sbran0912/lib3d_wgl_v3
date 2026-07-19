/**
 * lib-body.ts  –  Physik-fähiger 3D-Körper
 *
 * Kapselt ein Solid mit Position, Rotation, Geschwindigkeit und Farbe.
 * Der Mesh-Buffer liegt im Solid (einmaliger GPU-Upload, shared).
 */

import * as l3d from "./lib-3d.ts";
import * as wgl from "./lib-wgl.ts";
import { Solid, darkenHex } from "./lib-solids.ts";

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
