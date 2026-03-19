import { GameApp } from "./src/core/game.js";

const app = new GameApp(document);

window.addEventListener("DOMContentLoaded", async () => {
  await app.init();
});
