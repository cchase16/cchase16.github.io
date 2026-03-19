import { GameApp } from "./src/core/game.js";
import { loadStartupState } from "./src/core/startupState.js";
import { SetupPage } from "./src/ui/setupPage.js";

window.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;

  if (page === "welcome") {
    const setupPage = new SetupPage(document);
    await setupPage.init();
    return;
  }

  const app = new GameApp(document, { startupState: loadStartupState() });
  await app.init();
});
