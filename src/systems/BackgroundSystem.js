import { GAME_SETTINGS } from "../config/gameConfig";

// The background changes every this many meters
export const BACKGROUND_CHANGE_EVERY = 1000;

// Length (meters) of the blank space placed between the END
// transition of the old scene and the START transition of the
// next one. Set to 0 to turn it off.
export const BLANK_SPACE_METERS = 50;

// Color of the blank space
export const BLANK_SPACE_COLOR = 0xffffff;

// Obstacles, coins and power-ups never spawn (and are removed if
// still off-screen) within this many pixels of a transition or of
// the blank space.
export const TRANSITION_SAFE_MARGIN = 350;

// The strip is always built this many pixels past the right edge
// of the screen, so the spawners can see what is coming.
const LOOKAHEAD = 2000;

const BACKGROUND_PATH = "/assets/backgrounds";

// Order of the backgrounds. After the last one it loops back
// to the first. "file" is the file name without ".png":
//   <file>.png
//   <file>-start-transition.png
//   <file>-end-transition.png
export const BACKGROUND_STAGES = [
  { id: "night", file: "night-scene" },
  { id: "searoad", file: "searoad-scene" },
  { id: "baywalk", file: "baywalk-scene" },
  { id: "nrscc", file: "nrscc-scene" }
];

// Neighbouring images overlap by 1px so no hairline gap can
// show between them while scrolling.
const OVERLAP = 1;

// When the background changes, the strip becomes:
//   [current scene] [current END transition]
//   [BLANK SPACE]
//   [next START transition] [next scene ...]
//
// Every piece of the strip is a "segment" with a kind:
//   "scene" | "end" | "blank" | "start"
// and the id of the background it belongs to.
export default class BackgroundSystem {
  // Called from GameScene.preload()
  static preload(scene) {
    for (const stage of BACKGROUND_STAGES) {
      scene.load.image(
        `bg-${stage.id}`,
        `${BACKGROUND_PATH}/${stage.file}.png`
      );

      scene.load.image(
        `bg-${stage.id}-start`,
        `${BACKGROUND_PATH}/${stage.file}-start-transition.png`
      );

      scene.load.image(
        `bg-${stage.id}-end`,
        `${BACKGROUND_PATH}/${stage.file}-end-transition.png`
      );
    }
  }

  constructor(scene) {
    this.scene = scene;

    // Every piece currently in the strip, left to right
    this.segments = [];

    // Entries waiting to be added (the transitions):
    //   { kind: "end" | "start", key, stage }
    //   { kind: "blank", width, stage }
    this.queue = [];

    // Which background is currently being laid out
    this.stageIndex = 0;

    // How many 1000 m steps have been reached
    this.step = 0;

    // Where the next image will be placed
    this.nextX = 0;

    this.fill();
  }

  // =================================
  // BUILDING THE STRIP
  // =================================

  appendSegment(key, kind, stage) {
    // Skip images that failed to load
    if (!this.scene.textures.exists(key)) {
      return false;
    }

    const image = this.scene.add.image(
      this.nextX,
      GAME_SETTINGS.height / 2,
      key
    );

    // Left-middle origin: x is the left edge of the image
    image.setOrigin(0, 0.5);

    // Every image is scaled to the full game height
    const scale = GAME_SETTINGS.height / image.height;

    image.setScale(scale);
    image.setDepth(0);

    const segment = {
      image,
      x: this.nextX,
      width: image.width * scale,
      scale,
      kind,
      stage
    };

    this.segments.push(segment);

    this.nextX += segment.width - OVERLAP;

    return true;
  }

  // A plain blank block (no image needed)
  appendBlank(width, stage) {
    const rect = this.scene.add.rectangle(
      this.nextX,
      GAME_SETTINGS.height / 2,
      width,
      GAME_SETTINGS.height,
      BLANK_SPACE_COLOR
    );

    rect.setOrigin(0, 0.5);
    rect.setDepth(0);

    const segment = {
      image: rect,
      x: this.nextX,
      width,
      scale: 1,
      kind: "blank",
      stage
    };

    this.segments.push(segment);

    this.nextX += segment.width - OVERLAP;

    return true;
  }

  // Adds pieces until the strip reaches LOOKAHEAD pixels past
  // the right edge of the screen
  fill() {
    const limit = GAME_SETTINGS.width + LOOKAHEAD;

    let guard = 0;

    while (this.nextX < limit && guard < 50) {
      guard += 1;

      if (this.queue.length > 0) {
        const entry = this.queue.shift();

        if (entry.kind === "blank") {
          this.appendBlank(entry.width, entry.stage);
        } else {
          this.appendSegment(entry.key, entry.kind, entry.stage);
        }

        continue;
      }

      const stage = BACKGROUND_STAGES[this.stageIndex];

      this.appendSegment(`bg-${stage.id}`, "scene", stage.id);
    }
  }

  // =================================
  // QUERIES (used by the spawners and the birds)
  // =================================

  // The piece of the strip at a screen x position (or null)
  getSegmentAt(x) {
    for (const segment of this.segments) {
      if (x >= segment.x && x < segment.x + segment.width) {
        return segment;
      }
    }

    return null;
  }

  // Id of the background at a screen x position
  getStageAt(x) {
    const segment = this.getSegmentAt(x);

    return segment
      ? segment.stage
      : BACKGROUND_STAGES[this.stageIndex].id;
  }

  // True if something of half-width "half" centered on x would
  // touch a transition, the blank space, or the safe margin
  // around them.
  isBlocked(x, half = 0) {
    const left = x - half;
    const right = x + half;

    for (const segment of this.segments) {
      if (segment.kind === "scene") continue;

      if (
        right > segment.x - TRANSITION_SAFE_MARGIN &&
        left < segment.x + segment.width + TRANSITION_SAFE_MARGIN
      ) {
        return true;
      }
    }

    return false;
  }

  // =================================
  // CHANGING THE BACKGROUND
  // =================================

  // Call every frame while playing with the distance in meters
  setDistance(meters) {
    const step = Math.floor(meters / BACKGROUND_CHANGE_EVERY);

    if (step > this.step) {
      this.step = step;

      this.changeStage(step % BACKGROUND_STAGES.length);
    }
  }

  changeStage(nextIndex) {
    if (nextIndex === this.stageIndex) return;

    // Whole scene images that start past this line are thrown
    // away. The image crossing the line is kept in full (NOT
    // cropped), so the END transition attaches to its real end.
    // The line is one safe margin past the screen edge, so the
    // transition and its safe zone always start off-screen.
    const cutX = GAME_SETTINGS.width + TRANSITION_SAFE_MARGIN;

    for (let i = this.segments.length - 1; i >= 0; i--) {
      const segment = this.segments[i];

      if (segment.x >= cutX) {
        segment.image.destroy();
        this.segments.splice(i, 1);
      }
    }

    const last = this.segments[this.segments.length - 1];

    this.nextX = last
      ? last.x + last.width - OVERLAP
      : cutX;

    const current = BACKGROUND_STAGES[this.stageIndex];
    const next = BACKGROUND_STAGES[nextIndex];

    this.queue = [
      { kind: "end", key: `bg-${current.id}-end`, stage: current.id }
    ];

    if (BLANK_SPACE_METERS > 0) {
      this.queue.push({
        kind: "blank",
        width: BLANK_SPACE_METERS * GAME_SETTINGS.pixelsPerMeter,
        stage: current.id
      });
    }

    this.queue.push({
      kind: "start",
      key: `bg-${next.id}-start`,
      stage: next.id
    });

    this.stageIndex = nextIndex;

    this.fill();
  }

  // =================================
  // UPDATE
  // =================================

  update(deltaSeconds, speed) {
    const distance = speed * deltaSeconds;

    this.nextX -= distance;

    for (let i = this.segments.length - 1; i >= 0; i--) {
      const segment = this.segments[i];

      segment.x -= distance;

      // Fully off the left side of the screen
      if (segment.x + segment.width <= 0) {
        segment.image.destroy();
        this.segments.splice(i, 1);
        continue;
      }

      segment.image.x = segment.x;
    }

    this.fill();
  }
}