require("dotenv").config();
const { expect } = require("chai");
const TelephoneGame = require("../../../Games/types/Telephone/Game");

function makeBareGame(overrides = {}) {
  return new TelephoneGame({
    id: "test",
    hostId: "host",
    isTest: true,
    settings: {
      stateLengths: { Draw: 90_000 },
      pregameCountdownLength: 0,
      setup: { total: 3, roles: [{ "Caller:1": 3 }] },
    },
    ...overrides,
  });
}

function makePlayerStub(id, name) {
  let score = 0;
  return {
    id,
    name,
    send: () => {},
    setScore: (s) => { score = s; },
    getScore: () => score,
  };
}

describe("Telephone Game basics", () => {
  it("has the correct type and state list", () => {
    const game = makeBareGame();
    expect(game.type).to.equal("Telephone");
    const names = game.states.map((s) => s.name);
    expect(names).to.include.members(["Write", "Draw", "Guess", "Caption", "Vote"]);
  });

  it("initializes chains and round counters", () => {
    const game = makeBareGame();
    expect(game.currentRound).to.equal(0);
    expect(game.chains).to.deep.equal([]);
    expect(game.turnOrder).to.deep.equal([]);
    expect(game.playerSubmissions).to.deep.equal({});
  });

  it("getGameTypeOptions returns empty object", () => {
    const game = makeBareGame();
    expect(game.getGameTypeOptions()).to.deep.equal({});
  });

  it("checkWinConditions returns false when rounds incomplete", () => {
    const game = makeBareGame();
    const players = [makePlayerStub("a", "A"), makePlayerStub("b", "B"), makePlayerStub("c", "C")];
    game.players = players;
    game.turnOrder = [...players];
    game.currentRound = 0;
    const [done] = game.checkWinConditions();
    expect(done).to.equal(false);
  });

  it("checkWinConditions returns true when all rounds complete", () => {
    const game = makeBareGame();
    const players = [makePlayerStub("a", "A"), makePlayerStub("b", "B")];
    game.players = players;
    game.turnOrder = [...players];
    game.currentRound = 2; // equals turnOrder.length
    const [done, winners] = game.checkWinConditions();
    expect(done).to.equal(true);
    expect(winners).to.exist;
  });
});

describe("Telephone chain rotation", () => {
  function makeGameWithPlayers(n) {
    const game = makeBareGame();
    const players = [];
    for (let i = 0; i < n; i++) {
      players.push(makePlayerStub(`p${i}`, `Player${i}`));
    }
    game.players = Object.fromEntries(players.map((p) => [p.id, p]));
    game.turnOrder = [...players];
    game.chains = players.map((p, i) => ({ id: i, startPlayer: p.name, history: [] }));
    game.currentRound = 0;
    game.playerStrokes = {};
    return { game, players };
  }

  it("_chainForPlayer returns the correct chain at round 0", () => {
    const { game, players } = makeGameWithPlayers(3);
    const chain = game._chainForPlayer(players[0]);
    expect(chain).to.not.be.null;
    expect(chain.startPlayer).to.equal("Player0");
  });

  it("_chainForPlayer rotates at round 1", () => {
    const { game, players } = makeGameWithPlayers(3);
    game.currentRound = 1;
    // At round 1, player[0] gets chain[(0-1+3)%3] = chain[2]
    const chain = game._chainForPlayer(players[0]);
    expect(chain.startPlayer).to.equal("Player2");
  });

  it("_collectAndRotate records text submissions", () => {
    const { game, players } = makeGameWithPlayers(3);
    game.playerSubmissions = {
      p0: "a dog",
      p1: "a cat",
      p2: "a bird",
    };
    game._collectAndRotate("Write");
    expect(game.chains[0].history).to.have.length(1);
    expect(game.chains[0].history[0].phase).to.equal("write");
    expect(game.chains[0].history[0].content).to.equal("a dog");
    expect(game.currentRound).to.equal(1);
    expect(game.playerSubmissions).to.deep.equal({});
  });

  it("_collectAndRotate records draw strokes", () => {
    const { game, players } = makeGameWithPlayers(2);
    game.playerStrokes = {
      p0: [{ id: "s1", points: [[0, 0]] }],
      p1: [{ id: "s2", points: [[1, 1]] }],
    };
    game._collectAndRotate("Draw");
    expect(game.chains[0].history[0].phase).to.equal("draw");
    expect(game.chains[0].history[0].strokes).to.have.length(1);
    expect(game.playerStrokes).to.deep.equal({});
  });
});

describe("Telephone text submit handling", () => {
  function makeGameInState(stateName, players) {
    const game = makeBareGame();
    game.players = Object.fromEntries(players.map((p) => [p.id, p]));
    game.turnOrder = [...players];
    game.playerSubmissions = {};
    game.getStateName = () => stateName;
    game.gotoNextState = () => {};
    game.broadcast = () => {};
    return game;
  }

  it("handleTelephoneSubmit rejects non-string content", () => {
    const players = [makePlayerStub("a", "A"), makePlayerStub("b", "B")];
    const game = makeGameInState("Write", players);
    game.handleTelephoneSubmit(players[0], 42);
    expect(game.playerSubmissions).to.deep.equal({});
  });

  it("handleTelephoneSubmit rejects submission outside Write/Guess state", () => {
    const players = [makePlayerStub("a", "A"), makePlayerStub("b", "B")];
    const game = makeGameInState("Draw", players);
    game.handleTelephoneSubmit(players[0], "hello");
    expect(game.playerSubmissions).to.deep.equal({});
  });

  it("handleTelephoneSubmit records submission and trims to 200 chars", () => {
    const players = [makePlayerStub("a", "A"), makePlayerStub("b", "B")];
    const game = makeGameInState("Write", players);
    const longText = "x".repeat(300);
    game.handleTelephoneSubmit(players[0], longText);
    expect(game.playerSubmissions["a"]).to.have.length(200);
  });

  it("handleTelephoneSubmit advances state when all submit", () => {
    let advanced = false;
    const players = [makePlayerStub("a", "A"), makePlayerStub("b", "B")];
    const game = makeGameInState("Write", players);
    game.gotoNextState = () => { advanced = true; };
    game.handleTelephoneSubmit(players[0], "phrase one");
    expect(advanced).to.equal(false);
    game.handleTelephoneSubmit(players[1], "phrase two");
    expect(advanced).to.equal(true);
  });
});

describe("Telephone draw done handling", () => {
  function makeGameInDraw(players) {
    const game = makeBareGame();
    game.players = Object.fromEntries(players.map((p) => [p.id, p]));
    game.turnOrder = [...players];
    game.playerSubmissions = {};
    game.getStateName = () => "Draw";
    game.gotoNextState = () => {};
    game.broadcast = () => {};
    game.designerMode = false;
    return game;
  }

  it("handleDrawDone marks player done", () => {
    const players = [makePlayerStub("a", "A"), makePlayerStub("b", "B")];
    const game = makeGameInDraw(players);
    game.handleDrawDone(players[0]);
    expect(game.playerSubmissions["a"]).to.equal(true);
  });

  it("handleDrawDone advances state when all are done", () => {
    let advanced = false;
    const players = [makePlayerStub("a", "A"), makePlayerStub("b", "B")];
    const game = makeGameInDraw(players);
    game.gotoNextState = () => { advanced = true; };
    game.handleDrawDone(players[0]);
    expect(advanced).to.equal(false);
    game.handleDrawDone(players[1]);
    expect(advanced).to.equal(true);
  });
});

describe("Telephone stroke sanitization", () => {
  it("_sanitizeColor returns black for invalid hex", () => {
    const game = makeBareGame();
    expect(game._sanitizeColor("notacolor")).to.equal("#000000");
    expect(game._sanitizeColor("#gggggg")).to.equal("#000000");
    expect(game._sanitizeColor("#ff0000")).to.equal("#ff0000");
  });

  it("_sanitizeSize returns 25 for invalid size", () => {
    const game = makeBareGame();
    expect(game._sanitizeSize(99)).to.equal(25);
    expect(game._sanitizeSize(10)).to.equal(10);
    expect(game._sanitizeSize(40)).to.equal(40);
  });
});
