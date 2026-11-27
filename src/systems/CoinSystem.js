import Phaser from "phaser";
import { GAME_SETTINGS } from "../config/gameConfig";

// Coin layouts. Each build() returns the coins of one group as
// offsets (dx, dy) from the group's anchor point.
// anchorTop = spawn at the top of the road (used by the "rain").
const PATTERNS = [
  {
    id: "line",
    weight: 3,
    build: () => {
      const count = Phaser.Math.Between(3, 4);

      return Array.from({ length: count }, (_, i) => ({
        dx: i * 80,
        dy: 0
      }));
    }
  },
  {
    id: "wave",
    weight: 2,
    build: () =>
      Array.from({ length: 8 }, (_, i) => ({
        dx: i * 70,
        dy: Math.sin(i * 0.85) * 90
      }))
  },
  {
    id: "arc",
    weight: 2,
    build: () => {
      const count = 7;

      return Array.from({ length: count }, (_, i) => ({
        dx: i * 75,
        dy: -Math.sin((i / (count - 1)) * Math.PI) * 130
      }));
    }
  },
  {
    id: "zigzag",
    weight: 1.5,
    build: () =>
      Array.from({ length: 6 }, (_, i) => ({
        dx: i * 85,
        dy: (i % 2 === 0 ? -1 : 1) * 65
      }))
  },
  {
    // Coins drift downward while they scroll toward the player
    id: "rain",
    weight: 1,
    anchorTop: true,
    build: () =>
      Array.from({ length: 10 }, (_, i) => ({
        dx: i * 50 + Phaser.Math.Between(-15, 15),
        dy: Phaser.Math.Between(0, 70),
        vy: Phaser.Math.Between(35, 85)
      }))
  }
];

export default class CoinSystem {
  constructor(scene, onCollect, onGroupResolved) {
    this.scene = scene;
    this.onCollect = onCollect;
    this.onGroupResolved = onGroupResolved;

    this.coins = [];

    this.speed = GAME_SETTINGS.obstacleSpeed;

    this.coinSize = 80;

    this.spawnTimer = 0;
    this.nextSpawn = this.randomSpawnDelay();

    this.createAnimation();
  }

  randomSpawnDelay() {
    return Phaser.Math.Between(4000, 5000) / 1000;
  }

  // =================================
  // 01. COIN ANIMATION
  // =================================

  createAnimation() {
    if (this.scene.anims.exists("coin-spin")) {
      return;
    }

    const frames = [];

    for (let i = 1; i <= 5; i++) {
      const frame = String(i).padStart(2, "0");

      frames.push({
        key: `coin-${frame}`
      });
    }

    this.scene.anims.create({
      key: "coin-spin",
      frames,
      frameRate: 10,
      repeat: -1
    });
  }

  // =================================
  // 02. CHECK OBSTACLE OVERLAP
  // =================================

  canSpawnAt(x, y) {
    // Never on the white space or next to a transition
    const background = this.scene.backgroundSystem;

    if (background && background.isBlocked(x, this.coinSize / 2)) {
      return false;
    }

    const coinBounds = new Phaser.Geom.Rectangle(
      x - this.coinSize / 2,
      y - this.coinSize / 2,
      this.coinSize,
      this.coinSize
    );

    const obstacles =
      this.scene.obstacleSystem?.obstacles || [];

    for (const obstacleData of obstacles) {
      const obstacle = obstacleData.sprite;

      if (!obstacle || !obstacle.active) continue;

      if (
        Phaser.Geom.Intersects.RectangleToRectangle(
          coinBounds,
          obstacle.getBounds()
        )
      ) {
        return false;
      }
    }

    // Keep clear of power-ups
    const powerUps = this.scene.powerUpSystem?.items || [];

    for (const item of powerUps) {
      if (!item || !item.sprite || !item.sprite.active) continue;

      const bounds = item.sprite.getBounds();

      const padded = new Phaser.Geom.Rectangle(
        bounds.x - 20,
        bounds.y - 20,
        bounds.width + 40,
        bounds.height + 40
      );

      if (
        Phaser.Geom.Intersects.RectangleToRectangle(
          coinBounds,
          padded
        )
      ) {
        return false;
      }
    }

    return true;
  }

  // =================================
  // 03. PICK A PATTERN
  // =================================

  pickPattern() {
    const total = PATTERNS.reduce(
      (sum, pattern) => sum + pattern.weight,
      0
    );

    let roll = Phaser.Math.FloatBetween(0, total);

    for (const pattern of PATTERNS) {
      roll -= pattern.weight;

      if (roll <= 0) {
        return pattern;
      }
    }

    return PATTERNS[0];
  }

  // =================================
  // 04. SPAWN COIN GROUP
  // Returns true if a group was spawned
  // =================================

  spawnGroup() {
    let pattern = this.pickPattern();
    let layout = pattern.build();

    const startX = GAME_SETTINGS.width + 100;

    const topBoundary =
      GAME_SETTINGS.height * GAME_SETTINGS.obstacleTop;

    const bottomBoundary =
      GAME_SETTINGS.height * GAME_SETTINGS.obstacleBottom;

    const minY = topBoundary + this.coinSize / 2;
    const maxY = bottomBoundary - this.coinSize / 2;

    this.maxCoinY = maxY;

    // Range the anchor may take so the whole pattern fits on the road
    let dys = layout.map(coin => coin.dy);
    let lowest = minY - Math.min(...dys);
    let highest = maxY - Math.max(...dys);

    // Safety net: fall back to a plain line
    if (!pattern.anchorTop && highest < lowest) {
      pattern = PATTERNS[0];
      layout = pattern.build();

      dys = layout.map(coin => coin.dy);
      lowest = minY - Math.min(...dys);
      highest = maxY - Math.max(...dys);
    }

    let spawnY = null;

    for (let attempt = 0; attempt < 30; attempt++) {
      const candidateY = pattern.anchorTop
        ? minY
        : Phaser.Math.Between(lowest, highest);

      let valid = true;

      for (const coin of layout) {
        if (
          !this.canSpawnAt(
            startX + coin.dx,
            candidateY + coin.dy
          )
        ) {
          valid = false;
          break;
        }
      }

      if (valid) {
        spawnY = candidateY;
        break;
      }
    }

    if (spawnY === null) {
      return false;
    }

    // One group object is shared by all its coins so we know
    // when the group was fully collected or fully missed
    const group = {
      total: layout.length,
      collected: 0,
      missed: 0,
      resolved: false
    };

    for (const entry of layout) {
      const coin = this.scene.add.sprite(
        startX + entry.dx,
        spawnY + entry.dy,
        "coin-01"
      );

      coin.setDisplaySize(this.coinSize, this.coinSize);
      coin.setDepth(8);
      coin.play("coin-spin");

      coin.group = group;
      coin.vy = entry.vy || 0;

      this.coins.push(coin);
    }

    return true;
  }

  // =================================
  // 05. GROUP RESOLUTION
  // =================================

  resolveGroupIfDone(group, x, y) {
    if (group.resolved) return;

    // Every coin of the group was removed (white space / transition)
    if (group.total <= 0) {
      group.resolved = true;
      return;
    }

    if (group.collected + group.missed < group.total) return;

    group.resolved = true;

    if (!this.onGroupResolved) return;

    if (group.collected === group.total) {
      this.onGroupResolved("complete", x, y);
    } else if (group.collected === 0) {
      this.onGroupResolved("missed", x, y);
    } else {
      this.onGroupResolved("partial", x, y);
    }
  }

  // =================================
  // 06. FOOT-ONLY PLAYER COLLISION
  // =================================

  checkCollection(coin) {
    // No pickups during the death sequence
    if (this.scene.dying) {
      return false;
    }

    const hitboxes = this.scene.drimo.getHitboxes();

    if (!hitboxes || !hitboxes.foot) {
      return false;
    }

    return Phaser.Geom.Intersects.RectangleToRectangle(
      hitboxes.foot,
      coin.getBounds()
    );
  }

  // =================================
  // 06b. WHITE SPACE / TRANSITION ZONES
  // A coin that is still off-screen but sits on the white space
  // or next to a transition is removed.
  // =================================

  isInBlockedZone(coin) {
    const background = this.scene.backgroundSystem;

    if (!background) return false;

    if (coin.x <= GAME_SETTINGS.width) return false;

    return background.isBlocked(coin.x, this.coinSize / 2);
  }

  // =================================
  // 07. UPDATE COINS
  // =================================

  update(deltaSeconds) {
    const dying = !!this.scene.dying;

    // Spawn timer scales with difficulty, same as obstacles.
    // Milestone "coin frenzy" boosts it further.
    if (!dying) {
      const speedMultiplier = this.scene.speedMultiplier || 1;
      const spawnBoost = this.scene.coinSpawnBoost || 1;

      this.spawnTimer +=
        deltaSeconds * speedMultiplier * spawnBoost;

      if (this.spawnTimer >= this.nextSpawn) {
        this.spawnTimer = 0;

        if (this.spawnGroup()) {
          this.nextSpawn = this.randomSpawnDelay();
        } else {
          // No clear spot: retry soon instead of waiting a full cycle
          this.nextSpawn = GAME_SETTINGS.spawnRetryDelay;
        }
      }
    }

    // MAGNET: pull nearby coins toward the player's feet
    let magnetTarget = null;

    const powerUps = this.scene.powerUpSystem;

    if (!dying && powerUps && powerUps.isActive("magnet")) {
      const foot = this.scene.drimo.getHitboxes().foot;

      magnetTarget = {
        x: foot.centerX,
        y: foot.centerY
      };
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];

      if (!coin.active) {
        this.coins.splice(i, 1);
        continue;
      }

      coin.x -= this.speed * deltaSeconds;

      if (this.isInBlockedZone(coin)) {
        const group = coin.group;
        const y = coin.y;

        coin.destroy();
        this.coins.splice(i, 1);

        if (group) {
          group.total -= 1;
          this.resolveGroupIfDone(group, 200, y);
        }

        continue;
      }

      // RAIN coins drift downward
      if (coin.vy) {
        coin.y = Math.min(
          coin.y + coin.vy * deltaSeconds,
          this.maxCoinY ?? coin.y
        );
      }

      if (magnetTarget) {
        const dx = magnetTarget.x - coin.x;
        const dy = magnetTarget.y - coin.y;
        const distance = Math.hypot(dx, dy);

        if (distance < GAME_SETTINGS.magnetRadius && distance > 1) {
          const pull = Math.min(
            distance,
            GAME_SETTINGS.magnetPullSpeed * deltaSeconds
          );

          coin.x += (dx / distance) * pull;
          coin.y += (dy / distance) * pull;
          coin.vy = 0;
        }
      }

      if (this.checkCollection(coin)) {
        const x = coin.x;
        const y = coin.y;
        const group = coin.group;

        coin.destroy();
        this.coins.splice(i, 1);

        this.onCollect(x, y);

        if (group) {
          group.collected += 1;
          this.resolveGroupIfDone(group, x, y);
        }

        continue;
      }

      if (coin.x + this.coinSize / 2 < 0) {
        const group = coin.group;

        coin.destroy();
        this.coins.splice(i, 1);

        if (group) {
          group.missed += 1;
          this.resolveGroupIfDone(group, 200, coin.y);
        }
      }
    }
  }

  // =================================
  // 08. CLEAR COINS
  // =================================

  clear() {
    for (const coin of this.coins) {
      coin.destroy();
    }

    this.coins = [];
  }
}