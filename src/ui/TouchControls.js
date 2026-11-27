import Phaser from "phaser";

// =================================
// TOUCH CONTROLS (phones / tablets)
// =================================
// Layout (game coordinates, the game is 1920 x 1080):
//   UP / DOWN buttons : bottom-left, hold to move between lanes
//   JUMP              : tap anywhere on the right half of the screen
//   PAUSE             : small button at the top
//   FULLSCREEN        : small button next to pause. Uses the browser's
//                       own fullscreen API (not Phaser's), so it works
//                       in Brave / Chrome on Android. Hidden when the
//                       game is already running as an installed app, and
//                       on iPhone Safari (no fullscreen there: use
//                       "Add to Home Screen" instead).
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

// Always visible (title, pause and game over screens too)
const FULLSCREEN_BUTTON = { x: 830, y: 70, radius: 42, hit: 60 };
const FULLSCREEN_DEPTH = 350;

// Message shown when the browser refuses fullscreen
const FULLSCREEN_HINT =
  "Fullscreen blocked.\nBrowser menu > Add to Home screen\nto play without the address bar.";
const HINT_SECONDS = 3.5;

// Pause menu: tapping inside this rectangle restarts the run,
// tapping anywhere else resumes (see MenuScreens.js)
const RESTART_ZONE = new Phaser.Geom.Rectangle(700, 600, 520, 100);

const DEPTH = 150;
const IDLE_ALPHA = 0.35;
const PRESSED_ALPHA = 0.85;

// The small top buttons are easy to miss, so they are brighter
const TOP_BUTTON_ALPHA = 0.75;

// =================================
// BROWSER FULLSCREEN HELPERS
// =================================

// True when the game already runs as an installed app / fullscreen
const isStandalone = () => {
  try {
    return (
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  } catch (error) {
    return false;
  }
};

const fullscreenSupported = () => {
  const el = document.documentElement;

  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
};

const fullscreenActive = () =>
  !!(document.fullscreenElement || document.webkitFullscreenElement);

// Resolves to true if fullscreen started, false if it was refused
const enterFullscreen = () => {
  const el = document.documentElement;

  try {
    const result = el.requestFullscreen
      ? el.requestFullscreen({ navigationUI: "hide" })
      : el.webkitRequestFullscreen();

    if (result && typeof result.then === "function") {
      return result.then(() => true).catch(() => false);
    }

    return Promise.resolve(true);
  } catch (error) {
    return Promise.resolve(false);
  }
};

const exitFullscreen = () => {
  try {
    if (document.exitFullscreen) {
      const result = document.exitFullscreen();

      if (result && result.catch) result.catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch (error) {
    // Ignore
  }
};

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
    this.fullscreenButton = null;
    this.hintText = null;

    // Bound once so the same function can be removed on cleanup
    this.onFullscreenChange = this.onFullscreenChange.bind(this);

    if (!this.enabled) return;

    // Move + jump at the same time needs more than one finger.
    // (guarded so a scene restart does not keep adding pointers)
    if (scene.input.manager.pointers.length < 4) {
      scene.input.addPointer(2);
    }

    this.createButtons();

    scene.input.on("pointerdown", this.handleDown, this);
    scene.input.on("pointerup", this.handleUp, this);

    // Fullscreen on Android: lock to landscape once it starts
    document.addEventListener(
      "fullscreenchange",
      this.onFullscreenChange
    );
    document.addEventListener(
      "webkitfullscreenchange",
      this.onFullscreenChange
    );

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

    this.pauseButton.setAlpha(TOP_BUTTON_ALPHA);

    // FULLSCREEN (four corner brackets). Built whenever the browser
    // supports the fullscreen API, unless the game already runs as an
    // installed app. (No longer depends on Phaser's own check.)
    if (fullscreenSupported() && !isStandalone()) {
      const corners = scene.add.graphics();

      corners.lineStyle(7, 0xffffff, 1);

      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          corners.beginPath();
          corners.moveTo(sx * 16, sy * 6);
          corners.lineTo(sx * 16, sy * 16);
          corners.lineTo(sx * 6, sy * 16);
          corners.strokePath();
        }
      }

      this.fullscreenButton = scene.add.container(
        FULLSCREEN_BUTTON.x,
        FULLSCREEN_BUTTON.y,
        [makeCircle(FULLSCREEN_BUTTON), corners]
      );

      this.fullscreenButton.setDepth(FULLSCREEN_DEPTH);
      this.fullscreenButton.setAlpha(TOP_BUTTON_ALPHA);
    }

    // Small message shown if the browser refuses fullscreen
    this.hintText = scene.add
      .text(960, 150, FULLSCREEN_HINT, {
        fontFamily: "Arial",
        fontSize: "34px",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
        stroke: "#000000",
        strokeThickness: 7
      })
      .setOrigin(0.5, 0)
      .setDepth(FULLSCREEN_DEPTH + 10)
      .setVisible(false);
  }

  // =================================
  // FULLSCREEN
  // =================================

  nearFullscreenButton(pointer) {
    return (
      Math.hypot(
        pointer.x - FULLSCREEN_BUTTON.x,
        pointer.y - FULLSCREEN_BUTTON.y
      ) <= FULLSCREEN_BUTTON.hit
    );
  }

  // Must run inside a touch event (the browser requires it)
  toggleFullscreen() {
    if (fullscreenActive()) {
      exitFullscreen();
      return;
    }

    enterFullscreen().then((started) => {
      if (!started) this.showHint();
    });
  }

  showHint() {
    if (!this.hintText || !this.scene || !this.scene.tweens) return;

    this.scene.tweens.killTweensOf(this.hintText);

    this.hintText.setAlpha(1);
    this.hintText.setVisible(true);

    this.scene.tweens.add({
      targets: this.hintText,
      alpha: 0,
      delay: HINT_SECONDS * 1000,
      duration: 500,
      onComplete: () => {
        if (this.hintText) this.hintText.setVisible(false);
      }
    });
  }

  onFullscreenChange() {
    if (fullscreenActive()) {
      this.lockLandscape();
    } else {
      this.unlockOrientation();
    }
  }

  // Keeps the phone sideways in fullscreen (where the browser allows)
  lockLandscape() {
    try {
      if (window.screen.orientation && window.screen.orientation.lock) {
        window.screen.orientation.lock("landscape").catch(() => {});
      }
    } catch (error) {
      // Not supported: the "turn your phone" screen still covers it
    }
  }

  unlockOrientation() {
    try {
      if (window.screen.orientation && window.screen.orientation.unlock) {
        window.screen.orientation.unlock();
      }
    } catch (error) {
      // Ignore
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
    // The fullscreen button never counts as a tap, jump or pause
    if (this.fullscreenButton && this.nearFullscreenButton(pointer)) {
      return;
    }

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

  // Browsers only allow fullscreen from a finished touch, so the
  // toggle happens on release
  handleUp(pointer) {
    if (this.fullscreenButton && this.nearFullscreenButton(pointer)) {
      this.toggleFullscreen();
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
      this.scene.input.off("pointerup", this.handleUp, this);
    }

    document.removeEventListener(
      "fullscreenchange",
      this.onFullscreenChange
    );
    document.removeEventListener(
      "webkitfullscreenchange",
      this.onFullscreenChange
    );

    this.parts = [];
  }
}