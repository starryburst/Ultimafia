const Item = require("../Item");

module.exports = class HouseKey extends Item {
  constructor(meetingName) {
    super("HouseKey");

    this.meetingName = meetingName;
    this.cannotBeStolen = true;
    this.meetings[meetingName] = {
      meetingName: "Roommate",
      actionName: "End Meeting?",
      states: ["Night"],
      flags: ["group", "speech", "voting", "noVeg"],
    };
  }
};
