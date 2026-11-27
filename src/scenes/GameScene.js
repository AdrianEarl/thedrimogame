import Phaser from "phaser";

import { GAME_SETTINGS } from "../config/gameConfig";

import Drimo from "../entities/Drimo";

import CollisionSystem from "../systems/CollisionSystem";
import ObstacleSystem from "../systems/ObstacleSystem";
import HealthSystem from "../systems/HealthSystem";
import ScoreSystem from "../systems/ScoreSystem";
import CoinSystem from "../systems/CoinSystem";
import PowerUpSystem from "../systems/PowerUpSystem";
import BackgroundSystem from "../systems/BackgroundSystem";
import BirdSystem from "../systems/BirdSystem";
import SoundSystem from "../systems/SoundSystem";

import HUD from "../ui/HUD";
import GameOverScreen from "../ui/GameOverScreen";
import MenuScreens from "../ui/MenuScreens";
import TouchControls from "../ui/TouchControls";

// =================================
// ASSET SETTINGS (edit these to match your files)
// =================================

// Number of frames in /assets/characters/jump/jump-1.png, jump-2.png, ...
const JUMP_FRAME_COUNT = 5;

// Number of frames in /assets/characters/death/death-1.png, death-2.png, ...
const DEATH_FRAME_COUNT = 5;

// Coin pickup sound
const COIN_SFX_PATH = "/assets/soundassets/Coin-Sound-Effect.mp3";

const formatMultiplier = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

// Rotating milestone events (every GAME_SETTINGS.milestoneEvery meters)
const MILESTONE_EVENTS = [
  { id: "surge", title: "SPEED SURGE!" },
  { id: "rush", title: "OBSTACLE RUSH!" },
  { id: "frenzy", title: "COIN FRENZY!" }
];

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");

    this.gameOver = false;
    this.dying = false;
    this.state = "title";
  }

  // Receives { skipTitle: true } when restarting
  init(data) {
    this.skipTitle = !!(data && data.skipTitle);
  }

  // =================================
  // 01. PRELOAD ASSETS
  // =================================

  preload() {
    // BACKGROUNDS (with their start / end transitions)
    BackgroundSystem.preload(this);

    // BACKGROUND BIRDS
    BirdSystem.preload(this);

    // HUD ICONS
    HUD.preload(this);

    // OBSTACLES
    ObstacleSystem.preload(this);

    // DRIMO: RUN
    for (let i = 1; i <= 8; i++) {
      const frame = String(i).padStart(2, "0");

      this.load.image(
        `drimo-run-${frame}`,
        `/assets/characters/run/run-${frame}.png`
      );
    }

    // DRIMO: JUMP
    for (let i = 1; i <= JUMP_FRAME_COUNT; i++) {
      const frame = String(i).padStart(2, "0");

      this.load.image(
        `drimo-jump-${frame}`,
        `/assets/characters/jump/jump-${i}.png`
      );
    }

    // DRIMO: DEATH
    for (let i = 1; i <= DEATH_FRAME_COUNT; i++) {
      const frame = String(i).padStart(2, "0");

      this.load.image(
        `drimo-death-${frame}`,
        `/assets/characters/death/death-${i}.png`
      );
    }

    // LOAD COIN FRAMES
    for (let i = 1; i <= 5; i++) {
      const frame = String(i).padStart(2, "0");

      this.load.image(
        `coin-${frame}`,
        `/assets/coins/coins-${frame}.png`
      );
    }

    // SOUND EFFECTS
    this.load.audio("coin-sfx", COIN_SFX_PATH);

    // ALL OTHER SOUNDS + MUSIC (see SoundSystem.js)
    SoundSystem.preload(this);
  }

  // =================================
  // 02. CREATE GAME
  // =================================

  create() {
    // Make sure a previous pause can never leak into a restart
    this.resumeEngine();

    this.gameOver = false;
    this.dying = false;
    this.deathElapsed = 0;

    this.worldWidth = GAME_SETTINGS.width;
    this.worldHeight = GAME_SETTINGS.height;

    // RESET DIFFICULTY WHEN GAME STARTS
    this.elapsedTime = 0;
    this.backgroundSpeed = GAME_SETTINGS.backgroundSpeed;
    this.difficultyMultiplier = 1;
    this.speedMultiplier = 1;

    // MILESTONE EVENT STATE
    this.milestoneEvent = null;
    this.lastMilestone = 0;
    this.eventSpeedFactor = 1;
    this.obstacleSpawnBoost = 1;
    this.coinSpawnBoost = 1;

    this.camera = this.cameras.main;

    this.camera.setBounds(
      0,
      0,
      this.worldWidth,
      this.worldHeight
    );

    this.sfx = new SoundSystem(this);

    this.createBackground();
    this.createBoundaries();
    this.createControls();
    this.createPlayer();
    this.createInterface();
    this.createSystems();
    this.createSpeedLines();

    this.menus = new MenuScreens(this);

    if (this.skipTitle) {
      this.beginCountdown();
    } else {
      this.enterTitle();
    }
  }

  // =================================
  // 03. BACKGROUND
  // =================================

  createBackground() {
    this.backgroundSystem = new BackgroundSystem(this);

    // Random birds flying over the searoad / baywalk backgrounds
    this.birdSystem = new BirdSystem(this);
  }

  // =================================
  // 04. UPDATE BACKGROUND
  // =================================

  updateBackground(deltaSeconds, speed = this.backgroundSpeed) {
    this.backgroundSystem.update(deltaSeconds, speed);

    this.birdSystem.update(deltaSeconds, speed);
  }

  // =================================
  // 05. DIFFICULTY PROGRESSION
  // =================================

  updateDifficulty(deltaSeconds) {
    // TRACK HOW LONG THE PLAYER HAS SURVIVED
    this.elapsedTime += deltaSeconds;

    // BASE DIFFICULTY SPEED
    const difficultySpeed = Math.min(
      GAME_SETTINGS.backgroundSpeed +
      this.elapsedTime *
      GAME_SETTINGS.backgroundSpeedIncrease,

      GAME_SETTINGS.backgroundSpeedMax
    );

    this.difficultyMultiplier =
      difficultySpeed / GAME_SETTINGS.backgroundSpeed;

    // COMBINE EVERY SPEED MODIFIER:
    // difficulty x milestone surge
    const combined =
      this.difficultyMultiplier *
      this.eventSpeedFactor;

    // Effective world speed. The spawn timers read this too,
    // so the pixel spacing between objects stays constant.
    this.speedMultiplier = Math.min(
      combined,
      GAME_SETTINGS.maxWorldMultiplier
    );

    this.backgroundSpeed =
      GAME_SETTINGS.backgroundSpeed * this.speedMultiplier;

    const objectSpeed =
      GAME_SETTINGS.obstacleSpeed * this.speedMultiplier;

    this.obstacleSystem.speed = objectSpeed;
    this.coinSystem.speed = objectSpeed;
    this.powerUpSystem.speed = objectSpeed;
  }

  // =================================
  // 06. BOUNDARIES
  // =================================

  createBoundaries() {
    this.roadTop =
      this.worldHeight * GAME_SETTINGS.obstacleTop;

    this.roadBottom =
      this.worldHeight * GAME_SETTINGS.obstacleBottom;

    // Debug lines are only created in debug mode
    if (!GAME_SETTINGS.debug) return;

    this.roadTopDebug = this.add.rectangle(
      this.worldWidth / 2,
      this.roadTop,
      this.worldWidth,
      4,
      0x00ff00
    ).setDepth(50);

    this.roadBottomDebug = this.add.rectangle(
      this.worldWidth / 2,
      this.roadBottom,
      this.worldWidth,
      4,
      0xff0000
    ).setDepth(50);
  }

  // =================================
  // 07. CONTROLS
  // =================================

  createControls() {
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;

    // On-screen buttons for phones (does nothing on a computer)
    this.touch = new TouchControls(this);

    const keyMap = {
      up: KeyCodes.W,
      down: KeyCodes.S,
      jump: KeyCodes.SPACE,
      jumpAlt: KeyCodes.J,
      jumpAlt2: KeyCodes.SHIFT,
      pause: KeyCodes.P,
      escape: KeyCodes.ESC,
      start: KeyCodes.ENTER,
      restart: KeyCodes.R
    };

    // Test keys exist only in debug mode
    if (GAME_SETTINGS.debug) {
      keyMap.damage = KeyCodes.H;
      keyMap.collect = KeyCodes.C;
    }

    this.keys = this.input.keyboard.addKeys(keyMap);

    this.cursors = this.input.keyboard.createCursorKeys();

    this.flushKeys();
  }

  // Consume any "just pressed" flags so an old key press
  // can't fire the moment a new state begins
  flushKeys() {
    const names = [
      "jump",
      "jumpAlt",
      "jumpAlt2",
      "pause",
      "escape",
      "start",
      "restart"
    ];

    for (const name of names) {
      Phaser.Input.Keyboard.JustDown(this.keys[name]);
    }

    if (this.touch) this.touch.flush();
  }

  // True when a phone is held upright (the game needs landscape)
  isPortrait() {
    return window.innerHeight > window.innerWidth;
  }

  // =================================
  // 08. PLAYER
  // =================================

  createPlayer() {
    this.drimo = new Drimo(this);
  }

  // =================================
  // 09. INTERFACE
  // =================================

  createInterface() {
    this.hud = new HUD(this);

    this.hud.updateHealth(
      GAME_SETTINGS.maxHealth,
      GAME_SETTINGS.maxHealth
    );

    this.scoreSystem = new ScoreSystem(this.hud);

    this.gameOverScreen = new GameOverScreen(this);
  }

  // =================================
  // 10. GAME SYSTEMS
  // =================================

  createSystems() {
    this.collisionSystem = new CollisionSystem();

    this.healthSystem = new HealthSystem(
      this,
      this.hud,
      () => this.endGame()
    );

    this.obstacleSystem = new ObstacleSystem(
      this,
      this.collisionSystem,
      () => this.handleObstacleHit()
    );

    this.coinSystem = new CoinSystem(
      this,
      (x, y) => this.handleCoinCollected(x, y),
      (result, x, y) => this.handleGroupResolved(result, x, y)
    );

    this.powerUpSystem = new PowerUpSystem(this);

    // INITIAL SPEEDS
    this.obstacleSystem.speed =
      GAME_SETTINGS.obstacleSpeed;

    this.coinSystem.speed =
      GAME_SETTINGS.obstacleSpeed;

    this.powerUpSystem.speed =
      GAME_SETTINGS.obstacleSpeed;
  }

  // Called by ObstacleSystem when an obstacle hurts Drimo
  handleObstacleHit() {
    const hurt = this.healthSystem.takeDamage();

    // A fatal hit plays the death sound instead (see endGame)
    if (hurt && !this.dying) {
      this.sfx.play("hit");
    }
  }

  // =================================
  // 11. COIN / COMBO CALLBACKS
  // =================================

  handleCoinCollected(x, y) {
    const points = this.scoreSystem.collectCoin();

    this.hud.spawnFloatingText(x, y - 20, `+${points}`);

    this.playCoinSound();
  }

  playCoinSound() {
    // Skip quietly if the sound file did not load
    if (!this.cache.audio.exists("coin-sfx")) return;

    this.sound.play("coin-sfx", { volume: 0.6 });
  }

  handleGroupResolved(result, x, y) {
    if (this.dying || this.gameOver) return;

    if (result === "complete") {
      const multiplier = this.scoreSystem.completeGroup();

      this.sfx.play("perfect");

      this.hud.spawnFloatingText(
        x,
        y - 70,
        `PERFECT! x${formatMultiplier(multiplier)}`,
        "#7dffb0",
        40
      );
    } else if (result === "missed") {
      if (GAME_SETTINGS.comboBreakOnMiss) {
        this.scoreSystem.breakCombo();
      }
    }
  }

  // =================================
  // 12. SPEED LINES
  // =================================

  createSpeedLines() {
    this.speedLines = [];
    this.speedLineIntensity = 0;

    for (let i = 0; i < 18; i++) {
      const line = this.add.rectangle(
        Phaser.Math.Between(0, this.worldWidth),
        Phaser.Math.Between(0, this.worldHeight),
        Phaser.Math.Between(220, 520),
        3,
        0xffffff
      );

      line.setDepth(40);
      line.setVisible(false);
      line.baseAlpha = Phaser.Math.FloatBetween(0.15, 0.4);
      line.setAlpha(0);

      this.speedLines.push(line);
    }
  }

  updateSpeedLines(deltaSeconds) {
    // Fade in once the world is clearly faster than normal
    const target = Phaser.Math.Clamp(
      (this.speedMultiplier - 1.2) / 0.9,
      0,
      1
    );

    this.speedLineIntensity +=
      (target - this.speedLineIntensity) *
      Math.min(1, deltaSeconds * 3);

    const visible = this.speedLineIntensity > 0.01;

    for (const line of this.speedLines) {
      line.setVisible(visible);

      if (!visible) continue;

      line.setAlpha(this.speedLineIntensity * line.baseAlpha);

      line.x -= this.backgroundSpeed * 2.4 * deltaSeconds;

      if (line.x + line.width / 2 < 0) {
        line.x = this.worldWidth + line.width / 2 +
          Phaser.Math.Between(0, 400);
        line.y = Phaser.Math.Between(0, this.worldHeight);
      }
    }
  }

  // =================================
  // 13. MILESTONES
  // =================================

  checkMilestones() {
    const step = GAME_SETTINGS.milestoneEvery;

    const reached = Math.floor(
      this.scoreSystem.distance / step
    );

    if (reached > this.lastMilestone) {
      this.lastMilestone = reached;
      this.triggerMilestone(reached * step, reached);
    }
  }

  triggerMilestone(meters, index) {
    const event =
      MILESTONE_EVENTS[(index - 1) % MILESTONE_EVENTS.length];

    this.milestoneEvent = {
      id: event.id,
      remaining: GAME_SETTINGS.eventDuration
    };

    this.scoreSystem.addBonus(GAME_SETTINGS.milestoneBonus);

    this.sfx.play("milestone");

    this.hud.showBanner(
      `${meters} M`,
      `${event.title}  +${GAME_SETTINGS.milestoneBonus}`
    );
  }

  updateMilestoneEvent(deltaSeconds) {
    // Reset every frame, then re-apply the active event
    this.eventSpeedFactor = 1;
    this.obstacleSpawnBoost = 1;
    this.coinSpawnBoost = 1;

    if (!this.milestoneEvent) return;

    this.milestoneEvent.remaining -= deltaSeconds;

    if (this.milestoneEvent.remaining <= 0) {
      this.milestoneEvent = null;
      return;
    }

    switch (this.milestoneEvent.id) {
      case "surge":
        this.eventSpeedFactor = GAME_SETTINGS.surgeSpeedFactor;
        break;

      case "rush":
        this.obstacleSpawnBoost = GAME_SETTINGS.rushSpawnBoost;
        break;

      case "frenzy":
        this.coinSpawnBoost = GAME_SETTINGS.frenzyCoinBoost;
        break;

      default:
        break;
    }
  }

  // =================================
  // 14. GAME FLOW (title / countdown / pause)
  // =================================

  enterTitle() {
    this.state = "title";
    this.menus.showTitle();

    // No score / health HUD behind the title screen
    this.hud.setVisible(false);
    this.touch.setVisible(false);
  }

  beginCountdown() {
    this.state = "countdown";
    this.countdownTime = 3;
    this.lastCountdownNumber = null;

    this.menus.hideTitle();
    this.flushKeys();

    this.hud.setVisible(true);
    this.touch.setVisible(true);
  }

  pauseGame() {
    this.state = "paused";

    this.touch.flush();

    this.time.paused = true;
    this.tweens.pauseAll();
    this.anims.pauseAll();
    this.sound.pauseAll();

    this.menus.showPause();
  }

  resumeGame() {
    this.menus.hidePause();

    this.touch.flush();

    this.resumeEngine();

    this.state = "playing";
  }

  resumeEngine() {
    this.time.paused = false;
    this.tweens.resumeAll();
    this.anims.resumeAll();
    this.sound.resumeAll();
  }

  restartGame() {
    this.resumeEngine();

    this.scene.restart({ skipTitle: true });
  }

  // =================================
  // 15. DEATH / GAME OVER
  // =================================

  // Called by HealthSystem when health reaches 0.
  // Starts a slow-motion death before the game over screen.
  endGame() {
    if (this.dying || this.gameOver) return;

    this.dying = true;
    this.state = "dying";
    this.deathElapsed = 0;

    this.healthSystem.destroy();
    this.drimo.playDeath();

    this.sfx.stopMusic();
    this.sfx.play("death");

    this.cameras.main.shake(450, 0.02, true);
  }

  finishGame() {
    if (this.gameOver) return;

    this.gameOver = true;
    this.state = "gameover";

    // Taps are ignored briefly so a jump tap does not skip the screen
    this.gameOverAt = this.time.now;

    this.touch.setVisible(false);

    this.sfx.play("gameover");

    // Lets the death animation finish on its last frame
    this.drimo.stopAnimation();

    this.obstacleSystem.clear();
    this.coinSystem.clear();
    this.powerUpSystem.clear();

    const result = this.scoreSystem.submitFinalScore();

    // Don't let an old R press restart instantly
    this.flushKeys();

    this.gameOverScreen.show({
      score: this.scoreSystem.score,
      best: result.best,
      isNewBest: result.isNewBest,
      distance: this.scoreSystem.distance,
      coins: this.scoreSystem.coins,
      maxMultiplier: this.scoreSystem.maxMultiplier,
      time: this.elapsedTime,
      hits: this.scoreSystem.hits
    });
  }

  // =================================
  // 16. GAME LOOP
  // =================================

  update(time, delta) {
    // Clamp frame time so lag spikes / tab switches
    // can't teleport objects through the player
    const deltaSeconds =
      Math.min(delta, GAME_SETTINGS.maxDeltaMs) / 1000;

    switch (this.state) {
      case "title":
        this.updateTitle(deltaSeconds);
        break;

      case "countdown":
        this.updateCountdown(deltaSeconds);
        break;

      case "playing":
        this.updatePlaying(deltaSeconds);
        break;

      case "paused":
        this.updatePaused();
        break;

      case "dying":
        this.updateDying(deltaSeconds);
        break;

      case "gameover":
        this.updateGameOver();
        break;

      default:
        break;
    }
  }

  idleSpeed() {
    return (
      GAME_SETTINGS.backgroundSpeed *
      GAME_SETTINGS.idleScrollFactor
    );
  }

  updateTitle(deltaSeconds) {
    this.updateBackground(deltaSeconds, this.idleSpeed());

    const tapped = this.touch.consumeTap();

    if (
      Phaser.Input.Keyboard.JustDown(this.keys.jump) ||
      Phaser.Input.Keyboard.JustDown(this.keys.start) ||
      tapped
    ) {
      this.beginCountdown();
    }
  }

  updateCountdown(deltaSeconds) {
    this.updateBackground(deltaSeconds, this.idleSpeed());

    this.countdownTime -= deltaSeconds;

    if (this.countdownTime > 0) {
      const number = Math.ceil(this.countdownTime);

      if (number !== this.lastCountdownNumber) {
        this.lastCountdownNumber = number;
        this.menus.showCountdown(String(number));
        this.sfx.play("countdown");
      }

      return;
    }

    this.menus.showCountdown("GO!", true);

    this.sfx.play("go");
    this.sfx.playMusic();

    // Presses made during the countdown must not trigger actions
    this.flushKeys();

    this.state = "playing";
  }

  updatePaused() {
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.pause) ||
      Phaser.Input.Keyboard.JustDown(this.keys.escape)
    ) {
      this.resumeGame();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.restart)) {
      this.restartGame();
      return;
    }

    // TOUCH: tap the restart button to restart, anywhere else to resume
    const tap = this.touch.consumeTap();

    if (tap) {
      if (TouchControls.inRestartZone(tap)) {
        this.restartGame();
      } else {
        this.resumeGame();
      }
    }
  }

  updateGameOver() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.restart)) {
      this.restartGame();
      return;
    }

    const tap = this.touch.consumeTap();

    if (tap && this.time.now - this.gameOverAt > 800) {
      this.restartGame();
    }
  }

  // Slow-motion death: the world keeps moving, but slower and
  // slower, with no collisions, pickups or spawns.
  updateDying(realDelta) {
    this.deathElapsed += realDelta;

    const ramp = Phaser.Math.Clamp(
      this.deathElapsed / GAME_SETTINGS.deathSlowMoRamp,
      0,
      1
    );

    const scale = Phaser.Math.Linear(
      1,
      GAME_SETTINGS.deathSlowMoScale,
      ramp
    );

    const deltaSeconds = realDelta * scale;

    this.updateBackground(deltaSeconds);
    this.updateSpeedLines(deltaSeconds);

    this.drimo.update(
      deltaSeconds,
      this.keys,
      this.cursors,
      1,
      false
    );

    this.obstacleSystem.update(deltaSeconds);
    this.coinSystem.update(deltaSeconds);

    if (this.deathElapsed >= GAME_SETTINGS.deathSlowMoDuration) {
      this.finishGame();
    }
  }

  updatePlaying(deltaSeconds) {
    // TOUCH BUTTONS (held state for this frame)
    this.touch.update();

    // PHONE HELD UPRIGHT: pause until it is turned sideways
    if (this.touch.enabled && this.isPortrait()) {
      this.pauseGame();
      return;
    }

    // PAUSE
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.pause) ||
      Phaser.Input.Keyboard.JustDown(this.keys.escape) ||
      this.touch.consumePause()
    ) {
      this.pauseGame();
      return;
    }

    // ACTIONS (SPACE, J or SHIFT = jump)
    // JustDown is read for every key so none of them stays "pending"
    const jumpPressed = [
      Phaser.Input.Keyboard.JustDown(this.keys.jump),
      Phaser.Input.Keyboard.JustDown(this.keys.jumpAlt),
      Phaser.Input.Keyboard.JustDown(this.keys.jumpAlt2),
      this.touch.consumeJump()
    ].some(Boolean);

    if (jumpPressed) {
      if (this.drimo.startJump()) {
        this.sfx.play("jump");
      }
    }

    // EVENTS + DIFFICULTY
    this.updateMilestoneEvent(deltaSeconds);
    this.updateDifficulty(deltaSeconds);

    // DISTANCE + MILESTONES
    const meters =
      (this.backgroundSpeed * deltaSeconds) /
      GAME_SETTINGS.pixelsPerMeter;

    this.scoreSystem.addDistance(meters);
    this.checkMilestones();

    // BACKGROUND CHANGES EVERY 1000 METERS
    this.backgroundSystem.setDistance(this.scoreSystem.distance);

    // BACKGROUND + SPEED LINES
    this.updateBackground(deltaSeconds);
    this.updateSpeedLines(deltaSeconds);

    // PLAYER
    this.drimo.update(
      deltaSeconds,
      this.keys,
      this.cursors,
      this.speedMultiplier,
      true,
      this.touch
    );

    // OBSTACLES (may start the death sequence)
    this.obstacleSystem.update(deltaSeconds);

    // Kept on purpose: also stops coins from spawning
    // in the same frame the player died
    if (this.dying) return;

    // COINS
    this.coinSystem.update(deltaSeconds);

    // POWER-UPS
    this.powerUpSystem.update(deltaSeconds);

    // HUD
    this.hud.updatePowerUps(
      this.powerUpSystem.getActiveList()
    );

    // DEBUG TEST KEYS
    if (GAME_SETTINGS.debug) {
      // H = TEST DAMAGE
      if (Phaser.Input.Keyboard.JustDown(this.keys.damage)) {
        this.healthSystem.takeDamage();
      }

      // C = TEST COIN COLLECTION
      if (Phaser.Input.Keyboard.JustDown(this.keys.collect)) {
        this.scoreSystem.collectCoin();
      }
    }
  }
}