import Phaser from "phaser";

import { GAME_SETTINGS } from "../config/gameConfig";

const formatMultiplier = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const POWERUP_ROWS = 1;
const POWERUP_BAR_WIDTH = 160;

// Power-up indicator column (top-right corner)
const POWERUP_X = 1680;

// HUD images (all optional: anything missing is skipped and the
// plain HUD is used). Files live in public/assets/hud.
//   hud-score : panel drawn behind SCORE / COINS / DISTANCE / COMBO
//   hud-title : title card on the title screen (see MenuScreens.js)
// Optional small icons, if you add them later: hud-coin (left of
// COINS) and hud-magnet (power-up row).
const HUD_PATH = "/assets/hud";

export const HUD_ASSETS = [
  { key: "hud-score", file: "Score-Hud.png" },
  { key: "hud-title", file: "Title-Card.png" }
];

// Everything in the HUD (panel, texts, hearts) is multiplied by this.
// 2 = twice the original size. Lower it (e.g. 1.5) if the HUD covers
// too much of the playfield.
const HUD_SCALE = 1.1;

// The score panel sits in the top-LEFT corner, scaled to fit inside
// this box (pixels, before HUD_SCALE). SCORE, COINS, DISTANCE, COMBO
// and BEST are drawn inside it, with the hearts right under it.
const SCORE_PANEL_BOX = { left: 20, top: 20, width: 520, height: 215 };

// Heart texture size (the shape is drawn by code, no image needed)
const HEART_W = 72;
const HEART_H = 68;
const HEART_TEXTURE_SCALE = 2;

// Where the texts sit inside the panel, as fractions of its size
const SCORE_LAYOUT = {
  colLeft: 0.27,
  colRight: 0.73,
  rowTop: 0.25,
  rowMiddle: 0.5,
  rowBottom: 0.75
};

export default class HUD {
  // Called from GameScene.preload()
  static preload(scene) {
    for (const asset of HUD_ASSETS) {
      scene.load.image(asset.key, `${HUD_PATH}/${asset.file}`);
    }
  }

  constructor(scene) {
    this.scene = scene;


    const centerX = 960;

    // =================================
    // HEALTH
    // =================================

    // One heart per damage step (maxHealth / damagePerHit).
    // Each heart is an empty heart with a coloured heart on top
    // that is cropped when only part of it is left.
    HUD.createHeartTextures(scene);

    this.heartCount = Math.max(
      1,
      Math.round(GAME_SETTINGS.maxHealth / GAME_SETTINGS.damagePerHit)
    );

    this.heartsContainer = scene.add.container(0, 0);
    this.heartsContainer.setDepth(101);

    this.heartsEmpty = [];
    this.heartsFull = [];

    for (let i = 0; i < this.heartCount; i++) {
      const empty = scene.add.image(0, 0, "hud-heart-empty");
      const full = scene.add.image(0, 0, "hud-heart-full");

      this.heartsContainer.add([empty, full]);

      this.heartsEmpty.push(empty);
      this.heartsFull.push(full);
    }

    // =================================
    // SCORE / COINS / DISTANCE / COMBO
    // =================================

    this.scoreText = scene.add.text(
      centerX - 170,
      155,
      "SCORE: 0",
      {
        fontFamily: "Arial",
        fontSize: "30px",
        color: "#ffffff",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    this.coinsText = scene.add.text(
      centerX + 170,
      155,
      "COINS: 0",
      {
        fontFamily: "Arial",
        fontSize: "30px",
        color: "#ffd447",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    this.distanceText = scene.add.text(
      centerX - 170,
      200,
      "DISTANCE: 0 m",
      {
        fontFamily: "Arial",
        fontSize: "26px",
        color: "#9fd8ff",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    this.comboText = scene.add.text(
      centerX + 170,
      200,
      "COMBO x1",
      {
        fontFamily: "Arial",
        fontSize: "26px",
        color: "#dddddd",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    this.bestText = scene.add.text(
      1880,
      40,
      "BEST: 0",
      {
        fontFamily: "Arial",
        fontSize: "24px",
        color: "#ffffff",
        fontStyle: "bold"
      }
    ).setOrigin(1, 0.5);

    this.comboBaseColor = "#dddddd";
    this.lastMultiplier = 1;
    this.lastDistance = -1;

    // =================================
    // POWER-UP INDICATORS (top-right)
    // =================================

    this.powerUpRows = [];

    for (let i = 0; i < POWERUP_ROWS; i++) {
      const y = 40 + i * 52;

      const label = scene.add.text(
        POWERUP_X,
        y,
        "",
        {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 4
        }
      ).setOrigin(0, 0.5);

      const barBg = scene.add.rectangle(
        POWERUP_X,
        y + 24,
        POWERUP_BAR_WIDTH,
        10,
        0x333333
      ).setOrigin(0, 0.5);

      const barFill = scene.add.rectangle(
        POWERUP_X,
        y + 24,
        POWERUP_BAR_WIDTH,
        10,
        0xffffff
      ).setOrigin(0, 0.5);

      label.setDepth(100);
      barBg.setDepth(100);
      barFill.setDepth(101);

      label.setVisible(false);
      barBg.setVisible(false);
      barFill.setVisible(false);

      this.powerUpRows.push({ label, barBg, barFill, icon: null });
    }

    // =================================
    // MILESTONE BANNER
    // =================================

    this.bannerTitle = scene.add.text(
      centerX,
      330,
      "",
      {
        fontFamily: "Arial",
        fontSize: "96px",
        color: "#ffd447",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 10
      }
    ).setOrigin(0.5);

    this.bannerSub = scene.add.text(
      centerX,
      420,
      "",
      {
        fontFamily: "Arial",
        fontSize: "42px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 7
      }
    ).setOrigin(0.5);

    this.bannerTitle.setAlpha(0);
    this.bannerSub.setAlpha(0);

    // =================================
    // LOW-HEALTH VIGNETTE
    // =================================

    this.createVignette();

    this.lowHealth = false;
    this.vignetteTween = null;
    this.barTween = null;

    // =================================
    // DEPTHS
    // =================================

    this.scoreText.setDepth(100);
    this.coinsText.setDepth(100);
    this.distanceText.setDepth(100);
    this.comboText.setDepth(100);
    this.bestText.setDepth(100);
    this.bannerTitle.setDepth(120);
    this.bannerSub.setDepth(120);

    this.createIcons();
  }

  // =================================
  // OPTIONAL HUD ICONS
  // =================================

  createIcons() {
    const textures = this.scene.textures;

    // Panel behind the score block (below the texts, depth 100)
    if (textures.exists("hud-score")) {
      this.scorePanel = this.scene.add.image(0, 0, "hud-score");

      this.scorePanel.setDepth(99);
    }

    this.coinIcon = null;

    if (textures.exists("hud-coin")) {
      this.coinIcon = this.scene.add.image(0, 155, "hud-coin");

      this.fitIcon(this.coinIcon, 36);
      this.coinIcon.setDepth(100);

      this.placeCoinIcon();
    }

    this.layoutHud();
  }

  // =================================
  // HEART TEXTURES (drawn once by code)
  // =================================

  static createHeartTextures(scene) {
    if (scene.textures.exists("hud-heart-full")) return;

    const k = HEART_TEXTURE_SCALE;

    const make = (key, fillColor) => {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });

      // Black outline
      g.fillStyle(0x000000, 1);
      g.fillCircle(23 * k, 24 * k, 19 * k);
      g.fillCircle(49 * k, 24 * k, 19 * k);
      g.fillTriangle(5 * k, 33 * k, 67 * k, 33 * k, 36 * k, 66 * k);

      // Fill
      g.fillStyle(fillColor, 1);
      g.fillCircle(23 * k, 24 * k, 15 * k);
      g.fillCircle(49 * k, 24 * k, 15 * k);
      g.fillTriangle(9 * k, 31 * k, 63 * k, 31 * k, 36 * k, 60 * k);

      g.generateTexture(key, HEART_W * k, HEART_H * k);
      g.destroy();

      scene.textures
        .get(key)
        .setFilter(Phaser.Textures.FilterMode.LINEAR);
    };

    make("hud-heart-empty", 0x3a3a3a);
    make("hud-heart-full", 0xffffff);
  }

  // =================================
  // TOP-LEFT LAYOUT
  // Score panel in the corner, all the scoring inside it, and
  // the hearts right below it.
  // =================================

  // Readable text: bold, black outline that grows with HUD_SCALE
  styleText(text, size) {
    text
      .setFontSize(size * HUD_SCALE)
      .setStroke("#000000", Math.round(4 * HUD_SCALE));
  }

  layoutHud() {
    const box = SCORE_PANEL_BOX;

    let width = box.width * HUD_SCALE;
    let height = box.height * HUD_SCALE;

    if (this.scorePanel) {
      this.scorePanel.setOrigin(0, 0);

      this.scorePanel.setScale(
        Math.min(
          width / this.scorePanel.width,
          height / this.scorePanel.height
        )
      );

      this.scorePanel.setPosition(box.left, box.top);

      width = this.scorePanel.displayWidth;
      height = this.scorePanel.displayHeight;
    }

    const left = box.left;
    const top = box.top;
    const centerX = left + width / 2;

    const colLeft = left + width * SCORE_LAYOUT.colLeft;
    const colRight = left + width * SCORE_LAYOUT.colRight;

    const rowTop = top + height * SCORE_LAYOUT.rowTop;
    const rowMiddle = top + height * SCORE_LAYOUT.rowMiddle;
    const rowBottom = top + height * SCORE_LAYOUT.rowBottom;

    this.styleText(this.scoreText, 26);
    this.scoreText.setPosition(colLeft, rowTop);

    this.styleText(this.coinsText, 26);
    this.coinsText.setPosition(colRight, rowTop);

    this.styleText(this.distanceText, 22);
    this.distanceText.setPosition(colLeft, rowMiddle);

    this.styleText(this.comboText, 22);
    this.comboText.setPosition(colRight, rowMiddle);

    this.styleText(this.bestText, 22);
    this.bestText.setOrigin(0.5).setPosition(centerX, rowBottom);

    // HEARTS: under the panel
    const bottom = top + height;

    const slot = width / this.heartCount;
    const heartWidth = slot * 0.88;
    const heartHeight = heartWidth * (HEART_H / HEART_W);

    const heartsY = bottom + heartHeight / 2 + 8 * HUD_SCALE;

    this.heartsContainer.setPosition(centerX, heartsY);

    for (let i = 0; i < this.heartCount; i++) {
      const x = (i - (this.heartCount - 1) / 2) * slot;

      this.heartsEmpty[i]
        .setPosition(x, 0)
        .setDisplaySize(heartWidth, heartHeight);

      this.heartsFull[i]
        .setPosition(x, 0)
        .setDisplaySize(heartWidth, heartHeight);
    }

    this.placeCoinIcon();
  }

  // Shows or hides the whole scoring + health HUD
  // (hidden on the title screen)
  setVisible(visible) {
    const elements = [
      this.scorePanel,
      this.scoreText,
      this.coinsText,
      this.distanceText,
      this.comboText,
      this.bestText,
      this.heartsContainer,
      this.coinIcon
    ];

    for (const element of elements) {
      if (element) element.setVisible(visible);
    }

    // Power-up rows come back by themselves in updatePowerUps()
    if (!visible) {
      for (const row of this.powerUpRows) {
        row.label.setVisible(false);
        row.barBg.setVisible(false);
        row.barFill.setVisible(false);

        if (row.icon) row.icon.setVisible(false);
      }
    }
  }

  // Scales an icon to a given on-screen height
  fitIcon(image, height) {
    image.setScale(height / image.height);
  }

  // The coin icon sits just left of the COINS text
  placeCoinIcon() {
    if (!this.coinIcon) return;

    this.coinIcon.setPosition(
      this.coinsText.x - this.coinsText.width / 2 - 28,
      this.coinsText.y
    );
  }

  // Red radial gradient drawn once into a canvas texture
  createVignette() {
    const key = "lowHealthVignette";
    const width = 1920;
    const height = 1080;

    if (!this.scene.textures.exists(key)) {
      const texture = this.scene.textures.createCanvas(
        key,
        width,
        height
      );

      const context = texture.getContext();

      const gradient = context.createRadialGradient(
        width / 2,
        height / 2,
        380,
        width / 2,
        height / 2,
        1100
      );

      gradient.addColorStop(0, "rgba(255, 0, 0, 0)");
      gradient.addColorStop(1, "rgba(255, 0, 0, 0.75)");

      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      texture.refresh();
    }

    this.vignette = this.scene.add.image(
      width / 2,
      height / 2,
      key
    );

    this.vignette.setDepth(90);
    this.vignette.setAlpha(0);
  }

  // =================================
  // HEALTH
  // =================================

  updateHealth(health, maxHealth) {
    const percentage = Math.max(
      0,
      Math.min(1, health / maxHealth)
    );

    // Same colour progression as the old bar
    let color = 0xff3333;

    if (percentage > 0.60) {
      color = 0x35d07f;
    } else if (percentage > 0.30) {
      color = 0xffa500;
    }

    const perHeart = maxHealth / this.heartCount;

    for (let i = 0; i < this.heartCount; i++) {
      const fill = Math.max(
        0,
        Math.min(1, (health - i * perHeart) / perHeart)
      );

      const full = this.heartsFull[i];

      full.setTint(color);
      full.setAlpha(fill > 0 ? 1 : 0);

      // A partly lost heart is cropped from the right
      if (fill > 0 && fill < 1) {
        full.setCrop(0, 0, full.width * fill, full.height);
      } else {
        full.setCrop();
      }
    }

    // Low-health warning (pulsing bar + red vignette)
    this.setLowHealth(percentage > 0 && percentage <= 0.30);

    // Dead: leave a static red vignette
    if (health <= 0) {
      this.vignette.setAlpha(0.85);
    }
  }

  setLowHealth(low) {
    if (low === this.lowHealth) return;

    this.lowHealth = low;

    if (low) {
      this.vignette.setAlpha(0.3);

      this.vignetteTween = this.scene.tweens.add({
        targets: this.vignette,
        alpha: { from: 0.3, to: 0.9 },
        duration: 450,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });

      this.barTween = this.scene.tweens.add({
        targets: this.heartsContainer,
        scale: { from: 1, to: 1.1 },
        duration: 450,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    } else {
      if (this.vignetteTween) {
        this.vignetteTween.stop();
        this.vignetteTween = null;
      }

      if (this.barTween) {
        this.barTween.stop();
        this.barTween = null;
      }

      this.vignette.setAlpha(0);
      this.heartsContainer.setScale(1);
    }
  }

  // =================================
  // SCORE / DISTANCE / COMBO / BEST
  // =================================

  updateScore(score, coins) {
    this.scoreText.setText(`SCORE: ${score}`);
    this.coinsText.setText(`COINS: ${coins}`);

    this.placeCoinIcon();
  }

  updateDistance(meters) {
    if (meters === this.lastDistance) return;

    this.lastDistance = meters;

    this.distanceText.setText(`DISTANCE: ${meters} m`);
  }

  updateBest(best) {
    this.bestText.setText(`BEST: ${best}`);
  }

  updateCombo(multiplier, streak) {
    const label = `COMBO x${formatMultiplier(multiplier)}`;

    const baseColor = multiplier > 1 ? "#7dffb0" : "#dddddd";

    if (
      label === this.comboText.text &&
      multiplier === this.lastMultiplier
    ) {
      return;
    }

    this.comboText.setText(label);
    this.comboBaseColor = baseColor;

    if (multiplier > this.lastMultiplier) {
      // Combo went up: green pop
      this.comboText.setColor(baseColor);

      this.scene.tweens.add({
        targets: this.comboText,
        scale: { from: 1.5, to: 1 },
        duration: 250,
        ease: "Back.easeOut"
      });
    } else if (multiplier < this.lastMultiplier) {
      // Combo lost: red flash
      this.comboText.setColor("#ff5555");

      this.scene.tweens.add({
        targets: this.comboText,
        scale: { from: 1.3, to: 1 },
        duration: 400,
        onComplete: () => {
          this.comboText.setColor(this.comboBaseColor);
        }
      });
    } else {
      this.comboText.setColor(baseColor);
    }

    this.lastMultiplier = multiplier;
  }

  // =================================
  // POWER-UP INDICATORS
  // =================================

  updatePowerUps(list) {
    for (let i = 0; i < this.powerUpRows.length; i++) {
      const row = this.powerUpRows[i];
      const entry = list[i];

      if (!entry) {
        row.label.setVisible(false);
        row.barBg.setVisible(false);
        row.barFill.setVisible(false);

        if (row.icon) row.icon.setVisible(false);

        continue;
      }

      row.label.setVisible(true);
      row.barBg.setVisible(true);
      row.barFill.setVisible(true);

      // Optional icon (hud-<power-up key>), the label and bar
      // move right to make room for it
      const iconKey = `hud-${entry.key}`;
      const hasIcon = this.scene.textures.exists(iconKey);

      if (hasIcon) {
        if (!row.icon) {
          row.icon = this.scene.add
            .image(POWERUP_X, 52 + i * 52, iconKey)
            .setOrigin(0, 0.5)
            .setDepth(100);
        } else if (row.icon.texture.key !== iconKey) {
          row.icon.setTexture(iconKey);
        }

        this.fitIcon(row.icon, 40);
        row.icon.setVisible(true);
      } else if (row.icon) {
        row.icon.setVisible(false);
      }

      const rowX = hasIcon ? POWERUP_X + 52 : POWERUP_X;

      row.label.x = rowX;
      row.barBg.x = rowX;
      row.barFill.x = rowX;

      if (row.label.text !== entry.label) {
        row.label.setText(entry.label);
      }

      row.barFill.setFillStyle(entry.color);

      row.barFill.width =
        POWERUP_BAR_WIDTH *
        Math.max(0, Math.min(1, entry.remaining / entry.duration));
    }
  }

  // =================================
  // MILESTONE BANNER
  // =================================

  showBanner(title, subtitle) {
    const tweens = this.scene.tweens;

    tweens.killTweensOf([this.bannerTitle, this.bannerSub]);

    this.bannerTitle.setText(title).setAlpha(1);
    this.bannerSub.setText(subtitle).setAlpha(1);

    tweens.add({
      targets: this.bannerTitle,
      scale: { from: 1.6, to: 1 },
      duration: 350,
      ease: "Back.easeOut"
    });

    tweens.add({
      targets: [this.bannerTitle, this.bannerSub],
      alpha: 0,
      delay: 1800,
      duration: 500
    });
  }

  // =================================
  // FLOATING TEXT ("+10", "BLOCKED!", ...)
  // =================================

  spawnFloatingText(
    x,
    y,
    message,
    color = "#ffd447",
    size = 32
  ) {
    const text = this.scene.add.text(
      x,
      y,
      message,
      {
        fontFamily: "Arial",
        fontSize: `${size}px`,
        color,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 5
      }
    ).setOrigin(0.5);

    text.setDepth(60);

    this.scene.tweens.add({
      targets: text,
      y: y - 90,
      alpha: 0,
      duration: 800,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy()
    });
  }
}