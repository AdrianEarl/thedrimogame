import { GAME_SETTINGS } from "../config/gameConfig";

export default class HealthSystem {
  constructor(scene, hud, onDeath) {
    this.scene = scene;
    this.hud = hud;
    this.onDeath = onDeath;

    this.maxHealth = GAME_SETTINGS.maxHealth;
    this.health = this.maxHealth;

    this.damagePerHit = GAME_SETTINGS.damagePerHit;

    this.invincible = false;
    this.invincibilityDuration = GAME_SETTINGS.invincibilityDuration;

    this.blinkTimer = null;
    this.blinkTween = null;

    // Initialize health bar with both values
    this.updateHUD();
  }

  // =================================
  // UPDATE HEALTH DISPLAY
  // (the HUD also handles the low-health warning)
  // =================================

  updateHUD() {
    this.hud.updateHealth(
      this.health,
      this.maxHealth
    );
  }

  // =================================
  // TAKE DAMAGE
  // =================================

  takeDamage() {
    if (this.invincible || this.health <= 0) {
      return false;
    }

    this.health = Math.max(
      0,
      this.health - this.damagePerHit
    );

    this.updateHUD();

    // A hit resets the combo
    if (this.scene.scoreSystem) {
      this.scene.scoreSystem.registerHit();
    }

    // Damage feedback
    const camera = this.scene.cameras.main;

    camera.shake(220, 0.012);
    camera.flash(180, 255, 40, 40);

    // Check Game Over
    if (this.health <= 0) {
      this.onDeath();
      return true;
    }

    // Start invincibility
    this.startInvincibility();

    return true;
  }

  // =================================
  // HEAL
  // Returns how much health was actually restored
  // =================================

  heal(amount) {
    if (this.health <= 0) {
      return 0;
    }

    const before = this.health;

    this.health = Math.min(
      this.maxHealth,
      this.health + amount
    );

    this.updateHUD();

    return this.health - before;
  }

  // =================================
  // INVINCIBILITY
  // =================================

  startInvincibility() {
    this.invincible = true;

    // Always schedule the end of invincibility, even if the
    // sprite is unavailable, so the player can never get stuck
    // permanently invincible.
    this.blinkTimer = this.scene.time.delayedCall(
      this.invincibilityDuration,
      () => {
        this.endInvincibility();
      }
    );

    const player = this.scene.drimo.getSprite();

    if (player && player.active) {
      this.blinkTween = this.scene.tweens.add({
        targets: player,
        alpha: 0.45,
        duration: 180,
        yoyo: true,
        repeat: -1
      });
    }
  }

  endInvincibility() {
    this.invincible = false;

    if (this.blinkTween) {
      this.blinkTween.stop();
      this.blinkTween = null;
    }

    const player = this.scene.drimo.getSprite();

    if (player && player.active) {
      player.setAlpha(1);
    }

    this.blinkTimer = null;
  }

  // =================================
  // GETTERS
  // =================================

  getHealth() {
    return this.health;
  }

  isInvincible() {
    return this.invincible;
  }

  // =================================
  // CLEANUP
  // =================================

  destroy() {
    if (this.blinkTimer) {
      this.blinkTimer.remove();
      this.blinkTimer = null;
    }

    if (this.blinkTween) {
      this.blinkTween.stop();
      this.blinkTween = null;
    }

    this.invincible = false;

    const player = this.scene.drimo?.getSprite();

    if (player && player.active) {
      player.setAlpha(1);
    }
  }
}