import Phaser from "phaser";
import { GAME_SETTINGS } from "../config/gameConfig";

// Highest frame number we look for when building animations.
// Frames must be numbered 01, 02, 03... with no gaps.
const MAX_FRAMES = 40;

// How long the death animation takes to play (seconds)
const DEATH_ANIM_SECONDS = 0.9;

// While jumping, Drimo cannot change lanes (W / S / up / down /
// the touch buttons do nothing until he lands). Set to false to
// allow moving in the air again.
const LOCK_LANES_WHILE_JUMPING = true;

// JUMP ANIMATION TIMING
// The first jump frame looks too much like standing, so this many
// frames are skipped at the start of every jump.
const JUMP_SKIP_FRAMES = 1;

// How long each remaining frame stays on screen, relative to the
// others (1 = normal). Frame 2 is now the first one shown, so a low
// number there makes it a quick flick into the jump pose.
// Frames without an entry use 1.
const JUMP_FRAME_WEIGHTS = [0.35, 1, 1, 1];

export default class Drimo {
  constructor(scene) {
    this.scene = scene;

    this.speed = GAME_SETTINGS.playerSpeed;

    this.alive = true;

    // JUMP STATE
    this.jumping = false;
    this.jumpTime = 0;
    this.jumpOffset = 0;
    this.jumpAnimActive = false;

    // Frame lists (filled in createAnimations)
    this.jumpFrames = [];
    this.deathFrames = [];

    // Jump frames to show, each with the jump progress (0-1) at
    // which it ends (built by buildJumpSequence)
    this.jumpSequence = [];

    this.createAnimations();
    this.createSprite();
    this.createShadow();
    this.createHitboxGraphics();
  }

  // Collects frames "<prefix>-01", "<prefix>-02"... that exist
  // as loaded textures, stopping at the first missing number.
  collectFrames(prefix) {
    const frames = [];

    for (let i = 1; i <= MAX_FRAMES; i++) {
      const key = `${prefix}-${String(i).padStart(2, "0")}`;

      if (!this.scene.textures.exists(key)) break;

      frames.push({ key });
    }

    return frames;
  }

  createAnimations() {
    const anims = this.scene.anims;

    const runFrames = this.collectFrames("drimo-run");

    this.jumpFrames = this.collectFrames("drimo-jump");
    this.deathFrames = this.collectFrames("drimo-death");

    this.buildJumpSequence();

    if (!anims.exists("drimo-run")) {
      anims.create({
        key: "drimo-run",
        frames: runFrames,
        frameRate: 10,
        repeat: -1
      });
    }

    // Plays once and holds on the last frame
    if (this.deathFrames.length > 0 && !anims.exists("drimo-death")) {
      anims.create({
        key: "drimo-death",
        frames: this.deathFrames,
        frameRate: this.deathFrames.length / DEATH_ANIM_SECONDS,
        repeat: 0
      });
    }
  }

  // Works out which jump frames are shown and for how long
  buildJumpSequence() {
    const skip =
      this.jumpFrames.length > JUMP_SKIP_FRAMES
        ? JUMP_SKIP_FRAMES
        : 0;

    const frames = this.jumpFrames.slice(skip);

    const weights = frames.map(
      (_, i) => JUMP_FRAME_WEIGHTS[i] ?? 1
    );

    const total = weights.reduce((sum, w) => sum + w, 0);

    let running = 0;

    this.jumpSequence = frames.map((frame, i) => {
      running += weights[i];

      return { key: frame.key, end: running / total };
    });
  }

  createSprite() {
    this.baseX = GAME_SETTINGS.width * GAME_SETTINGS.playerX;

    // groundY = the lane the player is running in.
    // sprite.y = groundY - jumpOffset.
    this.groundY = GAME_SETTINGS.height * GAME_SETTINGS.playerY;

    this.sprite = this.scene.add.sprite(
      this.baseX,
      this.groundY,
      "drimo-run-01"
    );

    this.sprite.setOrigin(0.5, 1);
    this.sprite.setScale(GAME_SETTINGS.playerScale);
    this.sprite.setDepth(10);

    // The run sprite's on-screen height is the reference size.
    // Jump and death frames are scaled to match it, even if
    // their image files have a different pixel size.
    this.runDisplayHeight = this.sprite.displayHeight;

    // Keep the size right whenever an animation changes frame
    // (covers the death animation, which plays by itself)
    this.sprite.on("animationstart", () => this.fitToRunSize());
    this.sprite.on("animationupdate", () => this.fitToRunSize());

    this.sprite.play("drimo-run");
  }

  // Scales the current frame so it is as tall as the run sprite
  fitToRunSize() {
    const frame = this.sprite.frame;

    if (!frame || !frame.height) return;

    const scale = this.runDisplayHeight / frame.height;

    if (Math.abs(this.sprite.scaleX - scale) > 0.0001) {
      this.sprite.setScale(scale);
    }
  }

  createShadow() {
    this.shadow = this.scene.add.ellipse(
      this.baseX,
      this.groundY,
      this.sprite.displayWidth * 0.6,
      26,
      0x000000,
      0.35
    );

    this.shadow.setDepth(9);
  }

  createHitboxGraphics() {
    this.hitboxGraphics = this.scene.add.graphics();
    this.hitboxGraphics.setDepth(20);
  }

  // =================================
  // ACTIONS
  // =================================

  startJump() {
    if (!this.alive || this.jumping) return false;

    this.jumping = true;
    this.jumpTime = 0;

    return true;
  }

  playDeath() {
    this.alive = false;

    if (this.deathFrames.length > 0) {
      // Real death animation
      this.sprite.clearTint();
      this.sprite.anims.timeScale = 1;
      this.sprite.play("drimo-death");
      this.fitToRunSize();

      return;
    }

    // Fallback when no death frames were loaded
    this.sprite.setTint(0xff5555);
    this.sprite.anims.timeScale = 0.2;

    this.scene.tweens.add({
      targets: this.sprite,
      angle: -70,
      duration: 900,
      ease: "Quad.easeIn"
    });
  }

  // Called when the game over screen appears. Leaves the death
  // animation alone so it can finish on its last frame.
  stopAnimation() {
    if (this.deathFrames.length > 0) return;

    this.sprite.anims.stop();
  }

  // =================================
  // JUMP ANIMATION
  // The jump frames follow the jump progress, so the pose always
  // matches the height no matter how fast the world is moving.
  // =================================

  showJumpFrame(progress) {
    if (!this.alive || this.jumpSequence.length === 0) return;

    if (!this.jumpAnimActive) {
      this.sprite.anims.stop();
      this.jumpAnimActive = true;
    }

    const step =
      this.jumpSequence.find((entry) => progress < entry.end) ||
      this.jumpSequence[this.jumpSequence.length - 1];

    this.sprite.setTexture(step.key);

    this.fitToRunSize();
  }

  endJumpAnimation() {
    if (!this.jumpAnimActive) return;

    this.jumpAnimActive = false;

    if (this.alive) {
      this.sprite.play("drimo-run");
      this.fitToRunSize();
    }
  }

  // =================================
  // STATE QUERIES
  // =================================

  isAirborne() {
    return this.jumping && this.jumpOffset > 20;
  }

  // How high Drimo is above the ground right now (pixels)
  getJumpOffset() {
    return this.jumpOffset;
  }

  getCenter() {
    return {
      x: this.sprite.x,
      y: this.sprite.y - this.sprite.displayHeight / 2
    };
  }

  // =================================
  // UPDATE
  // =================================

  update(
    deltaSeconds,
    keys,
    cursors,
    worldMultiplier = 1,
    controlsEnabled = true,
    touch = null
  ) {
    // LANE MOVEMENT (locked while jumping, if enabled above)
    if (
      controlsEnabled &&
      !(LOCK_LANES_WHILE_JUMPING && this.jumping)
    ) {
      const up =
        keys.up.isDown || cursors.up.isDown || !!(touch && touch.up);
      const down =
        keys.down.isDown || cursors.down.isDown || !!(touch && touch.down);

      // Opposite keys cancel out
      const moveY = (down ? 1 : 0) - (up ? 1 : 0);

      this.groundY += moveY * this.speed * deltaSeconds;
    }

    const playerHeight = this.sprite.displayHeight;

    const minY =
      GAME_SETTINGS.height * GAME_SETTINGS.drimoTop +
      playerHeight;

    const maxY =
      GAME_SETTINGS.height * GAME_SETTINGS.drimoBottom;

    this.groundY = Phaser.Math.Clamp(
      this.groundY,
      minY,
      maxY
    );

    // JUMP (advances faster when the world is faster, so the
    // distance covered in the air stays about the same)
    if (this.jumping) {
      const rate = Phaser.Math.Clamp(worldMultiplier, 0.6, 1.8);

      this.jumpTime += deltaSeconds * rate;

      const t = this.jumpTime / GAME_SETTINGS.jumpDuration;

      if (t >= 1) {
        this.jumping = false;
        this.jumpTime = 0;
        this.jumpOffset = 0;

        this.endJumpAnimation();
      } else {
        this.jumpOffset =
          4 * GAME_SETTINGS.jumpHeight * t * (1 - t);

        this.showJumpFrame(t);
      }
    }

    // Safety: always keep the sprite at the run sprite's size
    this.fitToRunSize();

    // APPLY POSITION
    this.sprite.x = this.baseX;
    this.sprite.y = this.groundY - this.jumpOffset;

    // SHADOW (stays on the ground, shrinks while airborne)
    const air = this.jumpOffset / GAME_SETTINGS.jumpHeight;

    this.shadow.setPosition(this.sprite.x, this.groundY - 2);
    this.shadow.setScale(1 - 0.45 * air);
    this.shadow.setAlpha(0.35 * (1 - 0.5 * air));

    this.drawHitboxes();
  }

  // =================================
  // THREE PLAYER HITBOXES
  // =================================

  getHitboxes() {
    const bounds = this.sprite.getBounds();

    // HEAD: TOP 25%
    const head = new Phaser.Geom.Rectangle(
      bounds.x + bounds.width * 0.275,
      bounds.y,
      bounds.width * 0.45,
      bounds.height * 0.25
    );

    // BODY: 25% TO 78%
    const body = new Phaser.Geom.Rectangle(
      bounds.x + bounds.width * 0.175,
      bounds.y + bounds.height * 0.25,
      bounds.width * 0.65,
      bounds.height * 0.53
    );

    // FEET: BOTTOM 22%
    const foot = new Phaser.Geom.Rectangle(
      bounds.x + bounds.width * 0.25,
      bounds.y + bounds.height * 0.78,
      bounds.width * 0.50,
      bounds.height * 0.22
    );

    return {
      head,
      body,
      foot
    };
  }

  drawHitboxes() {
    this.hitboxGraphics.clear();

    if (!GAME_SETTINGS.showHitboxes) {
      return;
    }

    const hitboxes = this.getHitboxes();

    // HEAD - BLUE
    this.hitboxGraphics.lineStyle(3, 0x00aaff, 1);
    this.hitboxGraphics.strokeRect(
      hitboxes.head.x,
      hitboxes.head.y,
      hitboxes.head.width,
      hitboxes.head.height
    );

    // BODY - YELLOW
    this.hitboxGraphics.lineStyle(3, 0xffff00, 1);
    this.hitboxGraphics.strokeRect(
      hitboxes.body.x,
      hitboxes.body.y,
      hitboxes.body.width,
      hitboxes.body.height
    );

    // FEET - GREEN
    this.hitboxGraphics.lineStyle(3, 0x00ff00, 1);
    this.hitboxGraphics.strokeRect(
      hitboxes.foot.x,
      hitboxes.foot.y,
      hitboxes.foot.width,
      hitboxes.foot.height
    );
  }

  getSprite() {
    return this.sprite;
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.hitboxGraphics.destroy();
  }
}