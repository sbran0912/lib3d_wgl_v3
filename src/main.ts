import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
import { Body, createGrid, type BodyConfig } from "./lib-body.ts";
import { createPyramidSolid, createSphereSolid } from "./lib-solids.ts";

// ====================================================================
// VEHICLE – Physik-fähiges Fahrzeug mit Steering Behaviors
// ====================================================================
class Vehicle {
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
    const speed = this.vel.length();
    // normalize()/scale() sind pure Funktionen → Ergebnis zuweisen, sonst greift der Clamp nie
    this.vel = this.vel.normalize().scale(l3d.constrain(speed, 0.5, 2.0));
    this.accel = new l3d.Vec3(0, 0, 0);
    this.body.pos = this.body.pos.add(this.vel);
  }

  /** Steering: Seek-Verhalten – bewegt sich mit maxSpeed=3, maxForce=1 auf ein Ziel zu. */
  seek(target: l3d.Vec3) {
    const desired = target.sub(this.body.pos).limit(3);
    const steer = desired.sub(this.vel).limit(2);
    this.applyForce(steer.scale(0.2));
  }
}

/** Erzeugt einen Array von Futter-Körpern an Zufallspositionen. */
function createFood(count: number, color: string): Body[] {
  const food: Body[] = [];
  const singleFoodMesh = createSphereSolid(3, 8, 8);
  const cfg: BodyConfig = { color, lineWidth: 1 };
  for (let i = 0; i < count; i++) {
    food.push(new Body(singleFoodMesh, l3d.random(-100, 100), l3d.random(-100, 100), l3d.random(-100, 100), cfg));
  }
  return food;
}

/** Lässt ein Vehicle das nächste Futter suchen und fressen. */
function vehicleEatFood(vehic: Vehicle, food: Body[]) {
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

// ====================================================================
// KONFIGURATION
// ====================================================================

const SCREEN_W = 1200;
const SCREEN_H = 700;

const CAM_POS  = new l3d.Vec3(50, 100, 200);
const CAM_TARGET = new l3d.Vec3(0, 0, 0);
const CAM_UP     = new l3d.Vec3(0, 1, 0);

const FOV_Y = 1.2;
const Z_NEAR = 0.1;
const Z_FAR = 1000;


// ====================================================================
// SZENE AUFBAUEN
// ====================================================================

const grid = createGrid(600, 24, 0, 0, 0);
grid.color = "#777774";
grid.lineWidth = 1;

const poison = createFood(1, "#FF0000");
const food = createFood(30, "#44ff44");

const vehicleMesh = createPyramidSolid(3, 9);
const vehicles: Vehicle[] = [];

// Erstes Fahrzeug
for (let i =0; i < 10; i++) {
  const v = new Vehicle(new Body(vehicleMesh, 0, 20, 100));
  v.vel = new l3d.Vec3(l3d.randomFloat(-2, 2), l3d.randomFloat(-2, 2), l3d.randomFloat(-2, 2));
  vehicles.push(v);
}

// ====================================================================
// DRAW-SCHLEIFE
// ====================================================================

function draw() {
  wgl.background("#111184");
  wgl.setFog(100, 400, 0.25, 0.25, 0.25, 1);

  const view = l3d.lookAtMatrix(CAM_POS, CAM_TARGET, CAM_UP);
  const proj = l3d.perspectiveMatrix(FOV_Y, SCREEN_W / SCREEN_H, Z_NEAR, Z_FAR);
  wgl.setProjection(proj);

  grid.draw(view);

  for (const v of vehicles) {
    vehicleEatFood(v, food);
    v.alignToVelocity();
    v.update();
    v.body.draw(view);
  }

  for (const p of poison) {
    p.draw(view);
  }

  for (const f of food) {
    f.draw(view);
  }
}

// ====================================================================
// START
// ====================================================================

wgl.init(SCREEN_W, SCREEN_H);
wgl.startAnimation(draw);
