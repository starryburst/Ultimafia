const Game = require("../../core/Game");
const Player = require("./Player");
const Random = require("../../../lib/Random");
const Winners = require("../../core/Winners");

const WRITE_TIME = 45 * 1000;
const GUESS_TIME = 45 * 1000;
const CAPTION_TIME = 45 * 1000;
const REVEAL_TIME = 4 * 1000;

module.exports = class TelephoneGame extends Game {
  constructor(options) {
    super(options);
    this.type = "Telephone";
    this.Player = Player;
    this.disableObituaries = true;

    const drawTime = options.settings.stateLengths["Draw"] || 90 * 1000;

    this.states = [
      { name: "Postgame" },
      { name: "Pregame" },
      { name: "Write", length: WRITE_TIME },
      { name: "Draw", length: drawTime },
      { name: "Guess", length: GUESS_TIME },
      { name: "Caption", length: CAPTION_TIME },
      { name: "Vote", length: 9999 * 1000 },
    ];

    const roleSlot = (this.setup && this.setup.roles && this.setup.roles[0]) || {};
    const roleNames = Object.keys(roleSlot).map((k) => k.split(":")[0]);
    const hasCaller = roleNames.includes("Caller");
    const hasEidetiker = roleNames.includes("Eidetiker");
    const hasDesigner = roleNames.includes("Designer");

    if (hasCaller && hasEidetiker) {
      this.eidetekerMode = Random.randArrayVal([true, false]);
    } else {
      this.eidetekerMode = hasEidetiker;
    }
    this.designerMode = hasDesigner;

    this.turnOrder = [];
    this.chains = [];
    this.currentRound = 0;
    this.playerSubmissions = {};
    this.playerStrokes = {};
    this.currentPrompts = {};

    // Designer mode fields
    if (this.designerMode) {
      this.playerCaptions1 = {};
      this.playerCaptions2 = {};
      this.captionAssignments1 = {};
      this.captionAssignments2 = {};
      this.playerStrokes1 = {};
      this.playerStrokes2 = {};
      // Per-player progress counters (0, 1, or 2 tasks done within a phase)
      this.playerDrawCount = {};
      this.playerCaptionCount = {};
      this.matchups = [];
      this.eligibleVoters = {};
      this.matchupVotes = {};
      this.voteResolved = false;
      this.scores = {};
      this.matchupResults = [];
    }
  }

  async start() {
    this.turnOrder = Random.randomizeArray([...this.players]);

    if (this.designerMode) {
      for (const p of Object.values(this.players)) {
        this.scores[p.id] = { draw: 0, caption: 0 };
        this.playerDrawCount[p.id] = 0;
        this.playerCaptionCount[p.id] = 0;
      }
    } else {
      this.chains = this.turnOrder.map((p, i) => ({
        id: i,
        startPlayer: p.name,
        history: [],
      }));
    }

    await super.start();
  }

  getNextStateIndex() {
    const lastIdx = this.stateIndexRecord[this.stateIndexRecord.length - 1];
    const currentName = lastIdx !== undefined ? this.states[lastIdx].name : null;
    const stateNames = this.states.map((s) => s.name);

    if (this.designerMode) {
      // Each phase runs once; players do their 2 tasks back-to-back within the phase
      if (currentName === null || currentName === "Pregame") return [stateNames.indexOf("Draw"), 0];
      if (currentName === "Draw") return [stateNames.indexOf("Caption"), 0];
      if (currentName === "Caption") return [stateNames.indexOf("Vote"), 0];
      return super.getNextStateIndex();
    }

    if (this.eidetekerMode) {
      if (currentName === null || currentName === "Pregame" || currentName === "Draw") return [stateNames.indexOf("Draw"), 0];
    } else {
      if (currentName === "Write" || currentName === "Guess") return [stateNames.indexOf("Draw"), 0];
      if (currentName === "Draw") return [stateNames.indexOf("Guess"), 0];
    }
    return super.getNextStateIndex();
  }

  gotoNextState() {
    const name = this.getStateName();
    if (this.designerMode) {
      if (name === "Draw" || name === "Caption") {
        this.playerSubmissions = {};
      }
    } else if (name === "Write" || name === "Draw" || name === "Guess") {
      this._collectAndRotate(name);
    }
    super.gotoNextState();
  }

  incrementState() {
    super.incrementState();
    const newName = this.getStateName();

    if (this.designerMode) {
      if (newName === "Draw") {
        this.playerSubmissions = {};
        this._beginDesignerDraw();
      } else if (newName === "Caption") {
        this._beginCaption();
      } else if (newName === "Vote") {
        this._beginVote();
      }
    } else {
      if (newName === "Write") this._beginWrite();
      else if (newName === "Draw") this._beginDraw();
      else if (newName === "Guess") this._beginGuess();
    }
  }

  // ---- Regular Telephone methods ----

  _chainForPlayer(player) {
    const i = this.turnOrder.indexOf(player);
    if (i === -1) return null;
    const n = this.turnOrder.length;
    return this.chains[(i - this.currentRound + n * 10) % n];
  }

  _collectAndRotate(phase) {
    for (const player of this.turnOrder) {
      const chain = this._chainForPlayer(player);
      if (!chain) continue;

      if (phase === "Draw") {
        chain.history.push({
          player: player.name,
          phase: "draw",
          strokes: this.playerStrokes[player.id]
            ? [...this.playerStrokes[player.id]]
            : [],
        });
      } else {
        const text = this.playerSubmissions[player.id] || "";
        chain.history.push({
          player: player.name,
          phase: phase.toLowerCase(),
          content: text,
        });
      }
    }

    this.playerSubmissions = {};
    this.playerStrokes = {};
    this.currentRound++;
  }

  _beginWrite() {
    this.currentPrompts = {};
    for (const player of this.turnOrder) {
      this.currentPrompts[player.id] = { phase: "write" };
    }
    this._sendAllPrompts();
  }

  _beginDraw() {
    this.currentPrompts = {};
    for (const player of this.turnOrder) {
      const chain = this._chainForPlayer(player);
      if (!chain) continue;
      const last = chain.history[chain.history.length - 1];
      if (this.eidetekerMode) {
        this.currentPrompts[player.id] = {
          phase: "draw",
          strokes: last ? last.strokes || [] : [],
        };
      } else {
        this.currentPrompts[player.id] = {
          phase: "draw",
          content: last ? last.content || "" : "",
        };
      }
    }
    this._sendAllPrompts();
    this.playerStrokes = {};
  }

  _beginGuess() {
    this.currentPrompts = {};
    for (const player of this.turnOrder) {
      const chain = this._chainForPlayer(player);
      if (!chain) continue;
      const last = chain.history[chain.history.length - 1];
      this.currentPrompts[player.id] = {
        phase: "guess",
        strokes: last ? last.strokes || [] : [],
      };
    }
    this._sendAllPrompts();
  }

  _sendAllPrompts() {
    for (const player of this.turnOrder) {
      this._sendPromptToPlayer(player);
    }
  }

  _sendPromptToPlayer(player) {
    const prompt = this.currentPrompts[player.id];
    if (prompt && player.send) {
      player.send("telephonePrompt", prompt);
    }
  }

  handleDrawDone(player) {
    if (this.getStateName() !== "Draw") return;
    if (!this.designerMode) return this._handleRegularDrawDone(player);

    const count = this.playerDrawCount[player.id] || 0;
    if (count >= 2) return;

    if (count === 0) {
      // Save drawing 1; client transitions to drawing 2 locally without a server round-trip
      this.playerStrokes1[player.id] = this.playerStrokes[player.id] || [];
      this.playerStrokes[player.id] = [];
      this.playerDrawCount[player.id] = 1;
    } else {
      // Save drawing 2, mark fully done
      this.playerStrokes2[player.id] = this.playerStrokes[player.id] || [];
      this.playerDrawCount[player.id] = 2;
      this.playerSubmissions[player.id] = true;
      this.broadcast("telephoneSubmitted", {
        name: player.name,
        total: this.turnOrder.filter((p) => (this.playerDrawCount[p.id] || 0) >= 2).length,
        needed: this.turnOrder.length,
      });
      const allDone = this.turnOrder.every((p) => (this.playerDrawCount[p.id] || 0) >= 2);
      if (allDone) this.gotoNextState && this.gotoNextState();
    }
  }

  _handleRegularDrawDone(player) {
    this.playerSubmissions[player.id] = true;
    this.broadcast("telephoneSubmitted", {
      name: player.name,
      total: Object.keys(this.playerSubmissions).length,
      needed: this.turnOrder.length,
    });
    const allDone = this.turnOrder.every((p) => this.playerSubmissions[p.id] !== undefined);
    if (allDone) this.gotoNextState && this.gotoNextState();
  }

  handleTelephoneSubmit(player, content) {
    const state = this.getStateName();
    if (state !== "Write" && state !== "Guess") return;
    if (typeof content !== "string") return;

    this.playerSubmissions[player.id] = content.slice(0, 200).trim();
    this.broadcast("telephoneSubmitted", {
      name: player.name,
      total: Object.keys(this.playerSubmissions).length,
      needed: this.turnOrder.length,
    });

    const allDone = this.turnOrder.every(
      (p) => this.playerSubmissions[p.id] !== undefined
    );
    if (allDone) this.gotoNextState && this.gotoNextState();
  }

  // ---- Designer mode methods ----

  _beginDesignerDraw() {
    this.playerStrokes = {};
    for (const p of this.turnOrder) {
      this.playerDrawCount[p.id] = 0;
    }
    this.currentPrompts = {};
    for (const player of this.turnOrder) {
      this.currentPrompts[player.id] = { phase: "draw", drawRound: 1 };
    }
    this._sendAllPrompts();
  }

  _beginCaption() {
    this.playerSubmissions = {};
    const n = this.turnOrder.length;
    // Each player captions two drawings: the one 'a' steps behind them (round 1)
    // and the one 1 step behind them (round 2).
    // For n>=5: a=3 gives two captions from different people, neither an artist.
    // For n=4: a=2 means both captions come from the same person, but that person
    // is excluded from voting, leaving exactly 1 eligible voter per matchup.
    const a = n <= 4 ? 2 : 3;

    for (let i = 0; i < n; i++) {
      const player = this.turnOrder[i];
      this.captionAssignments1[player.id] = this.turnOrder[(i - a + n) % n].id;
      this.captionAssignments2[player.id] = this.turnOrder[(i - 1 + n) % n].id;
      this.playerCaptionCount[player.id] = 0;
    }

    // Send each player their first caption prompt immediately
    for (const player of this.turnOrder) {
      const drawerId = this.captionAssignments1[player.id];
      if (player.send) {
        player.send("telephonePrompt", {
          phase: "caption",
          captionRound: 1,
          strokes: this.playerStrokes1[drawerId] || [],
        });
      }
    }
  }

  _beginVote() {
    const n = this.turnOrder.length;
    this.matchups = [];

    // Matchup i: turnOrder[i]'s drawing 1 vs turnOrder[(i+1)%n]'s drawing 2.
    // Each drawing appears in exactly one matchup; no voter sees the same drawing twice.
    for (let i = 0; i < n; i++) {
      this.matchups.push({
        id1: this.turnOrder[i].id,
        id2: this.turnOrder[(i + 1) % n].id,
      });
    }

    this.eligibleVoters = {};
    this.matchupVotes = {};
    this.matchupResults = new Array(this.matchups.length).fill(null);
    this.voteResolved = false;

    for (let i = 0; i < this.matchups.length; i++) {
      const matchup = this.matchups[i];
      const captioner1 = Object.keys(this.captionAssignments1).find(
        (pid) => this.captionAssignments1[pid] === matchup.id1
      );
      const captioner2 = Object.keys(this.captionAssignments2).find(
        (pid) => this.captionAssignments2[pid] === matchup.id2
      );
      const excluded = new Set([matchup.id1, matchup.id2, captioner1, captioner2]);
      const eligible = this.turnOrder.filter((p) => !excluded.has(p.id));
      this.eligibleVoters[i] = (eligible.length > 0 ? eligible : this.turnOrder).map(
        (p) => p.id
      );
      this.matchupVotes[i] = {};
    }

    this.createTimer("vote", 45 * 1000, () => this._resolveAllMatchups());
  }

  _resolveAllMatchups() {
    this.clearTimer("vote");
    if (this.voteResolved) return;

    const playerList = Object.values(this.players);
    const scoreEventMap = {};

    for (let i = 0; i < this.matchups.length; i++) {
      const matchup = this.matchups[i];
      const votes = this.matchupVotes[i] || {};

      let votes1 = 0, votes2 = 0;
      for (const drawerId of Object.values(votes)) {
        if (drawerId === matchup.id1) votes1++;
        else if (drawerId === matchup.id2) votes2++;
      }

      const drawer1 = playerList.find((p) => p.id === matchup.id1);
      const drawer2 = playerList.find((p) => p.id === matchup.id2);
      // poster1 = id1's drawing 1; poster2 = id2's drawing 2
      const captioner1 = playerList.find((p) => this.captionAssignments1[p.id] === matchup.id1);
      const captioner2 = playerList.find((p) => this.captionAssignments2[p.id] === matchup.id2);

      for (const drawerId of Object.values(votes)) {
        if (drawerId === matchup.id1) {
          if (drawer1) this.scores[drawer1.id].draw += 2;
          if (captioner1) this.scores[captioner1.id].caption += 1;
        } else if (drawerId === matchup.id2) {
          if (drawer2) this.scores[drawer2.id].draw += 2;
          if (captioner2) this.scores[captioner2.id].caption += 1;
        }
      }

      const BONUS = 2;
      let winner = null;
      if (votes1 > votes2) {
        winner = matchup.id1;
        if (drawer1) this.scores[drawer1.id].draw += BONUS;
      } else if (votes2 > votes1) {
        winner = matchup.id2;
        if (drawer2) this.scores[drawer2.id].draw += BONUS;
      } else {
        if (drawer1) this.scores[drawer1.id].draw += Math.floor(BONUS / 2);
        if (drawer2) this.scores[drawer2.id].draw += Math.floor(BONUS / 2);
      }

      this.matchupResults[i] = { id1: matchup.id1, id2: matchup.id2, votes1, votes2, winner };

      const addEvent = (name, delta, kind) => {
        if (!name) return;
        if (scoreEventMap[name]) scoreEventMap[name].delta += delta;
        else scoreEventMap[name] = { name, delta, kind };
      };

      addEvent(drawer1?.name, votes1 * 2 + (winner === matchup.id1 ? BONUS : winner === null ? Math.floor(BONUS / 2) : 0), "draw");
      addEvent(drawer2?.name, votes2 * 2 + (winner === matchup.id2 ? BONUS : winner === null ? Math.floor(BONUS / 2) : 0), "draw");
      if (votes1 > 0) addEvent(captioner1?.name, votes1, "caption");
      if (votes2 > 0) addEvent(captioner2?.name, votes2, "caption");
    }

    for (const p of playerList) {
      const s = this.scores[p.id] || { draw: 0, caption: 0 };
      p.setScore(s.draw + s.caption);
    }

    this.voteResolved = true;
    this.broadcast("telephoneVoteResults", this._buildAllMatchupsPayload());
    this.broadcast("telephoneScoreEvents", Object.values(scoreEventMap));

    this.createTimer("reveal", REVEAL_TIME * 3, () => {
      this.gotoNextState && this.gotoNextState();
    });
  }

  _buildAllMatchupsPayload() {
    const playerList = Object.values(this.players);
    return this.matchups.map((matchup, i) => {
      const drawer1 = playerList.find((p) => p.id === matchup.id1);
      const drawer2 = playerList.find((p) => p.id === matchup.id2);
      const captioner1 = playerList.find((p) => this.captionAssignments1[p.id] === matchup.id1);
      const captioner2 = playerList.find((p) => this.captionAssignments2[p.id] === matchup.id2);
      return {
        index: i,
        eligibleVoterIds: this.eligibleVoters[i] || [],
        voterIds: Object.keys(this.matchupVotes[i] || {}),
        poster1: {
          drawerId: matchup.id1,
          drawerName: drawer1 ? drawer1.name : "?",
          captionerId: captioner1 ? captioner1.id : null,
          captionerName: captioner1 ? captioner1.name : "?",
          caption: this.playerCaptions1[matchup.id1] || "",
          strokes: this.playerStrokes1[matchup.id1] || [],
        },
        poster2: {
          drawerId: matchup.id2,
          drawerName: drawer2 ? drawer2.name : "?",
          captionerId: captioner2 ? captioner2.id : null,
          captionerName: captioner2 ? captioner2.name : "?",
          caption: this.playerCaptions2[matchup.id2] || "",
          strokes: this.playerStrokes2[matchup.id2] || [],
        },
        result: this.matchupResults[i] || null,
      };
    });
  }

  handleCaptionSubmit(player, content) {
    if (this.getStateName() !== "Caption") return;
    if (typeof content !== "string") return;

    const count = this.playerCaptionCount[player.id] || 0;
    if (count >= 2) return;

    if (count === 0) {
      // Save caption 1, immediately send them poster 2 to caption
      const drawerId1 = this.captionAssignments1[player.id];
      if (!drawerId1) return;
      this.playerCaptions1[drawerId1] = content.slice(0, 150).trim();
      this.playerCaptionCount[player.id] = 1;
      const drawerId2 = this.captionAssignments2[player.id];
      if (player.send && drawerId2) {
        player.send("telephonePrompt", {
          phase: "caption",
          captionRound: 2,
          strokes: this.playerStrokes2[drawerId2] || [],
        });
      }
    } else {
      // Save caption 2, mark fully done
      const drawerId2 = this.captionAssignments2[player.id];
      if (!drawerId2) return;
      this.playerCaptions2[drawerId2] = content.slice(0, 150).trim();
      this.playerCaptionCount[player.id] = 2;
      this.playerSubmissions[player.id] = true;
      this.broadcast("telephoneSubmitted", {
        name: player.name,
        total: this.turnOrder.filter((p) => (this.playerCaptionCount[p.id] || 0) >= 2).length,
        needed: this.turnOrder.length,
      });
      const allDone = this.turnOrder.every((p) => (this.playerCaptionCount[p.id] || 0) >= 2);
      if (allDone) this.gotoNextState && this.gotoNextState();
    }
  }

  handlePosterVote(player, data) {
    if (this.getStateName() !== "Vote") return;
    if (this.voteResolved) return;
    if (!data || typeof data !== "object") return;
    const { matchupIndex, drawerId } = data;
    if (typeof matchupIndex !== "number" || typeof drawerId !== "string") return;

    const matchup = this.matchups[matchupIndex];
    if (!matchup) return;
    if (drawerId !== matchup.id1 && drawerId !== matchup.id2) return;
    if (drawerId === player.id) return;

    const eligible = this.eligibleVoters[matchupIndex] || [];
    if (!eligible.includes(player.id)) return;
    if (this.matchupVotes[matchupIndex][player.id] !== undefined) return;

    this.matchupVotes[matchupIndex][player.id] = drawerId;
    this.broadcast("telephoneVoted", { voterId: player.id, matchupIndex });

    const allDone = this.matchups.every((_, i) =>
      (this.eligibleVoters[i] || []).every(
        (vid) => this.matchupVotes[i][vid] !== undefined
      )
    );
    if (allDone) this._resolveAllMatchups();
  }

  // ---- Shared stroke handling ----

  handleStrokeEvent(player, eventType, payload) {
    if (this.getStateName() !== "Draw") return;

    if (!this.playerStrokes[player.id]) this.playerStrokes[player.id] = [];
    const strokes = this.playerStrokes[player.id];

    if (eventType === "drawStroke") {
      if (!payload.strokeId || typeof payload.strokeId !== "string") return;
      let stroke = strokes.find((s) => s.id === payload.strokeId);
      if (!stroke) {
        stroke = {
          id: payload.strokeId.slice(0, 32),
          color: this._sanitizeColor(payload.color),
          size: this._sanitizeSize(payload.size),
          mode: payload.mode === "erase" ? "erase" : "draw",
          points: [],
          sealed: false,
        };
        if (strokes.length < 500) strokes.push(stroke);
        else return;
      }
      if (Array.isArray(payload.points)) {
        const maxX = this.designerMode ? 600 : 800;
        const maxY = this.designerMode ? 800 : 600;
        const pts = [];
        for (const pair of payload.points.slice(0, 200)) {
          if (!Array.isArray(pair) || pair.length < 2) continue;
          const x = +pair[0], y = +pair[1];
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          pts.push([Math.max(0, Math.min(maxX, x)), Math.max(0, Math.min(maxY, y))]);
        }
        stroke.points.push(...pts);
      }
    } else if (eventType === "endStroke") {
      const stroke = strokes.find((s) => s.id === payload.strokeId);
      if (stroke) stroke.sealed = true;
    } else if (eventType === "undo" || eventType === "undoStroke") {
      const last = strokes.pop();
      if (last && player.send) player.send("drawDelta", { type: "undo", strokeId: last.id });
    } else if (eventType === "clearCanvas") {
      this.playerStrokes[player.id] = [];
      if (player.send) player.send("drawDelta", { type: "clearCanvas" });
    }
  }

  _sanitizeColor(c) {
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#000000";
  }

  _sanitizeSize(s) {
    return [10, 25, 40].includes(+s) ? +s : 25;
  }

  checkAllMeetingsReady() {
    const name = this.getStateName();
    if (name === "Write" || name === "Draw" || name === "Guess") return;
    if (this.designerMode && (name === "Caption" || name === "Vote")) return;
    super.checkAllMeetingsReady();
  }

  createNextStateTimer(stateInfo) {
    const name = stateInfo && stateInfo.name;
    if (this.designerMode) {
      if (name === "Draw" || name === "Caption") {
        this.createTimer("main", stateInfo.length * 2, () => this.gotoNextState());
        return;
      }
      if (name === "Vote") return;
    }
    if (name === "Write" || name === "Draw" || name === "Guess") {
      this.createTimer("main", stateInfo.length, () => this.gotoNextState());
      return;
    }
    super.createNextStateTimer(stateInfo);
  }

  checkWinConditions() {
    if (this.designerMode) {
      if (!this.voteResolved) return [false, undefined];

      const winners = new Winners(this);
      let highest = -1;
      let leaders = [];
      for (const p of Object.values(this.players)) {
        const s = p.getScore();
        if (s > highest) { highest = s; leaders = [p]; }
        else if (s === highest) { leaders.push(p); }
      }
      if (leaders.length > 0) {
        for (const p of leaders) winners.addPlayer(p, p.name);
      } else {
        winners.addGroup("No one");
      }
      winners.determinePlayers();
      return [true, winners];
    }

    if (this.currentRound < this.turnOrder.length) return [false, undefined];

    const winners = new Winners(this);
    winners.addGroup("Everyone");
    winners.determinePlayers();
    return [true, winners];
  }

  getStateInfo(state) {
    const info = super.getStateInfo(state);

    if (this.designerMode) {
      const scores = {};
      for (const p of Object.values(this.players)) {
        scores[p.id] = {
          ...(this.scores[p.id] || { draw: 0, caption: 0 }),
          name: p.name,
        };
      }

      info.extraInfo = {
        designerMode: true,
        submittedCount: Object.keys(this.playerSubmissions).length,
        submittedNames: this.turnOrder
          .filter((p) => this.playerSubmissions[p.id])
          .map((p) => p.name),
        scores,
      };

      if (info.name === "Vote") {
        info.extraInfo.allMatchups = this._buildAllMatchupsPayload();
        info.extraInfo.totalMatchups = this.matchups.length;
        info.extraInfo.voteResolved = this.voteResolved;
      }

      if (info.name === "Postgame") {
        const gallery = [];
        for (const p of this.turnOrder) {
          const mi1 = this.matchups.findIndex((m) => m.id1 === p.id);
          const votes1 = mi1 >= 0 && this.matchupResults[mi1] ? this.matchupResults[mi1].votes1 : 0;
          const cap1 = Object.values(this.players).find((c) => this.captionAssignments1[c.id] === p.id);
          gallery.push({
            drawerId: p.id,
            drawerName: p.name,
            round: 1,
            votes: votes1,
            captionerId: cap1 ? cap1.id : null,
            captionerName: cap1 ? cap1.name : "?",
            caption: this.playerCaptions1[p.id] || "",
            strokes: this.playerStrokes1[p.id] || [],
            score: this.scores[p.id] || { draw: 0, caption: 0 },
          });
          const mi2 = this.matchups.findIndex((m) => m.id2 === p.id);
          const votes2 = mi2 >= 0 && this.matchupResults[mi2] ? this.matchupResults[mi2].votes2 : 0;
          const cap2 = Object.values(this.players).find((c) => this.captionAssignments2[c.id] === p.id);
          gallery.push({
            drawerId: p.id,
            drawerName: p.name,
            round: 2,
            votes: votes2,
            captionerId: cap2 ? cap2.id : null,
            captionerName: cap2 ? cap2.name : "?",
            caption: this.playerCaptions2[p.id] || "",
            strokes: this.playerStrokes2[p.id] || [],
            score: this.scores[p.id] || { draw: 0, caption: 0 },
          });
        }
        gallery.sort((a, b) => b.votes - a.votes);
        info.extraInfo.gallery = gallery;
        info.extraInfo.matchupResults = this.matchupResults;
      }

      return info;
    }

    info.extraInfo = {
      currentRound: this.currentRound,
      totalRounds: this.turnOrder.length,
      submittedCount: Object.keys(this.playerSubmissions).length,
      submittedNames: Object.values(this.turnOrder)
        .filter((p) => this.playerSubmissions[p.id] !== undefined)
        .map((p) => p.name),
      eidetekerMode: this.eidetekerMode,
    };

    if (info.name === "Postgame") {
      info.extraInfo.chains = this.chains;
    }

    return info;
  }

  getGameTypeOptions() {
    return {};
  }
};
