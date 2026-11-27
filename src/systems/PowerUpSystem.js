import Phaser from "phaser";
import { GAME_SETTINGS } from "../config/gameConfig";

const TEXTURE_SIZE = 72;

// Space kept between a power-up and obstacles / coins (pixels)
const SPAWN_CLEARANCE = 24;

// Same rectangle, grown on every side
const padRect = (rect, pad) =>
  new Phaser.Geom.Rectangle(
    rect.x - pad,
    rect.y - pad,
    rect.width + pad * 2,
    rect.height + pad * 2
  );

// The magnet is the only power-up in the game.
const TYPES = {
  magnet: {
    label: "MAGNET",
    pickup: "MAGNET!",
    color: 0xff4d4d,
    duration: GAME_SETTINGS.magnetDuration
  }
};

// =================================
// ICON DRAWING (no image assets needed)
// =================================

function drawBadge(graphics, color) {
  const c = TEXTURE_SIZE / 2;

  graphics.fillStyle(0x000000, 0.3);
  graphics.fillCircle(c, c + 3, c - 3);

  graphics.fillStyle(color, 1);
  graphics.fillCircle(c, c, c - 4);

  graphics.lineStyle(4, 0xffffff, 1);
  graphics.strokeCircle(c, c, c - 4);
}

function drawMagnetIcon(graphics, color) {
  drawBadge(graphics, color);

  graphics.fillStyle(0xffffff, 1);
  graphics.lineStyle(9, 0xffffff, 1);

  // U-shape: two legs + bottom half circle
  graphics.beginPath();
  graphics.moveTo(24, 20);
  graphics.lineTo(24, 36);
  graphics.arc(36, 36, 12, Math.PI, 0, true);
  graphics.lineTo(48, 20);
  graphics.strokePath();

  graphics.fillStyle(0xffd0d0, 1);
  graphics.fillRect(19.5, 15, 9, 9);
  graphics.fillRect(43.5, 15, 9, 9);
}

export default class PowerUpSystem {
  constructor(scene) {
    this.scene = scene;

    this.items = [];

    // key -> seconds remaining
    this.active = {};

    this.speed = GAME_SETTINGS.obstacleSpeed;

    this.spawnTimer = 0;
    this.nextSpawn = this.randomSpawnDelay();

    PowerUpSystem.createTextures(scene);
  }

  // Draws the magnet icon once into a texture (shared across restarts)
  static createTextures(scene) {
    const key = "powerup-magnet";

    if (scene.textures.exists(key)) return;

    const graphics = scene.make.graphics({
      x: 0,
      y: 0,
      add: false
    });

    drawMagnetIcon(graphics, TYPES.magnet.color);

    graphics.generateTexture(key, TEXTURE_SIZE, TEXTURE_SIZE);
    graphics.destroy();
  }

  randomSpawnDelay() {
    return (
      Phaser.Math.Between(
        GAME_SETTINGS.powerUpSpawnMin,
        GAME_SETTINGS.powerUpSpawnMax
      ) / 1000
    );
  }

  // =================================
  // QUERIES
  // =================================

  isActive(key) {
    return (this.active[key] || 0) > 0;
  }

  // For the HUD: active timed power-ups with remaining time
  getActiveList() {
    const list = [];

    for (const key of Object.keys(TYPES)) {
      if (this.isActive(key)) {
        list.push({
          key,
          label: TYPES[key].label,
          color: TYPES[key].color,
          remaining: this.active[key],
          duration: TYPES[key].duration
        });
      }
    }

    return list;
  }

  // =================================
  // SPAWNING
  // =================================

  canSpawnAt(x, y) {
    const size = GAME_SETTINGS.powerUpSize;

    const bounds = new Phaser.Geom.Rectangle(
      x - size / 2,
      y - size / 2,
      size,
      size
    );

    const obstacles =
      this.scene.obstacleSystem?.obstacles || [];

    for (const obstacleData of obstacles) {
      const sprite = obstacleData.sprite;

      if (!sprite || !sprite.active) continue;

      if (
        Phaser.Geom.Intersects.RectangleToRectangle(
          bounds,
          padRect(sprite.getBounds(), SPAWN_CLEARANCE)
        )
      ) {
        return false;
      }
    }

    const coins = this.scene.coinSystem?.coins || [];

    for (const coin of coins) {
      if (!coin || !coin.active) continue;

      if (
        Phaser.Geom.Intersects.RectangleToRectangle(
          bounds,
          padRect(coin.getBounds(), SPAWN_CLEARANCE)
        )
      ) {
        return false;
      }
    }

    return true;
  }

  spawn() {
    const size = GAME_SETTINGS.powerUpSize;

    const minY =
      GAME_SETTINGS.height * GAME_SETTINGS.obstacleTop +
      size / 2;

    const maxY =
      GAME_SETTINGS.height * GAME_SETTINGS.obstacleBottom -
      size / 2;

    const x = GAME_SETTINGS.width + 100;

    // Never on the white space or next to a transition
    const background = this.scene.backgroundSystem;

    if (
      background &&
      background.isBlocked(x, size / 2 + SPAWN_CLEARANCE)
    ) {
      return false;
    }

    let spawnY = null;

    for (let attempt = 0; attempt < 20; attempt++) {
      const candidateY = Phaser.Math.Between(minY, maxY);

      if (this.canSpawnAt(x, candidateY)) {
        spawnY = candidateY;
        break;
      }
    }

    if (spawnY === null) {
      return false;
    }

    const sprite = this.scene.add.image(
      x,
      spawnY,
      "powerup-magnet"
    );

    sprite.setDisplaySize(size, size);
    sprite.setDepth(8);

    this.items.push({
      type: "magnet",
      sprite,
      baseScale: sprite.scaleX,
      time: Math.random() * Math.PI * 2
    });

    return true;
  }

  // =================================
  // COLLECTION
  // =================================

  // ONLY THE FEET PICK POWER-UPS UP (not the head or body)
  collides(item) {
    const hitboxes = this.scene.drimo.getHitboxes();

    return Phaser.Geom.Intersects.RectangleToRectangle(
      hitboxes.foot,
      item.sprite.getBounds()
    );
  }

  collect(item) {
    const def = TYPES[item.type];
    const x = item.sprite.x;
    const y = item.sprite.y;

    // Picking up another magnet refreshes the timer
    this.active[item.type] = def.duration;

    if (this.scene.sfx) {
      this.scene.sfx.play("powerup");
    }

    this.scene.hud.spawnFloatingText(
      x,
      y - 40,
      def.pickup,
      "#ffffff",
      38
    );
  }

  expire(key) {
    delete this.active[key];
  }

  // =================================
  // UPDATE
  // =================================

  update(deltaSeconds) {
    // TIMERS
    for (const key of Object.keys(this.active)) {
      this.active[key] -= deltaSeconds;

      if (this.active[key] <= 0) {
        this.expire(key);
      }
    }

    // SPAWNING (scaled by world speed, like obstacles and coins)
    if (!this.scene.dying) {
      const speedMultiplier = this.scene.speedMultiplier || 1;

      this.spawnTimer += deltaSeconds * speedMultiplier;

      if (this.spawnTimer >= this.nextSpawn) {
        this.spawnTimer = 0;

        if (this.spawn()) {
          this.nextSpawn = this.randomSpawnDelay();
        } else {
          this.nextSpawn = GAME_SETTINGS.spawnRetryDelay;
        }
      }
    }

    // MOVEMENT + PICKUP
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      if (!item.sprite.active) {
        this.items.splice(i, 1);
        continue;
      }

      item.time += deltaSeconds;

      item.sprite.x -= this.speed * deltaSeconds;

      // Still off-screen but on the white space / next to a
      // transition: remove it
      if (
        item.sprite.x > GAME_SETTINGS.width &&
        this.scene.backgroundSystem &&
        this.scene.backgroundSystem.isBlocked(
          item.sprite.x,
          GAME_SETTINGS.powerUpSize / 2
        )
      ) {
        item.sprite.destroy();
        this.items.splice(i, 1);
        continue;
      }

      item.sprite.setScale(
        item.baseScale * (1 + 0.1 * Math.sin(item.time * 6))
      );

      if (!this.scene.dying && this.collides(item)) {
        this.collect(item);

        item.sprite.destroy();
        this.items.splice(i, 1);
        continue;
      }

      if (
        item.sprite.x + GAME_SETTINGS.powerUpSize / 2 < 0
      ) {
        item.sprite.destroy();
        this.items.splice(i, 1);
      }
    }
  }

  // =================================
  // CLEAR
  // =================================

  clear() {
    for (const item of this.items) {
      item.sprite.destroy();
    }

    this.items = [];

    for (const key of Object.keys(this.active)) {
      this.expire(key);
    }
  }
}