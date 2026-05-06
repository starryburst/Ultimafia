const CorePlayer = require("../../core/Player");

module.exports = class Player extends CorePlayer {
  constructor(user, game, isBot) {
    super(user, game, isBot);
    this.score = 0;
  }

  addScore(score) { this.score += score; }
  setScore(score) { this.score = score; }
  getScore() { return this.score; }

  setRole(roleName) {
    super.setRole(roleName, undefined, false, true);
  }

  socketListeners() {
    super.socketListeners();
    this.socket.on("telephoneSubmit", (content) => {
      try {
        if (typeof this.game.handleTelephoneSubmit === "function") {
          this.game.handleTelephoneSubmit(this, content);
        }
      } catch (e) {}
    });
    this.socket.on("telephoneDrawDone", () => {
      try {
        if (typeof this.game.handleDrawDone === "function") {
          this.game.handleDrawDone(this);
        }
      } catch (e) {}
    });
    this.socket.on("telephoneCaption", (content) => {
      try {
        if (typeof this.game.handleCaptionSubmit === "function") {
          this.game.handleCaptionSubmit(this, content);
        }
      } catch (e) {}
    });
    this.socket.on("telephoneVote", (data) => {
      try {
        if (typeof this.game.handlePosterVote === "function") {
          this.game.handlePosterVote(this, data);
        }
      } catch (e) {}
    });
  }

  // On reconnect, re-send the player's current prompt
  sendStateInfo() {
    super.sendStateInfo();
    if (typeof this.game._sendPromptToPlayer === "function") {
      this.game._sendPromptToPlayer(this);
    }
  }
};
