// Title screen, pause menu and the 3-2-1 countdown.

const TITLE_CARD_KEEPS_SUBTITLE = false;

// Title card size. 1 = fit inside a 1000 x 420 box, 2 = twice that.
// The card is never wider than the screen (see MAX_WIDTH below).
const TITLE_CARD_SIZE = 2;
const TITLE_CARD_MAX_WIDTH = 1880;

export default class MenuScreens {
  constructor(scene) {
    this.scene = scene;

    // Phones get "TAP" wording instead of key names
    this.touch = !!(scene.touch && scene.touch.enabled);

    this.titleTween = null;

    this.createTitle();
    this.createPause();
    this.createCountdown();
  }

  // =================================
  // TITLE SCREEN
  // =================================

  createTitle() {
    const scene = this.scene;

    this.titleContainer = scene.add.container(0, 0);
    this.titleContainer.setDepth(300);
    this.titleContainer.setVisible(false);

    const dim = scene.add.rectangle(
      960,
      540,
      1920,
      1080,
      0x000000,
      0.55
    );

    const title = scene.add.text(
      960,
      270,
      "DRIMO",
      {
        fontFamily: "Arial",
        fontSize: "170px",
        color: "#ffd447",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 14
      }
    ).setOrigin(0.5);

    const subtitle = scene.add.text(
      960,
      410,
      "ENDLESS RUNNER",
      {
        fontFamily: "Arial",
        fontSize: "40px",
        color: "#ffffff",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    this.titlePrompt = scene.add.text(
      960,
      560,
      this.touch ? "TAP TO START" : "PRESS SPACE TO START",
      {
        fontFamily: "Arial",
        fontSize: "54px",
        color: "#7dffb0",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 8
      }
    ).setOrigin(0.5);

    const controls = scene.add.text(
      960,
      760,
      (this.touch
        ? [
            "UP / DOWN buttons   -   MOVE",
            "TAP the right side   -   JUMP over obstacles",
            "Top button   -   PAUSE"
          ]
        : [
            "W / S  or  ↑ / ↓   -   MOVE",
            "SPACE  (or  J  /  SHIFT)   -   JUMP over obstacles",
            "P  or  ESC   -   PAUSE"
          ]
      ).join("\n"),
      {
        fontFamily: "Arial",
        fontSize: "28px",
        color: "#dddddd",
        align: "center",
        lineSpacing: 12
      }
    ).setOrigin(0.5);

    this.titleContainer.add([
      dim,
      title,
      subtitle,
      this.titlePrompt,
      controls
    ]);

    // Title card image (public/assets/hud/Title-Card.png).
    // It replaces the DRIMO / ENDLESS RUNNER texts. Set
    // TITLE_CARD_KEEPS_SUBTITLE to true to keep the subtitle.
    if (scene.textures.exists("hud-title")) {
      const card = scene.add.image(960, 220, "hud-title");

      card.setScale(
        Math.min(
          (1000 * TITLE_CARD_SIZE) / card.width,
          (420 * TITLE_CARD_SIZE) / card.height,
          TITLE_CARD_MAX_WIDTH / card.width
        )
      );

      title.setVisible(false);
      subtitle.setVisible(!!TITLE_CARD_KEEPS_SUBTITLE);

      this.titleContainer.add(card);
    }
  }

  showTitle() {
    this.titleContainer.setVisible(true);

    if (this.titleTween) {
      this.titleTween.stop();
    }

    this.titlePrompt.setAlpha(1);

    this.titleTween = this.scene.tweens.add({
      targets: this.titlePrompt,
      alpha: { from: 1, to: 0.25 },
      duration: 600,
      yoyo: true,
      repeat: -1
    });
  }

  hideTitle() {
    this.titleContainer.setVisible(false);

    if (this.titleTween) {
      this.titleTween.stop();
      this.titleTween = null;
    }
  }

  // =================================
  // PAUSE MENU
  // =================================

  createPause() {
    const scene = this.scene;

    this.pauseContainer = scene.add.container(0, 0);
    this.pauseContainer.setDepth(300);
    this.pauseContainer.setVisible(false);

    const dim = scene.add.rectangle(
      960,
      540,
      1920,
      1080,
      0x000000,
      0.65
    );

    const title = scene.add.text(
      960,
      400,
      "PAUSED",
      {
        fontFamily: "Arial",
        fontSize: "110px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 10
      }
    ).setOrigin(0.5);

    const resume = scene.add.text(
      960,
      540,
      this.touch ? "TAP TO RESUME" : "PRESS P OR ESC TO RESUME",
      {
        fontFamily: "Arial",
        fontSize: "38px",
        color: "#7dffb0",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    // On phones this is a button (the tap zone is in TouchControls.js)
    const restart = scene.add.text(
      960,
      this.touch ? 650 : 610,
      this.touch ? "TAP HERE TO RESTART" : "PRESS R TO RESTART",
      {
        fontFamily: "Arial",
        fontSize: this.touch ? "42px" : "30px",
        color: "#ffd447",
        fontStyle: this.touch ? "bold" : "normal"
      }
    ).setOrigin(0.5);

    this.pauseContainer.add([dim, title, resume, restart]);
  }

  showPause() {
    this.pauseContainer.setVisible(true);
  }

  hidePause() {
    this.pauseContainer.setVisible(false);
  }

  // =================================
  // COUNTDOWN (3, 2, 1, GO!)
  // =================================

  createCountdown() {
    this.countdownText = this.scene.add.text(
      960,
      480,
      "",
      {
        fontFamily: "Arial",
        fontSize: "230px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 16
      }
    ).setOrigin(0.5);

    this.countdownText.setDepth(250);
    this.countdownText.setVisible(false);
  }

  showCountdown(label, fadeOut = false) {
    const text = this.countdownText;

    this.scene.tweens.killTweensOf(text);

    text.setText(label);
    text.setColor(label === "GO!" ? "#7dffb0" : "#ffffff");
    text.setVisible(true);
    text.setAlpha(1);
    text.setScale(1);

    this.scene.tweens.add({
      targets: text,
      scale: { from: 1.8, to: 1 },
      duration: 350,
      ease: "Back.easeOut"
    });

    if (fadeOut) {
      this.scene.tweens.add({
        targets: text,
        alpha: 0,
        delay: 350,
        duration: 400,
        onComplete: () => text.setVisible(false)
      });
    }
  }

  hideCountdown() {
    this.scene.tweens.killTweensOf(this.countdownText);
    this.countdownText.setVisible(false);
  }
}