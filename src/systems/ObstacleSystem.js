import Phaser from "phaser";
import { GAME_SETTINGS } from "../config/gameConfig";

const OBSTACLE_PATH = "/assets/obstacles";

// Obstacle types (all of them are static, none move).
//
// key / file : texture key and file name in public/assets/obstacles
// weight     : how often it is picked (higher = more common)
// scale      : height relative to GAME_SETTINGS.obstacleHeight.
//              The width follows the image's own proportions.
// enlarge    : false = ignores GAME_SETTINGS.obstacleEnlarge (1.5x)
// scenes     : backgrounds the obstacle may appear in. Ids come from
//              BACKGROUND_STAGES: "night", "searoad", "baywalk", "nrscc"
// footprint  : how much of the BOTTOM of the obstacle's shape can hurt
//              Drimo (1 = the whole shape, 0.5 = the bottom half).
//              Damage follows the real shape of the image (its
//              opaque pixels), not a rectangle.
// jump       : how high Drimo must be to clear it, as a fraction of
//              GAME_SETTINGS.jumpHeight (higher = needs a bigger jump)
// minTime    : seconds survived before it can appear
export const OBSTACLE_TYPES = [
  {
    id: "pothole",
    key: "obstacle-pothole",
    file: "Pothole-Obstacle.png",
    weight: 4,
    scale: 1,
    enlarge: false,
    scenes: ["night", "searoad", "nrscc"],
    footprint: 1,
    jump: 0.15,
    minTime: 0
  },
  {
    id: "puddle",
    key: "obstacle-puddle",
    file: "Puddle-Obstacle.png",
    weight: 3,
    scale: 1,
    enlarge: false,
    scenes: ["night", "baywalk"],
    footprint: 1,
    jump: 0.15,
    minTime: 0
  },
  {
    id: "cone",
    key: "obstacle-cone",
    file: "Cone-Obstacle.png",
    weight: 3,
    scale: 1,
    scenes: ["night", "nrscc"],
    footprint: 0.5,
    jump: 0.3,
    minTime: 0
  },
  {
    id: "rock",
    key: "obstacle-rock",
    file: "Rock-Obstacle.png",
    weight: 3,
    scale: 1,
    scenes: ["searoad", "baywalk"],
    footprint: 0.6,
    jump: 0.35,
    minTime: 5
  },
  {
    id: "log",
    key: "obstacle-log",
    file: "Log-Obstacle.png",
    weight: 2.5,
    scale: 1,
    scenes: ["baywalk"],
    footprint: 0.6,
    jump: 0.4,
    minTime: 10
  },
  {
    id: "trash-can",
    key: "obstacle-trash-can",
    file: "Trash-Can-Obstacle.png",
    weight: 2,
    scale: 1.15,
    scenes: ["night", "baywalk", "nrscc"],
    footprint: 0.5,
    jump: 0.45,
    minTime: 15
  },
  {
    id: "hurdle",
    key: "obstacle-hurdle",
    file: "Hurdle-Obstacle.png",
    weight: 2,
    scale: 1.1,
    scenes: ["nrscc"],
    footprint: 0.4,
    jump: 0.5,
    minTime: 20
  },
  {
    id: "barrier",
    key: "obstacle-barrier",
    file: "Barrier-Obstacle.png",
    weight: 1.5,
    scale: 1.1,
    scenes: ["night", "nrscc"],
    footprint: 0.5,
    jump: 0.55,
    minTime: 25
  }
];

// Space kept around other spawned objects (pixels)
const SPAWN_CLEARANCE = 24;

// Same rectangle, grown on every side
const padRect = (rect, pad) =>
  new Phaser.Geom.Rectangle(
    rect.x - pad,
    rect.y - pad,
    rect.width + pad * 2,
    rect.height + pad * 2
  );

export default class ObstacleSystem {
  // Called from GameScene.preload()
  static preload(scene) {
    for (const type of OBSTACLE_TYPES) {
      scene.load.image(
        type.key,
        `${OBSTACLE_PATH}/${type.file}`
      );
    }
  }

  constructor(scene, collisionSystem, onCollision) {
    this.scene = scene;
    this.collisionSystem = collisionSystem;
    this.onCollision = onCollision;

    this.obstacles = [];

    this.speed = GAME_SETTINGS.obstacleSpeed;

    this.height = GAME_SETTINGS.obstacleHeight;

    this.roadTop =
      GAME_SETTINGS.height * GAME_SETTINGS.obstacleTop;

    this.roadBottom =
      GAME_SETTINGS.height * GAME_SETTINGS.obstacleBottom;

    this.spawnTimer = 0;
    this.nextSpawn = this.randomSpawnDelay();
  }

  randomSpawnDelay() {
    return (
      Phaser.Math.Between(
        GAME_SETTINGS.obstacleSpawnMin,
        GAME_SETTINGS.obstacleSpawnMax
      ) / 1000
    );
  }

  // =================================
  // 00. PICK OBSTACLE TYPE
  // =================================

  pickType() {
    const elapsed = this.scene.elapsedTime || 0;

    // Which background the new obstacle will appear on
    const background = this.scene.backgroundSystem;

    const stageId = background
      ? background.getStageAt(GAME_SETTINGS.width + 100)
      : null;

    // Only types that are unlocked, whose image loaded, and that
    // are allowed in this background
    const pool = OBSTACLE_TYPES.filter(
      type =>
        elapsed >= type.minTime &&
        this.scene.textures.exists(type.key) &&
        (!type.scenes || !stageId || type.scenes.includes(stageId))
    );

    if (pool.length === 0) {
      return null;
    }

    const total = pool.reduce(
      (sum, type) => sum + type.weight,
      0
    );

    let roll = Phaser.Math.FloatBetween(0, total);

    for (const type of pool) {
      roll -= type.weight;

      if (roll <= 0) {
        return type;
      }
    }

    return pool[0];
  }

  // =================================
  // 01. CHECK COIN OVERLAP
  // =================================

  canSpawnAt(y, width, height) {
    const obstacleBounds = new Phaser.Geom.Rectangle(
      GAME_SETTINGS.width + 100 - width / 2,
      y - height,
      width,
      height
    );

    const coins = this.scene.coinSystem?.coins || [];

    for (const coin of coins) {
      if (!coin || !coin.active) continue;

      if (
        Phaser.Geom.Intersects.RectangleToRectangle(
          obstacleBounds,
          coin.getBounds()
        )
      ) {
        return false;
      }
    }

    // Never spawn on top of a power-up
    const powerUps = this.scene.powerUpSystem?.items || [];

    for (const item of powerUps) {
      if (!item || !item.sprite || !item.sprite.active) continue;

      if (
        Phaser.Geom.Intersects.RectangleToRectangle(
          obstacleBounds,
          padRect(item.sprite.getBounds(), SPAWN_CLEARANCE)
        )
      ) {
        return false;
      }
    }

    return true;
  }

  // =================================
  // 02. SPAWN OBSTACLE
  // Returns true if an obstacle was spawned
  // =================================

  spawn() {
    const type = this.pickType();

    if (!type) {
      return false;
    }

    // Keep the image's own proportions
    const source = this.scene.textures
      .get(type.key)
      .getSourceImage();

    const enlarge =
      type.enlarge === false ? 1 : GAME_SETTINGS.obstacleEnlarge;

    const height = this.height * type.scale * enlarge;
    const width = height * (source.width / source.height);

    // Never spawn on the white space or next to a transition
    const background = this.scene.backgroundSystem;

    if (
      background &&
      background.isBlocked(GAME_SETTINGS.width + 100, width / 2)
    ) {
      return false;
    }

    // Origin is bottom-center, so y is the bottom edge
    const minY = this.roadTop + height;
    const maxY = this.roadBottom;

    if (maxY < minY) {
      return false;
    }

    let spawnY = null;

    // Find a position that does not overlap coins
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidateY = Phaser.Math.Between(minY, maxY);

      if (this.canSpawnAt(candidateY, width, height)) {
        spawnY = candidateY;
        break;
      }
    }

    if (spawnY === null) {
      return false;
    }

    const obstacle = this.scene.add.image(
      GAME_SETTINGS.width + 100,
      spawnY,
      type.key
    );

    obstacle.setOrigin(0.5, 1);
    obstacle.setDisplaySize(width, height);
    obstacle.setDepth(8);

    const hitboxGraphics = this.scene.add.graphics();
    hitboxGraphics.setDepth(9);

    this.obstacles.push({
      sprite: obstacle,
      hitboxGraphics,
      hasCollided: false,
      type: type.id,
      width,
      height,
      footprint: type.footprint,
      // Shape of the image: which pixels can hurt Drimo
      mask: this.collisionSystem.getMask(
        this.scene,
        type.key,
        type.footprint
      ),
      // Jump height (pixels) needed to clear this obstacle
      clearance: Math.max(20, type.jump * GAME_SETTINGS.jumpHeight)
    });

    return true;
  }

  // =================================
  // 03. DRAW COLLISION SHAPE (debug only)
  // Draws the exact pixels that can hurt Drimo
  // =================================

  drawCollisionBox(obstacleData) {
    const graphics = obstacleData.hitboxGraphics;

    graphics.clear();

    if (!GAME_SETTINGS.showHitboxes) return;

    const { sprite, mask } = obstacleData;

    const texelW = sprite.displayWidth / mask.w;
    const texelH = sprite.displayHeight / mask.h;

    const left = sprite.x - sprite.displayWidth / 2;
    const top = sprite.y - sprite.displayHeight;

    graphics.fillStyle(0xcc00ff, 0.45);

    for (const run of mask.runs) {
      graphics.fillRect(
        left + run.x0 * texelW,
        top + run.y * texelH,
        (run.x1 - run.x0 + 1) * texelW,
        texelH + 0.5
      );
    }
  }

  // =================================
  // 04. WHITE SPACE / TRANSITION ZONES
  // An obstacle that is still off-screen but sits on the white
  // space or next to a transition is removed.
  // =================================

  isInBlockedZone(obstacleData) {
    const background = this.scene.backgroundSystem;

    if (!background) return false;

    const obstacle = obstacleData.sprite;

    if (obstacle.x <= GAME_SETTINGS.width) return false;

    return background.isBlocked(
      obstacle.x,
      obstacleData.width / 2
    );
  }

  // =================================
  // 05. UPDATE OBSTACLES
  // =================================

  update(deltaSeconds) {
    const dying = !!this.scene.dying;

    // Spawn timer runs faster as the game speeds up, so
    // obstacle density keeps up with the difficulty.
    // Milestone "obstacle rush" boosts it further.
    if (!dying) {
      const speedMultiplier = this.scene.speedMultiplier || 1;
      const spawnBoost = this.scene.obstacleSpawnBoost || 1;

      this.spawnTimer +=
        deltaSeconds * speedMultiplier * spawnBoost;

      if (this.spawnTimer >= this.nextSpawn) {
        this.spawnTimer = 0;

        if (this.spawn()) {
          this.nextSpawn = this.randomSpawnDelay();
        } else {
          // No clear spot: retry soon instead of waiting a full cycle
          this.nextSpawn = GAME_SETTINGS.spawnRetryDelay;
        }
      }
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obstacleData = this.obstacles[i];
      const obstacle = obstacleData.sprite;

      if (!obstacle.active) {
        obstacleData.hitboxGraphics.destroy();
        this.obstacles.splice(i, 1);
        continue;
      }

      // Obstacles only scroll toward the player
      obstacle.x -= this.speed * deltaSeconds;

      if (this.isInBlockedZone(obstacleData)) {
        obstacle.destroy();
        obstacleData.hitboxGraphics.destroy();

        this.obstacles.splice(i, 1);
        continue;
      }

      this.drawCollisionBox(obstacleData);

      // ONLY FOOT COLLISION CAUSES DAMAGE
      if (!dying && !obstacleData.hasCollided) {
        if (
          this.collisionSystem.checkObstacleCollision(
            this.scene.drimo,
            obstacle,
            obstacleData
          )
        ) {
          obstacleData.hasCollided = true;

          this.onCollision();

          // The game over sequence clears this.obstacles and
          // destroys sprites, so stop iterating immediately.
          if (this.scene.gameOver) return;
        }
      }

      // REMOVE OFF-SCREEN OBSTACLES
      if (obstacle.x + obstacleData.width / 2 < 0) {
        obstacle.destroy();
        obstacleData.hitboxGraphics.destroy();

        this.obstacles.splice(i, 1);
      }
    }
  }

  // =================================
  // 06. CLEAR OBSTACLES
  // =================================

  clear() {
    for (const obstacleData of this.obstacles) {
      obstacleData.sprite.destroy();
      obstacleData.hitboxGraphics.destroy();
    }

    this.obstacles = [];
  }
}