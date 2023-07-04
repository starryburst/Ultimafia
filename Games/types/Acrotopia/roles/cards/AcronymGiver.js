const Card = require("../../Card");

module.exports = class AcronymGiver extends Card {
  constructor(role) {
    super(role);

    this.meetings = {
      "Give Acronym": {
        actionName: "Give Acronym (1-200)",
        states: ["Night"],
        flags: ["voting"],
        inputType: "text",
        textOptions: {
          minLength: 1,
          maxLength: 200,
          alphaOnly: true,
          enforceAcronym: "",
          submit: "Confirm",
        },
        action: {
          item: this,
          run: function () {
            // check to see if it is an acronym
            let firstLetters = str.match(/\b\w/g).join("");
            if (firstLetters !== this.game.acronym) {
              this.game.queueAlert(
                `${this.actor.name}'s acronym was invalid and will be ignored.`
              );
              return;
            }

            this.game.recordExpandedAcronym(this.actor, this.target);
          },
        },
      },
    };
  }
};
