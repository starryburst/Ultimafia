const Role = require("../../Role");

module.exports = class Designer extends Role {
  constructor(player, data) {
    super("Designer", player, data);
    this.alignment = "Town";
    this.cards = ["TownCore"];
  }
};
