const Role = require("../../Role");

module.exports = class Roommate extends Role {
  constructor(player, data) {
    super("Roommate", player, data);
    this.alignment = "Village";
    this.cards = ["VillageCore", "WinWithVillage", "RoomWithNeighbor"];
  }
};
