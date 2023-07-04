const Role = require("../../Role");

module.exports = class Undertaker extends Role {
  constructor(player, data) {
    super("Undertaker", player, data);
    this.alignment = "Village";
    this.cards = ["VillageCore", "WinWithVillage", "LearnLynchRole"];
  }
};
