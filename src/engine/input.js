export class InputController {
  constructor(target = window) {
    this.keysDown = new Set();
    this.pressed = new Set();

    target.addEventListener("keydown", (event) => {
      if (!this.keysDown.has(event.code)) {
        this.pressed.add(event.code);
      }
      this.keysDown.add(event.code);
    });

    target.addEventListener("keyup", (event) => {
      this.keysDown.delete(event.code);
    });

    target.addEventListener("blur", () => {
      this.keysDown.clear();
      this.pressed.clear();
    });
  }

  isDown(...codes) {
    return codes.some((code) => this.keysDown.has(code));
  }

  consumePress(...codes) {
    for (const code of codes) {
      if (this.pressed.has(code)) {
        this.pressed.delete(code);
        return true;
      }
    }
    return false;
  }
}
