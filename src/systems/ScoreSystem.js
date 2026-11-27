import { GAME_SETTINGS } from "../config/gameConfig";

const BEST_KEY = "drimo_best_score";

export default class ScoreSystem {
  constructor(hud) {
    this.hud = hud;

    this.score = 0;
    this.coins = 0;

    this.coinScore = 0;
    this.bonusScore = 0;
    this.distanceScore = 0; // fractional, floored when summed

    this.distance = 0; // meters

    this.comboStreak = 0;
    this.maxMultiplier = 1;
    this.hits = 0;

    this.doubleScore = false;

    this.best = this.loadBest();

    this.lastScore = -1;
    this.lastCoins = -1;

    this.update();
  }

  // =================================
  // BEST SCORE (localStorage)
  // =================================

  loadBest() {
    try {
      const value = window.localStorage.getItem(BEST_KEY);
      return value ? parseInt(value, 10) || 0 : 0;
    } catch (error) {
      return 0;
    }
  }

  saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch (error) {
      // Storage unavailable (private mode, etc.). Ignore.
    }
  }

  // Call once when the run ends
  submitFinalScore() {
    const isNewBest = this.score > this.best;

    if (isNewBest) {
      this.best = this.score;
      this.saveBest(this.best);
    }

    return {
      best: this.best,
      isNewBest
    };
  }

  // =================================
  // MULTIPLIERS
  // =================================

  getComboMultiplier() {
    return Math.min(
      GAME_SETTINGS.comboMax,
      1 + this.comboStreak * GAME_SETTINGS.comboStep
    );
  }

  getScoreMultiplier() {
    return (
      this.getComboMultiplier() *
      (this.doubleScore ? 2 : 1)
    );
  }

  setDoubleScore(active) {
    this.doubleScore = active;
  }

  // =================================
  // EVENTS
  // =================================

  // Returns the points gained (for the floating text)
  collectCoin() {
    const points = Math.round(
      GAME_SETTINGS.coinValue * this.getScoreMultiplier()
    );

    this.coins += 1;
    this.coinScore += points;

    this.update();

    return points;
  }

  // A whole coin group was collected. Returns the new multiplier.
  completeGroup() {
    this.comboStreak += 1;

    const multiplier = this.getComboMultiplier();

    this.maxMultiplier = Math.max(
      this.maxMultiplier,
      multiplier
    );

    this.update();

    return multiplier;
  }

  // Returns true if there was a combo to break
  breakCombo() {
    const hadCombo = this.comboStreak > 0;

    this.comboStreak = 0;

    this.update();

    return hadCombo;
  }

  registerHit() {
    this.hits += 1;
    this.breakCombo();
  }

  addDistance(meters) {
    this.distance += meters;

    this.distanceScore +=
      meters *
      GAME_SETTINGS.distanceScorePerMeter *
      this.getScoreMultiplier();

    this.update();
  }

  addBonus(points) {
    this.bonusScore += points;

    this.update();
  }

  // =================================
  // HUD
  // =================================

  update() {
    this.score =
      this.coinScore +
      this.bonusScore +
      Math.floor(this.distanceScore);

    if (
      this.score !== this.lastScore ||
      this.coins !== this.lastCoins
    ) {
      this.lastScore = this.score;
      this.lastCoins = this.coins;

      this.hud.updateScore(this.score, this.coins);
      this.hud.updateBest(Math.max(this.best, this.score));
    }

    this.hud.updateDistance(Math.floor(this.distance));

    this.hud.updateCombo(
      this.getComboMultiplier(),
      this.comboStreak
    );
  }
}