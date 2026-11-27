import Phaser from "phaser";
import { GAME_SETTINGS } from "../config/gameConfig";

// =================================
// BIRD SETTINGS (edit these to match your files)
// =================================

const BIRD_PATH = "/assets/bird";

// Frames: /assets/bird/bird-1.png, bird-2.png, ...
// 1 = a single static image. Frames that fail to load are skipped.
const BIRD_FRAME_COUNT = 4;
const BIRD_FRAME_RATE = 8;

// Backgrounds the birds may appear on (ids from BACKGROUND_STAGES)
const BIRD_SCENES = ["searoad", "baywalk"];

// Set to false if the bird image faces RIGHT
const BIRD_FACES_LEFT = false;

// On-screen height of a bird (pixels, before the random variation)
const BIRD_HEIGHT = 64;

// Birds fly in this band at the top of the screen
const BIRD_SKY_TOP = 60;
const BIRD_SKY_BOTTOM = 300;

// Seconds between flocks
const BIRD_SPAWN_MIN = 5;
const BIRD_SPAWN_MAX = 12;

// Birds drift with the background at this fraction of its speed,
// plus their own flying speed (pixels per second)
const BIRD_PARALLAX = 0.5;
const BIRD_OWN_SPEED_MIN = 90;
const BIRD_OWN_SPEED_MAX = 180;

// Decorative only: no collision, no damage.
// Depth 2 = in front of the background, behind everything else.
const BIRD_DEPTH = 2;

const frameKey = (i) => `bird-${String(i).padStart(2, "0")}`;

export default class BirdSystem {
  // Called from GameScene.preload()
  static preload(scene) {
    for (let i = 1; i <= BIRD_FRAME_COUNT; i++) {
      scene.load.image(
        frameKey(i),
        `${BIRD_PATH}/bird-${i}.png`
      );
    }
  }

  constructor(scene) {
    this.scene = scene;

    this.birds = [];

    this.frames = this.collectFrames();

    this.spawnTimer = 0;
    this.nextSpawn = this.randomSpawnDelay();

    this.createAnimation();
  }

  randomSpawnDelay() {
    return Phaser.Math.FloatBetween(BIRD_SPAWN_MIN, BIRD_SPAWN_MAX);
  }

  // Frames that actually loaded, stopping at the first gap
  collectFrames() {
    const frames = [];

    for (let i = 1; i <= BIRD_FRAME_COUNT; i++) {
      const key = frameKey(i);

      if (!this.scene.textures.exists(key)) break;

      frames.push({ key });
    }

    return frames;
  }

  createAnimation() {
    if (this.frames.length < 2) return;

    if (this.scene.anims.exists("bird-fly")) return;

    this.scene.anims.create({
      key: "bird-fly",
      frames: this.frames,
      frameRate: BIRD_FRAME_RATE,
      repeat: -1
    });
  }

  // True if a bird at this x is over a scene it may appear on
  // (not over a transition or the white space)
  allowedAt(x) {
    const background = this.scene.backgroundSystem;

    if (!background) return false;

    const segment = background.getSegmentAt(x);

    return (
      !!segment &&
      segment.kind === "scene" &&
      BIRD_SCENES.includes(segment.stage)
    );
  }

  // =================================
  // SPAWNING (a small flock of 1-3 birds)
  // =================================

  spawn() {
    if (this.frames.length === 0) return false;

    const startX = GAME_SETTINGS.width + 100;

    if (!this.allowedAt(startX)) return false;

    const count = Phaser.Math.Between(1, 3);
    const baseY = Phaser.Math.Between(BIRD_SKY_TOP, BIRD_SKY_BOTTOM);
    const ownSpeed = Phaser.Math.Between(
      BIRD_OWN_SPEED_MIN,
      BIRD_OWN_SPEED_MAX
    );

    let x = startX;

    for (let i = 0; i < count; i++) {
      const sprite = this.scene.add.sprite(
        x,
        baseY,
        this.frames[0].key
      );

      const height =
        BIRD_HEIGHT * Phaser.Math.FloatBetween(0.8, 1.2);

      sprite.setScale(height / sprite.height);
      sprite.setDepth(BIRD_DEPTH);
      sprite.setFlipX(!BIRD_FACES_LEFT);

      if (this.frames.length > 1) {
        sprite.play("bird-fly");
        sprite.anims.timeScale = Phaser.Math.FloatBetween(0.85, 1.15);
      }

      this.birds.push({
        sprite,
        baseY: baseY + Phaser.Math.Between(-30, 30),
        ownSpeed: ownSpeed + Phaser.Math.Between(-15, 15),
        bobAmplitude: Phaser.Math.Between(6, 18),
        bobSpeed: Phaser.Math.FloatBetween(1.5, 3),
        time: Math.random() * Math.PI * 2
      });

      x += Phaser.Math.Between(70, 150);
    }

    return true;
  }

  // =================================
  // UPDATE
  // speed = current background speed (pixels per second)
  // =================================

  update(deltaSeconds, speed) {
    // SPAWN TIMER
    this.spawnTimer += deltaSeconds;

    if (this.spawnTimer >= this.nextSpawn) {
      this.spawnTimer = 0;

      this.nextSpawn = this.spawn()
        ? this.randomSpawnDelay()
        : 1;
    }

    // MOVE
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const bird = this.birds[i];
      const sprite = bird.sprite;

      if (!sprite.active) {
        this.birds.splice(i, 1);
        continue;
      }

      bird.time += deltaSeconds;

      sprite.x -=
        (speed * BIRD_PARALLAX + bird.ownSpeed) * deltaSeconds;

      sprite.y =
        bird.baseY +
        Math.sin(bird.time * bird.bobSpeed) * bird.bobAmplitude;

      // Fade out over a transition / white space, fade back in
      // over an allowed scene
      const fadeStep = deltaSeconds * 2;

      const alpha = this.allowedAt(sprite.x)
        ? Math.min(1, sprite.alpha + fadeStep)
        : Math.max(0, sprite.alpha - fadeStep);

      sprite.setAlpha(alpha);

      const offScreen = sprite.x + sprite.displayWidth < 0;

      // Faded out completely after having been on screen
      const gone = alpha <= 0 && sprite.x < GAME_SETTINGS.width;

      if (offScreen || gone) {
        sprite.destroy();
        this.birds.splice(i, 1);
      }
    }
  }

  // =================================
  // CLEAR
  // =================================

  clear() {
    for (const bird of this.birds) {
      bird.sprite.destroy();
    }

    this.birds = [];
  }
}