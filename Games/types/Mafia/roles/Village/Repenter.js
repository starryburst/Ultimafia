const Role = require("../../Role");

module.exports = class Repenter extends Role {
  constructor(player, data) {
    super("Repenter", player, data);
    this.alignment = "Village";
    this.cards = ["VillageCore", "WinWithVillage", "LoseVoteExecution"];
  }
};
