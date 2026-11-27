import Phaser from "phaser";
import { GAME_SETTINGS } from "../config/gameConfig";

export default class CollisionSystem {
  constructor() {
    this.damageHitbox = "foot";

    // texture key + footprint -> shape mask (built once, reused)
    this.masks = new Map();
  }

  // =================================
  // OBSTACLE SHAPE MASKS
  // =================================

  // Builds (once per obstacle type) a pixel mask from the obstacle's
  // image: which pixels are solid, and which rows can hurt.
  //
  // footprint = fraction of the shape (measured from its lowest solid
  // pixel upward) that can hurt. 1 = the whole shape, 0.5 = the
  // bottom half. Tall objects therefore only hurt at their base.
  //
  // Each hurt row is "filled" from its leftmost to its rightmost
  // solid pixel, so thin objects (fence posts, a cone's tip) have no
  // gaps Drimo could slip through.
  getMask(scene, key, footprint = 1) {
    const cacheKey = `${key}|${footprint}`;

    if (this.masks.has(cacheKey)) {
      return this.masks.get(cacheKey);
    }

    const source = scene.textures.get(key).getSourceImage();

    const w = source.width;
    const h = source.height;

    const solid = new Uint8Array(w * h);

    let readable = false;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const context = canvas.getContext("2d", {
        willReadFrequently: true
      });

      context.drawImage(source, 0, 0);

      const data = context.getImageData(0, 0, w, h).data;

      for (let i = 0; i < w * h; i++) {
        if (data[i * 4 + 3] >= GAME_SETTINGS.obstacleMaskAlpha) {
          solid[i] = 1;
        }
      }

      readable = true;
    } catch (error) {
      // Pixels can't be read: fall back to the full image rectangle
    }

    if (!readable) {
      solid.fill(1);
    }

    // Vertical extent of the solid pixels
    let minY = h;
    let maxY = -1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (solid[y * w + x]) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          break;
        }
      }
    }

    // Nothing solid at all: treat the whole image as solid
    if (maxY < 0) {
      solid.fill(1);
      minY = 0;
      maxY = h - 1;
    }

    const shapeHeight = maxY - minY + 1;
    const hurtRows = Math.max(1, Math.round(shapeHeight * footprint));
    const hurtTop = maxY + 1 - hurtRows;

    // Fill each hurt row between its first and last solid pixel
    const hurt = new Uint8Array(w * h);
    const runs = [];

    for (let y = hurtTop; y <= maxY; y++) {
      let first = -1;
      let last = -1;

      for (let x = 0; x < w; x++) {
        if (solid[y * w + x]) {
          if (first < 0) first = x;
          last = x;
        }
      }

      if (first < 0) continue;

      for (let x = first; x <= last; x++) {
        hurt[y * w + x] = 1;
      }

      runs.push({ y, x0: first, x1: last });
    }

    const mask = { w, h, hurt, runs, hurtTop, maxY };

    this.masks.set(cacheKey, mask);

    return mask;
  }

  // Counts how many hurt pixels of the obstacle lie inside a
  // world-space rectangle.
  // Obstacles use origin (0.5, 1): x = center, y = bottom edge.
  countMaskOverlap(rect, obstacle, mask) {
    const texelW = obstacle.displayWidth / mask.w;
    const texelH = obstacle.displayHeight / mask.h;

    const left = obstacle.x - obstacle.displayWidth / 2;
    const top = obstacle.y - obstacle.displayHeight;

    const x0 = Math.max(0, Math.floor((rect.x - left) / texelW));
    const x1 = Math.min(
      mask.w - 1,
      Math.floor((rect.x + rect.width - left) / texelW)
    );

    const y0 = Math.max(
      mask.hurtTop,
      Math.floor((rect.y - top) / texelH)
    );
    const y1 = Math.min(
      mask.maxY,
      Math.floor((rect.y + rect.height - top) / texelH)
    );

    let count = 0;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (mask.hurt[y * mask.w + x]) count++;
      }
    }

    return count;
  }

  // The foot hitbox used for DAMAGE only. It is narrower than the
  // real foot box (coins and power-ups still use the full one), so
  // brushing the edge of an obstacle does not hurt.
  getDamageFoot(drimo) {
    const foot = drimo.getHitboxes().foot;

    const inset = foot.width * GAME_SETTINGS.footDamageInset;

    return new Phaser.Geom.Rectangle(
      foot.x + inset,
      foot.y,
      foot.width - inset * 2,
      foot.height
    );
  }

  // obstacleData = the entry stored in ObstacleSystem
  // ({ mask, clearance, ... })
  checkObstacleCollision(drimo, obstacle, obstacleData) {
    // JUMPING HIGH ENOUGH CLEARS THE OBSTACLE
    if (drimo.getJumpOffset() >= obstacleData.clearance) {
      return false;
    }

    // ONLY THE FOOT HITS, AND ONLY WHERE THE OBSTACLE REALLY IS
    const overlap = this.countMaskOverlap(
      this.getDamageFoot(drimo),
      obstacle,
      obstacleData.mask
    );

    return overlap >= GAME_SETTINGS.obstacleMinOverlapTexels;
  }

  checkHeadCollision(drimo, obstacle) {
    const hitboxes = drimo.getHitboxes();

    return Phaser.Geom.Intersects.RectangleToRectangle(
      hitboxes.head,
      obstacle.getBounds()
    );
  }

  checkBodyCollision(drimo, obstacle) {
    const hitboxes = drimo.getHitboxes();

    return Phaser.Geom.Intersects.RectangleToRectangle(
      hitboxes.body,
      obstacle.getBounds()
    );
  }
}