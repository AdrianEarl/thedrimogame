// All sounds and the background music, except the coin pickup
// (the coin sound is still loaded in GameScene as "coin-sfx").
//
// Every file is optional: if a file is missing or fails to load,
// that sound is simply skipped. To add a sound, drop the file in
// public/assets/soundassets, add a line below, and call
// this.sfx.play("<name>") where it should happen.

const AUDIO_PATH = "/assets/soundassets";

// name -> file + volume. GameScene plays them with sfx.play(name).
export const SOUND_FILES = {
  jump: { file: "Drimo-Jump-Sound.mp3", volume: 0.5 },
  death: { file: "Drimo-Death.mp3", volume: 0.8 }
};

// Looping background music. null = none yet.
// Example: { file: "Music.mp3", volume: 0.35 }
export const MUSIC_FILE = null;

const sfxKey = (name) => `sfx-${name}`;
const MUSIC_KEY = "music";

export default class SoundSystem {
  // Called from GameScene.preload()
  static preload(scene) {
    for (const [name, def] of Object.entries(SOUND_FILES)) {
      scene.load.audio(sfxKey(name), `${AUDIO_PATH}/${def.file}`);
    }

    if (MUSIC_FILE) {
      scene.load.audio(MUSIC_KEY, `${AUDIO_PATH}/${MUSIC_FILE.file}`);
    }
  }

  constructor(scene) {
    this.scene = scene;

    this.music = null;

    // The scene restarts on R: stop the music with it
    scene.events.once("shutdown", () => this.destroy());
  }

  // Plays a one-shot sound (skipped quietly if it did not load)
  play(name, config = {}) {
    const def = SOUND_FILES[name];
    const key = sfxKey(name);

    if (!def || !this.scene.cache.audio.exists(key)) return;

    this.scene.sound.play(key, {
      volume: def.volume,
      ...config
    });
  }

  playMusic() {
    if (!MUSIC_FILE || !this.scene.cache.audio.exists(MUSIC_KEY)) return;

    if (!this.music) {
      this.music = this.scene.sound.add(MUSIC_KEY, {
        loop: true,
        volume: MUSIC_FILE.volume
      });
    }

    if (!this.music.isPlaying) {
      this.music.play();
    }
  }

  stopMusic() {
    if (this.music) {
      this.music.stop();
    }
  }

  destroy() {
    if (this.music) {
      this.music.stop();
      this.music.destroy();
      this.music = null;
    }
  }
}