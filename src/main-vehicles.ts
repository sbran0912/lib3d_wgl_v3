/**
 * main-vehicles.ts  –  Vehicle/Food-Demo
 *
 * Entspricht main.c aus dem C-Projekt.
 * Fahrzeuge (Pyramiden) jagen selbstständig Futter auf einem Gitter.
 */

import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
import { Body, Vehicle, createFood, vehicleEatFood, createGrid } from "./lib-body.ts";
import { createPyramidSolid } from "./lib-solids.ts";

// ====================================================================
// KONFIGURATION
// ====================================================================

const SCREEN_W = 1600;
const SCREEN_H = 1000;

const CAM_POS  = new l3d.Vec3(50, 100, 200);
const CAM_TARGET = new l3d.Vec3(0, 0, 0);
const CAM_UP     = new l3d.Vec3(0, 1, 0);

const FOV_Y = 1.2;
const Z_NEAR = 0.1;
const Z_FAR = 1000;

// Zufallszahlengenerator (Ersatz für C random_init/random)
let seed = 42;
function random(min: number, max: number): number {
  seed = (seed * 16807 + 0) % 2147483647;
  return min + (seed / 2147483647) * (max - min + 1);
}
function randomFloat(min: number, max: number): number {
  seed = (seed * 16807 + 0) % 2147483647;
  return min + (seed / 2147483647) * (max - min);
}

// ====================================================================
// SZENE AUFBAUEN
// ====================================================================

const grid = createGrid(600, 24, 0, 0, 0);
grid.color = "#777774";
grid.lineWidth = 1;

const poison = createFood(1, "#FF0000", random);
const food = createFood(30, "#44ff44", random);

const vehicleMesh = createPyramidSolid(3, 9);
const vehicles: Vehicle[] = [];

// Erstes Fahrzeug
const v1 = new Vehicle(new Body(vehicleMesh, 0, 20, 100));
v1.vel = new l3d.Vec3(randomFloat(-5, 5), randomFloat(-5, 5), randomFloat(-5, 5));
vehicles.push(v1);

// ====================================================================
// DRAW-SCHLEIFE
// ====================================================================

function draw() {
  wgl.background(40, 40, 40);
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
