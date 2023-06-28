const Card = require("../../Card");
const { PRIORITY_DAY_DEFAULT } = require("../../const/Priority");

module.exports = class LoseVoteExecution extends Card {
  constructor(role) {
    super(role);

    this.immunity["lynch"] = 3;
    this.actions = [
      {
        priority: PRIORITY_DAY_DEFAULT + 1,
        labels: ["hidden", "absolute"],
        run: function () {
          if (this.game.getStateName() != "Day") return;

          let villageMeeting = this.game.getMeetingByName("Village");

          if (villageMeeting.finalTarget !== this.actor) {
            return;
          }

          this.actor.role.meetings["Village"].canVote = false;
        },
      },
    ];
  }
};
