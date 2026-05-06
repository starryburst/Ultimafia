const Role = require("../../Role");

module.exports = class Caller extends Role {
  constructor(player, data) {
    super("Caller", player, data);
    this.alignment = "Town";
    this.cards = ["TownCore"];
  }
};
