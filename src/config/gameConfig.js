import Phaser from "phaser";

export const GAME_SETTINGS = {
  width: 1920,
  height: 1080,

  // BACKGROUND DIFFICULTY
  backgroundSpeed: 450,
  backgroundSpeedIncrease: 3,
  backgroundSpeedMax: 900,

  // Hard cap for (difficulty x dash x slow-mo x events)
  maxWorldMultiplier: 3,

  // Background scroll speed on title / countdown (fraction of base)
  idleScrollFactor: 0.3,

  obstacleTop: 0.50,
  obstacleBottom: 0.90,

  drimoTop: 0.29,
  drimoBottom: 0.90,

  playerX: 0.20,
  playerY: 0.68,
  playerScale: 0.15,
  playerSpeed: 500,

  maxHealth: 100,
  damagePerHit: 10,

  // How long (ms) the player is invincible after taking a hit
  invincibilityDuration: 5000,

  obstacleSpeed: 450,
  obstacleWidth: 320,
  obstacleHeight: 100,

  // Size multiplier for obstacles. Types with enlarge: false
  // (puddle, pothole) ignore it - see OBSTACLE_TYPES.
  obstacleEnlarge: 1.5,
  obstacleSpawnMin: 3500,
  obstacleSpawnMax: 6500,

  // Obstacle damage hitbox = the obstacle's real SHAPE (its opaque
  // pixels), not a rectangle. Pixels with alpha below this value
  // (0-255) are ignored, which also skips soft ground shadows.
  obstacleMaskAlpha: 200,

  // How many obstacle pixels (texels) Drimo's foot must overlap
  // before it hurts. Higher = more forgiving at the edges.
  obstacleMinOverlapTexels: 3,

  // Fraction of Drimo's foot hitbox width ignored on EACH side when
  // checking obstacle damage, so clipping an edge does not hurt.
  footDamageInset: 0.2,

  // If a spawn fails (no clear spot), retry after this many seconds
  spawnRetryDelay: 0.3,

  // Max frame time (ms) used by the game loop, prevents
  // objects teleporting after lag spikes or tab switches
  maxDeltaMs: 50,

  // =================================
  // SCORING
  // =================================
  coinValue: 10,
  pixelsPerMeter: 60,
  distanceScorePerMeter: 1,

  // COMBO (consecutive fully-collected coin groups)
  comboStep: 0.5,          // multiplier gained per group
  comboMax: 5,             // multiplier cap
  comboBreakOnMiss: true,  // a group where you collect nothing resets combo

  // =================================
  // DASH
  // =================================
  dashDuration: 0.6,       // seconds
  dashCooldown: 3,         // seconds (starts when the dash ends)
  dashSpeedBoost: 1.8,     // world speed multiplier while dashing

  // =================================
  // JUMP
  // =================================
  jumpHeight: 170,         // pixels
  jumpDuration: 1.5,       // seconds at normal speed (was 1.0)

  // =================================
  // POWER-UPS
  // =================================
  powerUpSize: 72,
  powerUpSpawnMin: 12000,
  powerUpSpawnMax: 20000,
  shieldDuration: 10,
  magnetDuration: 8,
  magnetRadius: 380,
  magnetPullSpeed: 1100,
  slowMoDuration: 5,
  slowMoFactor: 0.55,
  doubleScoreDuration: 10,
  healAmount: 20,

  // =================================
  // MILESTONES
  // =================================
  milestoneEvery: 500,     // meters
  milestoneBonus: 100,
  eventDuration: 8,        // seconds
  surgeSpeedFactor: 1.25,
  rushSpawnBoost: 2,
  frenzyCoinBoost: 3,

  // =================================
  // DEATH
  // =================================
  deathSlowMoRamp: 0.35,     // real seconds to reach full slow motion
  deathSlowMoScale: 0.12,    // world speed during slow motion
  deathSlowMoDuration: 1.6,  // real seconds before the game over screen

  // DEBUG: road boundary lines + H (damage) / C (coin) test keys
  debug: false,
  showHitboxes: false
};

export const GAME_CONFIG = {
  type: Phaser.AUTO,
  parent: "app",

  width: GAME_SETTINGS.width,
  height: GAME_SETTINGS.height,

  backgroundColor: "#111111",

  pixelArt: true,
  roundPixels: true,

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};