const Game = require("../../core/Game");
const Player = require("./Player");
const Action = require("./Action");
const Queue = require("../../core/Queue");
const Winners = require("../../core/Winners");

module.exports = class AcrotopiaGame extends Game {
  constructor(options) {
    super(options);

    this.type = "Acrotopia";
    this.Player = Player;
    this.states = [
      {
        name: "Postgame",
      },
      {
        name: "Pregame",
      },
      {
        name: "Night",
        length: options.settings.stateLengths["Night"],
      },
      {
        name: "Day",
        length: options.settings.stateLengths["Day"],
      },
    ];

    // game settings
    this.roundAmt = options.settings.roundAmt;
    this.acronymSize = options.settings.acronymSize;

    this.currentRound = 0;
    this.currentAcronym = "";

    // map from acronym to player
    this.currentExpandedAcronyms = {};

    this.acronymHistory = [];
    this.currentAcronymHistory = {};
  }

  start() {
    super.start();
    this.generateNewAcronym();
  }

  incrementState() {
    super.incrementState();

    if (this.getStateName() == "Night") {
      this.currentRound += 1;
      this.generateNewAcronym();
      return;
    }
  }

  generateNewAcronym() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let acronym = "";
    for (var i = 0; i < this.acronymSize; i++) {
      acronym += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    this.acronym = acronym;
    this.queueAlert(`The acronym is ${acronym}.`);
  }

  recordExpandedAcronym(player, expandedAcronym) {
    this.currentExpandedAcronyms[expandedAcronym] = player;
  }

  saveAcronymHistory(winningAcronym) {
    this.acronymHistory.push({
      winner: winningAcronym,
      acronyms: this.currentExpandedAcronyms,
    });

    this.currentExpandedAcronyms = {};
  }

  getStateInfo(state) {
    var info = super.getStateInfo(state);
    info.extraInfo = {
      acronymHistory: this.acronymHistory,
    };
    return info;
  }

  // process player leaving immediately
  async playerLeave(player) {
    if (this.started) {
      let action = new Action({
        actor: player,
        target: player,
        game: this,
        run: function () {
          this.target("leave", this.actor, true);
        },
      });

      this.instantAction(action);
    }

    await super.playerLeave(player);
  }

  checkWinConditions() {
    var finished = this.round > this.roundAmt;
    var winners = finished && this.getWinners();

    return [finished, winners];
  }

  getWinners() {
    var winQueue = new Queue();
    var winners = new Winners(this);

    for (let player of this.players) winQueue.enqueue(player.role.winCheck);

    for (let winCheck of winQueue) {
      let stop = winCheck.check(winners);
      if (stop) break;
    }

    winners.determinePlayers();
    return winners;
  }
};
