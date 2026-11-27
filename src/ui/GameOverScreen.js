const formatMultiplier = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatTime = (seconds) => {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");

  return `${minutes}:${secs}`;
};

export default class GameOverScreen {
  constructor(scene) {
    this.scene = scene;

    this.container = scene.add.container(0, 0);
    this.container.setDepth(200);
    this.container.setVisible(false);

    const background = scene.add.rectangle(
      960,
      540,
      1920,
      1080,
      0x000000,
      0.78
    );

    const title = scene.add.text(
      960,
      190,
      "GAME OVER",
      {
        fontFamily: "Arial",
        fontSize: "90px",
        color: "#ff4545",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    this.finalScore = scene.add.text(
      960,
      310,
      "",
      {
        fontFamily: "Arial",
        fontSize: "52px",
        color: "#ffffff",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    this.newBestText = scene.add.text(
      960,
      390,
      "NEW BEST!",
      {
        fontFamily: "Arial",
        fontSize: "48px",
        color: "#ffd447",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 6
      }
    ).setOrigin(0.5);

    this.bestText = scene.add.text(
      960,
      390,
      "",
      {
        fontFamily: "Arial",
        fontSize: "34px",
        color: "#bbbbbb"
      }
    ).setOrigin(0.5);

    this.newBestText.setVisible(false);
    this.bestText.setVisible(false);

    // Stats rows: label on the left, value on the right
    const labels = [
      "DISTANCE",
      "COINS COLLECTED",
      "BEST COMBO",
      "TIME SURVIVED",
      "HITS TAKEN"
    ];

    this.statValues = [];

    const rowObjects = [];

    labels.forEach((label, i) => {
      const y = 490 + i * 52;

      const left = scene.add.text(
        700,
        y,
        label,
        {
          fontFamily: "Arial",
          fontSize: "30px",
          color: "#bbbbbb"
        }
      ).setOrigin(0, 0.5);

      const right = scene.add.text(
        1220,
        y,
        "",
        {
          fontFamily: "Arial",
          fontSize: "30px",
          color: "#ffffff",
          fontStyle: "bold"
        }
      ).setOrigin(1, 0.5);

      this.statValues.push(right);
      rowObjects.push(left, right);
    });

    const restartMessage = scene.add.text(
      960,
      850,
      scene.touch && scene.touch.enabled
        ? "TAP TO RESTART"
        : "PRESS R TO RESTART",
      {
        fontFamily: "Arial",
        fontSize: "34px",
        color: "#ffd447",
        fontStyle: "bold"
      }
    ).setOrigin(0.5);

    this.container.add([
      background,
      title,
      this.finalScore,
      this.newBestText,
      this.bestText,
      ...rowObjects,
      restartMessage
    ]);
  }

  // stats = { score, best, isNewBest, distance, coins,
  //           maxMultiplier, time, hits }
  show(stats) {
    this.finalScore.setText(`FINAL SCORE: ${stats.score}`);

    const values = [
      `${Math.floor(stats.distance)} m`,
      `${stats.coins}`,
      `x${formatMultiplier(stats.maxMultiplier)}`,
      formatTime(stats.time),
      `${stats.hits}`
    ];

    this.statValues.forEach((text, i) => {
      text.setText(values[i]);
    });

    if (stats.isNewBest) {
      this.bestText.setVisible(false);
      this.newBestText.setVisible(true);

      // Pop in, then keep pulsing
      this.scene.tweens.add({
        targets: this.newBestText,
        scale: { from: 0.3, to: 1 },
        duration: 450,
        ease: "Back.easeOut",
        onComplete: () => {
          this.scene.tweens.add({
            targets: this.newBestText,
            scale: 1.12,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
          });
        }
      });
    } else {
      this.newBestText.setVisible(false);

      this.bestText.setText(`BEST: ${stats.best}`);
      this.bestText.setVisible(true);
    }

    this.container.setAlpha(0);
    this.container.setVisible(true);

    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 300
    });
  }
}