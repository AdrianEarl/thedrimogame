
import Phaser from "phaser";

import GameScene from "./scenes/GameScene";
import { GAME_CONFIG } from "./config/gameConfig";

const config = {
  ...GAME_CONFIG,
  scene: [GameScene]
};

new Phaser.Game(config);
