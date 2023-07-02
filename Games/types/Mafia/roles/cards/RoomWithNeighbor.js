const Card = require("../../Card");
const Random = require("../../../../../lib/Random");

module.exports = class RoomWithNeighbor extends Card {
  constructor(role) {
    super(role);

    this.listeners = {
      roleAssigned: function (player) {
        if (player !== this.player) {
          return;
        }

        this.data.meetingName = "Room with " + this.player.name;
        this.meetings[this.data.meetingName] =
          this.meetings["RoommatePlaceholder"];
        delete this.meetings["RoommatePlaceholder"];

        let alive = this.game.alivePlayers();
        let index = alive.indexOf(this.player);

        var neighbors = [null, null];
        neighbors[0] = alive[index-1]
        if (index == (alive.length - 1)){
          neighbors[1] = alive[0];
        } else {
          neighbors[1] = alive[index+1];
        }

        let roommate = Random.randArrayVal(neighbors);
        roommate.holdItem("HouseKey", this.data.meetingName);

        roommate.queueAlert(`You and ${this.player.name} are now rooming together!`);
        this.player.queueAlert(`You and ${roommate.name} are now rooming together!`);
      },
    },

    this.meetings = {
      "RoommatePlaceholder": {
        meetingName: "Roommate",
        actionName: "End Meeting?",
        states: ["Night"],
        flags: ["exclusive", "group", "speech", "voting", "noVeg"],
      },
    };
  }
};
