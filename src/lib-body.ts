/**
 * lib-body.ts  –  Physik-fähiger 3D-Körper
 *
 * Kapselt ein Solid mit Position, Rotation, Geschwindigkeit
 * und optionaler Hitbox für Kollisionserkennung.
 *
 * Optimierung: Einmalig wird ein WebGL-Mesh-Buffer aus allen Kanten
 * erzeugt (createMesh), dann pro Frame nur noch ein einziger Draw Call
 * (drawMesh) statt N Einzel-Linien.
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

  /** Gepufferter Mesh (einmalig aus solid.edges erzeugt) */
  private _meshBuffer: WebGLBuffer | null = null;
  private _meshVertexCount = 0;

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

  /** Zeichnet den Body mittels einmalig erzeugtem Mesh-Buffer. */
  draw(proj: l3d.Matrix4x4, view: l3d.Matrix4x4): void {
    // ── Mesh-Buffer einmalig erzeugen ──
    if (!this._meshBuffer) {
      const verts: number[] = [];
      for (const [i, j] of this.solid.edges) {
        const a = this.solid.vertices[i];
        const b = this.solid.vertices[j];
        verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      this._meshBuffer = wgl.createMesh(new Float32Array(verts));
      this._meshVertexCount = this.solid.edges.length * 2;
    }

    // ── World-Matrix bauen ──
    const t = l3d.translateMatrix(this.pos.x, this.pos.y, this.pos.z);
    let world: l3d.Matrix4x4;
    if (this.rotX === 0 && this.rotY === 0 && this.rotZ === 0) {
      world = t;
    } else {
      world = l3d.multMatrix(t, l3d.rotateMatrix(this.rotX, this.rotY, this.rotZ));
    }

    // ── ModelView setzen ──
    const vw = l3d.multMatrix(view, world);
    wgl.setModelView(vw);

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

    // ── Ein einziger Draw Call für alle Kanten ──
    wgl.drawMesh(this._meshBuffer, this._meshVertexCount);
  }

  /** Distanz zu einem anderen Body (Mittelpunkt zu Mittelpunkt). */
  distanceTo(other: Body): number {
    return this.pos.distanceTo(other.pos);
  }
}
