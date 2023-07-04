const Card = require("../../Card");

module.exports = class LearnLynchRole extends Card {
  constructor(role) {
    super(role);

    this.listeners = {
      death: function (player, killer, deathType) {
        if (
          deathType === "lynch" &&
          this.player.alive
        ) {
          this.player.queueAlert(`You learn that ${player.name} was a ${player.role.name}.`);
        }
      },
    }
  }
};
