const Role = require("../../Role");

module.exports = class Eidetiker extends Role {
  constructor(player, data) {
    super("Eidetiker", player, data);
    this.alignment = "Town";
    this.cards = ["TownCore"];
  }
};
