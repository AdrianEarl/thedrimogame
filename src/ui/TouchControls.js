import Phaser from "phaser";

// =================================
// TOUCH CONTROLS (phones / tablets)
// =================================
// Layout (game coordinates, the game is 1920 x 1080):
//   UP / DOWN buttons : bottom-left, hold to move between lanes
//   JUMP              : tap anywhere on the right half of the screen
//   PAUSE             : small button at the top
//   Menus             : tap anywhere
//
// The buttons only exist on touch devices. To preview them on a
// computer, open the game with  ?touch=1  at the end of the address.

const UP_BUTTON = { x: 150, y: 720, radius: 95, hit: 105 };
const DOWN_BUTTON = { x: 150, y: 930, radius: 95, hit: 105 };

// The JUMP button is only a hint: the whole right side is the target
const JUMP_BUTTON = { x: 1770, y: 880, radius: 110 };
const JUMP_ZONE_X = 960;

const PAUSE_BUTTON = { x: 700, y: 70, radius: 42, hit: 66 };

// Pause menu: tapping inside this rectangle restarts the run,
// tapping anywhere else resumes (see MenuScreens.js)
const RESTART_ZONE = new Phaser.Geom.Rectangle(700, 600, 520, 100);

const DEPTH = 150;
const IDLE_ALPHA = 0.35;
const PRESSED_ALPHA = 0.85;

export default class TouchControls {
  constructor(scene) {
    this.scene = scene;

    const params = new URLSearchParams(window.location.search);

    this.enabled =
      !!scene.sys.game.device.input.touch || params.has("touch");

    // Held buttons (read by Drimo every frame)
    this.up = false;
    this.down = false;

    this.visible = false;

    // One-shot events, consumed by GameScene
    this.jumpQueued = false;
    this.pauseQueued = false;
    this.tap = null;

    this.parts = [];

    if (!this.enabled) return;

    // Move + jump at the same time needs more than one finger.
    // (guarded so a scene restart does not keep adding pointers)
    if (scene.input.manager.pointers.length < 4) {
      scene.input.addPointer(2);
    }

    this.createButtons();

    scene.input.on("pointerdown", this.handleDown, this);

    scene.events.once("shutdown", () => this.destroy());

    this.setVisible(false);
  }

  // =================================
  // BUTTONS
  // =================================

  createButtons() {
    const scene = this.scene;

    const makeCircle = (def) =>
      scene.add
        .circle(0, 0, def.radius, 0xffffff, 0.22)
        .setStrokeStyle(6, 0xffffff, 0.9);

    // UP
    this.upButton = scene.add.container(UP_BUTTON.x, UP_BUTTON.y, [
      makeCircle(UP_BUTTON),
      scene.add.triangle(0, -4, 0, 56, 44, 0, 88, 56, 0xffffff, 1)
    ]);

    // DOWN
    this.downButton = scene.add.container(
      DOWN_BUTTON.x,
      DOWN_BUTTON.y,
      [
        makeCircle(DOWN_BUTTON),
        scene.add.triangle(0, 4, 0, 0, 88, 0, 44, 56, 0xffffff, 1)
      ]
    );

    // JUMP (hint only)
    this.jumpButton = scene.add.container(JUMP_BUTTON.x, JUMP_BUTTON.y, [
      makeCircle(JUMP_BUTTON),
      scene.add
        .text(0, 0, "JUMP", {
          fontFamily: "Arial",
          fontSize: "44px",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 6
        })
        .setOrigin(0.5)
    ]);

    // PAUSE (two bars)
    this.pauseButton = scene.add.container(
      PAUSE_BUTTON.x,
      PAUSE_BUTTON.y,
      [
        makeCircle(PAUSE_BUTTON),
        scene.add.rectangle(-9, 0, 9, 28, 0xffffff, 1),
        scene.add.rectangle(9, 0, 9, 28, 0xffffff, 1)
      ]
    );

    this.parts = [
      this.upButton,
      this.downButton,
      this.jumpButton,
      this.pauseButton
    ];

    for (const part of this.parts) {
      part.setDepth(DEPTH);
      part.setAlpha(IDLE_ALPHA);
    }
  }

  setVisible(visible) {
    this.visible = visible;

    for (const part of this.parts) {
      part.setVisible(visible);
    }

    if (!visible) {
      this.up = false;
      this.down = false;
    }
  }

  // =================================
  // INPUT
  // =================================

  handleDown(pointer) {
    this.tap = { x: pointer.x, y: pointer.y };

    const pauseDistance = Math.hypot(
      pointer.x - PAUSE_BUTTON.x,
      pointer.y - PAUSE_BUTTON.y
    );

    if (pauseDistance <= PAUSE_BUTTON.hit) {
      this.pauseQueued = true;
      return;
    }

    if (pointer.x >= JUMP_ZONE_X) {
      this.jumpQueued = true;
    }
  }

  // Call once per frame while playing
  update() {
    if (!this.enabled) return;

    let up = false;
    let down = false;
    let jumpHeld = false;

    if (this.visible) {
      for (const pointer of this.scene.input.manager.pointers) {
        if (!pointer.isDown) continue;

        const dUp = Math.hypot(
          pointer.x - UP_BUTTON.x,
          pointer.y - UP_BUTTON.y
        );

        const dDown = Math.hypot(
          pointer.x - DOWN_BUTTON.x,
          pointer.y - DOWN_BUTTON.y
        );

        if (dUp <= UP_BUTTON.hit && dUp <= dDown) {
          up = true;
        } else if (dDown <= DOWN_BUTTON.hit) {
          down = true;
        } else if (pointer.x >= JUMP_ZONE_X) {
          jumpHeld = true;
        }
      }
    }

    this.up = up;
    this.down = down;

    if (this.visible) {
      this.upButton.setAlpha(up ? PRESSED_ALPHA : IDLE_ALPHA);
      this.downButton.setAlpha(down ? PRESSED_ALPHA : IDLE_ALPHA);
      this.jumpButton.setAlpha(jumpHeld ? PRESSED_ALPHA : IDLE_ALPHA);
    }
  }

  // =================================
  // ONE-SHOT EVENTS
  // =================================

  consumeJump() {
    if (!this.jumpQueued) return false;

    this.jumpQueued = false;

    return true;
  }

  consumePause() {
    if (!this.pauseQueued) return false;

    this.pauseQueued = false;

    // The same touch must not also count as a menu tap
    this.tap = null;

    return true;
  }

  // Returns { x, y } of the last tap, or null
  consumeTap() {
    const tap = this.tap;

    this.tap = null;

    return tap;
  }

  // True if a tap position is on the pause menu's restart button
  static inRestartZone(tap) {
    return !!tap && RESTART_ZONE.contains(tap.x, tap.y);
  }

  // Forget everything pending, so a touch made in one state
  // cannot fire an action in the next one
  flush() {
    this.jumpQueued = false;
    this.pauseQueued = false;
    this.tap = null;
  }

  // =================================
  // CLEANUP
  // =================================

  destroy() {
    if (this.scene && this.scene.input) {
      this.scene.input.off("pointerdown", this.handleDown, this);
    }

    this.parts = [];
  }
}