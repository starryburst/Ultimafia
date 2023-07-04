const Card = require("../../Card");

module.exports = class TownCore extends Card {
  constructor(role) {
    super(role);

    this.meetings = {
      Village: {
        actionName: "Pick Favorite Acronym",
        states: ["Day"],
        flags: ["group", "speech", "voting"],
        inputType: "custom",
        targets: ["loading..."],
        targets: { include: ["alive"] },
        action: {
          run: function () {
            const winner = this.game.currentExpandedAcronyms[this.target];
            winner.score += 1;
            this.game.saveAcronymHistory(this.target);
          },
        },
      },
    };
    this.listeners = {
      state: function (stateInfo) {
        if (!stateInfo.name.match(/Day/)) {
          return;
        }

        let eligibleVotes = this.game.currentAcronymHistory.filter(
          (acronym) => acronym.player != this.player
        );
        this.meetings["Village"].targets = eligibleVotes;
      },
    };
  }
};
