const Card = require("../../Card");
const { PRIORITY_INVESTIGATIVE_DEFAULT } = require("../../const/Priority");

module.exports = class DripOnVisit extends Card {
  constructor(role) {
    super(role);

    this.actions = [
      {
        priority: PRIORITY_INVESTIGATIVE_DEFAULT,
        labels: ["absolute", "hidden"],
        run: function () {
          if (this.game.getStateName() != "Night") return;

          let visits = this.getVisits(this.actor);
          visits.map((v) => v.queueAlert("You learn that someone Soaked visited you last night."));
        },
      },
    ];
  }
};
