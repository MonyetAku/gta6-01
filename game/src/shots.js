// Deterministic screenshot scenes. Each one plays the real rules forward
// from a fresh world for a fixed number of steps with a scripted autopilot,
// so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { Car } from './vehicles.js';

const STEP = 1 / 60;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** Drive straight down a street lane: steer to hold `laneZ` while facing +x. */
function laneAutopilot(game, laneZ) {
  const car = game.playerCar;
  if (!car) return { forward: 0, back: 0, left: 0, right: 0, handbrake: 0, jump: 0, run: 0 };
  let h = car.heading; // want heading 0 (facing +x)
  while (h > Math.PI) h -= Math.PI * 2;
  while (h < -Math.PI) h += Math.PI * 2;
  // Target heading pulls z toward the lane: h* = (z - laneZ) * 0.06.
  const steer = clamp(((car.z - laneZ) * 0.06 - h) * 2.4, -1, 1);
  return { forward: 1, back: 0, left: steer > 0 ? 1 : 0, right: steer < 0 ? 1 : 0, handbrake: 0, jump: 0, run: 0 };
}

/** Drive north up the beach avenue (facing -z, ocean on the right). */
function avenueAutopilot(game, laneX) {
  const car = game.playerCar;
  if (!car) return { forward: 0, back: 0, left: 0, right: 0, handbrake: 0, jump: 0, run: 0 };
  let h = car.heading - Math.PI / 2; // want heading PI/2 (facing -z)
  while (h > Math.PI) h -= Math.PI * 2;
  while (h < -Math.PI) h += Math.PI * 2;
  const steer = clamp(((car.x - laneX) * 0.06 - h) * 2.4, -1, 1);
  return { forward: 1, back: 0, left: steer > 0 ? 1 : 0, right: steer < 0 ? 1 : 0, handbrake: 0, jump: 0, run: 0 };
}

function putPlayerInCar(game, model, color, x, z, heading) {
  const car = new Car(game.scene, model, color, x, z, heading);
  game.traffic.parked.push(car);
  game.player.x = x + 3;
  game.player.z = z + 3;
  game.enterCar(car);
  return car;
}

function runSteps(game, seconds, pilot) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    if (pilot) game.input.script = pilot(game);
    game.update(STEP);
  }
  game.input.script = null;
}

export function stageShot(name, game) {
  game.shotMode = true;
  game.start(false);
  game.cameraFixed = true;
  const shots = {
    chase() {
      // Police chase: sports car, 3 stars, mission 3 (Getaway) on the HUD.
      // The camera sits ahead of the car looking back, so the chasing
      // police are visible right behind it.
      game.missions.start(2);
      // Clear the player's street (z = 0) of traffic so the chase never stalls.
      for (const car of game.traffic.cars) {
        if (Math.abs(car.z) < 14 && car.x > -180 && car.x < 160) {
          car.loop = [
            { x: -284, z: -284 }, { x: -220, z: -284 }, { x: -220, z: -220 }, { x: -284, z: -220 },
          ];
          car.corner = 0;
          car.x = -284;
          car.z = -284;
        }
      }
      const car = putPlayerInCar(game, 'sports', 0xe82e5a, -140, 0, 0);
      car.speed = 16;
      game.police.setStars(3, 0);
      // Two units already on the tail, in frame from the first second.
      game.police.spawnUnitAt(-152, 3, 30);
      game.police.spawnUnitAt(-160, -3, 28);
      runSteps(game, 6, (g) => laneAutopilot(g, 0));
      game.cameraYaw = Math.PI; // ahead of the car, looking back at the chase
      game.cameraPitch = 0.34;
      game.cameraDist = 13;
    },
    street() {
      // On foot at a busy downtown intersection, traffic and pedestrians.
      game.player.x = -52;
      game.player.z = 0;
      game.player.heading = 0;
      game.cameraYaw = 0; // look east down the street
      game.cameraPitch = 0.3;
      game.cameraDist = 7.5;
      runSteps(game, 6, () => ({ forward: 1, back: 0, left: 0, right: 0, handbrake: 0, jump: 0, run: 0 }));
    },
    drive() {
      // Flat-out along the beach avenue, ocean on the right, skyline left.
      game.missions.start(0);
      game.missions.advance(); // step 2: drive the client to the Marina
      const car = putPlayerInCar(game, 'sports', 0x2e8a6a, 284, 120, Math.PI / 2);
      car.speed = 24;
      runSteps(game, 9, (g) => avenueAutopilot(g, 284));
      game.cameraYaw = Math.PI / 2; // behind the car (car faces -z, camera looks -z)
      game.cameraPitch = 0.35;
      game.cameraDist = 11;
    },
    mission() {
      // The Drop: package delivery at the Docks, rivals waiting, 2 stars.
      // The player walks south down the street to the marker — clear path.
      game.missions.start(3);
      game.missions.advance(); // step 2: deliver to the Docks (rivals spawn)
      game.player.x = -216;
      game.player.z = 196;
      game.player.heading = -Math.PI / 2;
      game.police.setStars(2, 0);
      game.police.spawnUnitAt(-216, 160, 16);
      game.cameraYaw = -Math.PI / 2; // behind the player, looking south to the Docks
      game.cameraPitch = 0.32;
      game.cameraDist = 10;
      runSteps(game, 5, () => ({ forward: 1, back: 0, left: 0, right: 0, handbrake: 0, jump: 0, run: 0 }));
    },
  };
  const fn = shots[name] || shots.chase;
  fn();
  // Settle the camera and HUD, render twice, signal the shot script.
  game.updateCamera(1 / 60);
  game.render();
  game.updateCamera(1 / 60);
  game.render();
  window.__shotReady = true;
}
