import React, { useContext, useEffect, useState, useCallback, useRef } from "react";
import { Button, TextField, Typography, Stack, Paper, Chip, Box } from "@mui/material";
import {
  useSocketListeners,
  ThreePanelLayout,
  TopBar,
  PlayerList,
  TextMeetingLayout,
  SpeechFilter,
  SettingsMenu,
  MobileLayout,
  GameTypeContext,
} from "./Game";
import { GameContext } from "../../Contexts";
import DrawCanvas, { emitUndo, emitClear } from "./components/DrawCanvas";
import DrawTools from "./components/DrawTools";

import "./components/DrawItGame.css";

export default function TelephoneGame() {
  const game = useContext(GameContext);
  const history = game.history;
  const stateViewing = game.stateViewing;
  const updateStateViewing = game.updateStateViewing;

  useEffect(() => {
    updateStateViewing({ type: "current" });
  }, [history.currentState, updateStateViewing]);

  useEffect(() => {
    if (game.review) updateStateViewing({ type: "first" });
  }, []);

  const currentState = history.states[stateViewing];
  const extraInfo = (currentState && currentState.extraInfo) || {};
  const stateName = currentState ? currentState.name : "";
  const self = game.self;
  const selfPlayer = self && game.players ? game.players[self] : null;
  const selfName = selfPlayer ? selfPlayer.name : null;

  const [myPrompt, setMyPrompt] = useState(null);
  const [inputText, setInputText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [drawDone, setDrawDone] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);
  const [flashCountdown, setFlashCountdown] = useState(0);

  // Designer caption state
  const [captionText, setCaptionText] = useState("");
  const [captionSubmitted, setCaptionSubmitted] = useState(false);
  const [liveSubmittedNames, setLiveSubmittedNames] = useState([]);

  const currentRound = extraInfo.currentRound ?? 0;
  const totalRounds = extraInfo.totalRounds || Object.keys(game.players || {}).length || 0;
  const serverSubmittedNames = extraInfo.submittedNames || [];
  const submittedNames = [...new Set([...serverSubmittedNames, ...liveSubmittedNames])];
  const chains = extraInfo.chains || null;
  const eidetekerMode = extraInfo.eidetekerMode || false;
  const designerMode = extraInfo.designerMode || false;
  const scores = extraInfo.scores || {};

  // Local per-player round tracking (so players transition back-to-back without waiting)
  const [myDrawRound, setMyDrawRound] = useState(1);
  const [myCaptionRound, setMyCaptionRound] = useState(1);
  // Synchronous guard against double-click: tracks which draw round was last submitted.
  // Starts at 1; incremented to 2 on draw-1 submit, 3 on draw-2 submit.
  // Because React state is async, iHaveDrawnDone alone cannot block a rapid second click.
  const drawSubmitRoundRef = useRef(1);

  const playersByName = {};
  for (const p of Object.values(game.players || {})) {
    if (p.name) playersByName[p.name] = p;
  }

  // Designer vote state
  const [myVotes, setMyVotes] = useState({});
  const [currentVoteIdx, setCurrentVoteIdx] = useState(0);
  const [liveAllMatchups, setLiveAllMatchups] = useState(null);
  const [scoreEventsByName, setScoreEventsByName] = useState({});

  const FLASH_SECONDS = 8;

  // Drawing tool state
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(10);
  const [eraseMode, setEraseMode] = useState(false);


  useEffect(() => {
    setInputText("");
    setSubmitted(false);
    setDrawDone(false);
    setFlashVisible(false);
    setFlashCountdown(0);
    setCaptionText("");
    setCaptionSubmitted(false);
    setMyVotes({});
    setCurrentVoteIdx(0);
    setLiveAllMatchups(null);
    setLiveSubmittedNames([]);
    setScoreEventsByName({});
    setMyDrawRound(1);
    setMyCaptionRound(1);
    drawSubmitRoundRef.current = 1;
    // Don't clear myPrompt here — telephonePrompt arrives before the state
    // broadcast and clearing it would wipe the prompt before it can render.
  }, [stateName, currentRound]);

  useSocketListeners((socket) => {
    socket.on("telephonePrompt", (prompt) => {
      setMyPrompt(prompt);
      // Caption round 2 arrives from server (needs to carry the new poster's strokes)
      if (prompt.phase === "caption" && prompt.captionRound === 2) {
        setCaptionSubmitted(false);
        setCaptionText("");
        setMyCaptionRound(2);
      }
    });
    socket.on("telephoneVoteResults", (allMatchups) => setLiveAllMatchups(allMatchups));
    socket.on("telephoneSubmitted", ({ name }) => {
      setLiveSubmittedNames((prev) => prev.includes(name) ? prev : [...prev, name]);
    });
    socket.on("telephoneScoreEvents", (events) => {
      if (!Array.isArray(events)) return;
      const map = {};
      for (const e of events) {
        if (e && e.name) map[e.name] = e;
      }
      setScoreEventsByName(map);
    });
  }, game.socket);

  const isPostgame = stateName === "Postgame";
  const isWritePhase = stateName === "Write";
  const isDrawPhase = stateName === "Draw";
  const isGuessPhase = stateName === "Guess";
  const isCaptionPhase = stateName === "Caption";
  const isVotePhase = stateName === "Vote";
  const isCurrentState = stateViewing === history.currentState;

  // Flash timer: show reference briefly then hide it so they draw from memory
  useEffect(() => {
    const isEidetekerDraw = eidetekerMode && (isDrawPhase || (isWritePhase && eidetekerMode));
    if (!isEidetekerDraw || !isCurrentState || currentRound === 0) return;
    setFlashVisible(true);
    setFlashCountdown(FLASH_SECONDS);
    const interval = setInterval(() => {
      setFlashCountdown((t) => {
        if (t <= 1) {
          clearInterval(interval);
          setFlashVisible(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [eidetekerMode, isDrawPhase, isWritePhase, isCurrentState, myPrompt, currentRound]);

  const iHaveSubmitted = submitted || submittedNames.includes(selfName);
  const iHaveDrawnDone = drawDone || submittedNames.includes(selfName);
  const iHaveCaptioned = captionSubmitted || submittedNames.includes(selfName);

  function submitText() {
    if (!inputText.trim() || iHaveSubmitted) return;
    game.socket.send("telephoneSubmit", inputText.trim());
    setSubmitted(true);
  }

  function submitDrawDone() {
    if (iHaveDrawnDone) return;
    // Guard against rapid double-click: drawSubmitRoundRef is synchronous unlike React state.
    // It must match myDrawRound — if it's already been bumped for this round, block the click.
    if (drawSubmitRoundRef.current !== myDrawRound) return;
    drawSubmitRoundRef.current = myDrawRound + 1;
    game.socket.send("telephoneDrawDone");
    if (designerMode && myDrawRound === 1) {
      // Immediately flip to drawing 2 — no server round-trip needed
      setMyDrawRound(2);
    } else {
      setDrawDone(true);
    }
  }

  function submitCaption() {
    if (!captionText.trim() || iHaveCaptioned) return;
    game.socket.send("telephoneCaption", captionText.trim());
    setCaptionSubmitted(true);
  }

  function submitVote(matchupIndex, drawerId) {
    if (myVotes[matchupIndex] !== undefined || drawerId === self) return;
    game.socket.send("telephoneVote", { matchupIndex, drawerId });
    setMyVotes((prev) => ({ ...prev, [matchupIndex]: drawerId }));
    setCurrentVoteIdx((prev) => prev + 1);
  }

  // --- LEFT PANEL ---
  const leftContent = (
    <>
      <PlayerList
        renderMarker={(player) => {
          const s = scores[player.id] || { draw: 0, caption: 0 };
          const total = s.draw + s.caption;
          const evt = scoreEventsByName[player.name];
          return (
            <>
              <span className="draw-score-chip" style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1 }}>
                <span>{total}</span>
                {total > 0 && (
                  <span style={{ fontSize: "0.6em", opacity: 0.75, whiteSpace: "nowrap" }}>
                    {s.draw > 0 && <span>🎨{s.draw}</span>}
                    {s.draw > 0 && s.caption > 0 && " "}
                    {s.caption > 0 && <span>💬{s.caption}</span>}
                  </span>
                )}
              </span>
              {evt && (
                <span className={`draw-score-event draw-score-event-${evt.kind}`}>
                  +{evt.delta}
                  {evt.kind === "draw" && <i className="fas fa-paint-brush draw-score-event-icon" />}
                  {evt.kind === "caption" && <i className="fas fa-comment draw-score-event-icon" />}
                </span>
              )}
              {submittedNames.includes(player.name) && !isVotePhase && (
                <Chip label="✓" size="small" color="success" sx={{ height: 20, fontSize: "0.7rem", ml: 0.5 }} />
              )}
            </>
          );
        }}
      />
      <div className="draw-round-info">
        {designerMode ? (
          <div className="draw-turn-line">
            {isDrawPhase && `Drawing ${myDrawRound} of 2`}
            {isCaptionPhase && `Captioning ${myCaptionRound} of 2`}
            {isVotePhase && "Vote!"}
            {isPostgame && "Game over!"}
          </div>
        ) : (
          <>
            <div className="draw-round-line">
              Round {Math.min(currentRound + 1, totalRounds || 1)} / {totalRounds || "?"}
            </div>
            <div className="draw-turn-line">
              {isWritePhase && !eidetekerMode && "Write a starting phrase"}
              {isDrawPhase && (eidetekerMode ? (currentRound === 0 ? "Draw anything" : "Reproduce the drawing") : "Draw what you received")}
              {isGuessPhase && "Guess the drawing"}
              {isPostgame && "Game over!"}
            </div>
          </>
        )}
      </div>
      <SpeechFilter />
      <SettingsMenu />
    </>
  );

  // --- CENTER PANEL ---
  let centerContent;

  if (designerMode) {
    // ---- DESIGNER MODE RENDERING ----
    if (isDrawPhase && isCurrentState) {
      centerContent = (
        <Stack spacing={1} sx={{ width: "100%", alignItems: "center" }}>
          <Paper elevation={1} sx={{ px: 2, py: 1, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Poster {myDrawRound} of 2 — others will caption it!
            </Typography>
          </Paper>
          <DrawTools
            color={color}
            onColor={setColor}
            size={size}
            onSize={setSize}
            eraseMode={eraseMode}
            onErase={setEraseMode}
            onUndo={() => emitUndo(game.socket)}
            onClear={() => emitClear(game.socket)}
          />
          <div className="draw-canvas-wrap draw-canvas-wrap--poster" style={{ width: "100%" }}>
            <DrawCanvas
              key={myDrawRound}
              mode="drawer"
              socket={game.socket}
              initialStrokes={null}
              color={eraseMode ? "#ffffff" : color}
              size={size}
              eraseMode={eraseMode}
              portrait
            />
          </div>
          <Button
            variant={iHaveDrawnDone ? "outlined" : "contained"}
            color={iHaveDrawnDone ? "success" : "primary"}
            disabled={iHaveDrawnDone}
            onClick={submitDrawDone}
            fullWidth
            sx={{ maxWidth: 400 }}
          >
            {iHaveDrawnDone ? "Done ✓" : "Done Drawing"}
          </Button>
        </Stack>
      );
    } else if (isCaptionPhase) {
      const strokes = myPrompt && myPrompt.phase === "caption" && myPrompt.strokes
        ? myPrompt.strokes
        : [];
      centerContent = (
        <Stack spacing={1} sx={{ width: "100%", alignItems: "center" }}>
          <Paper elevation={1} sx={{ px: 2, py: 1, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Caption {myCaptionRound} of 2
            </Typography>
          </Paper>
          <div className="draw-canvas-wrap draw-canvas-wrap--poster" style={{ width: "100%" }}>
            <DrawCanvas mode="viewer" initialStrokes={strokes} socket={null} portrait />
          </div>
          {isCurrentState && (
            <Stack spacing={1} sx={{ width: "100%", maxWidth: 500 }}>
              <TextField
                variant="outlined"
                size="small"
                fullWidth
                value={captionText}
                disabled={iHaveCaptioned}
                onChange={(e) => setCaptionText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCaption()}
                placeholder="Your caption…"
                autoFocus
                slotProps={{ htmlInput: { maxLength: 150 } }}
              />
              <Button
                variant={iHaveCaptioned ? "outlined" : "contained"}
                color={iHaveCaptioned ? "success" : "primary"}
                disabled={iHaveCaptioned || !captionText.trim()}
                onClick={submitCaption}
                fullWidth
              >
                {iHaveCaptioned ? "Submitted ✓" : "Submit Caption"}
              </Button>
            </Stack>
          )}
        </Stack>
      );
    } else if (isVotePhase) {
      const allMatchups = liveAllMatchups || extraInfo.allMatchups || [];
      const resolved = !!liveAllMatchups || extraInfo.voteResolved;
      const myMatchups = allMatchups.filter(
        (m) => m.eligibleVoterIds && m.eligibleVoterIds.includes(self)
      );
      const currentVoteMatchup = myMatchups[currentVoteIdx] ?? null;

      centerContent = (
        <Box sx={{ overflowY: "auto", maxHeight: "calc(100vh - 120px)", p: 1 }}>
          <Stack spacing={2}>
            {resolved ? (
              allMatchups.map((m) => (
                <MatchupDisplay
                  key={m.index}
                  matchup={m}
                  myVote={myVotes[m.index]}
                  self={self}
                  onVote={null}
                />
              ))
            ) : currentVoteMatchup ? (
              <>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Battle {currentVoteIdx + 1} of {myMatchups.length}
                </Typography>
                <MatchupDisplay
                  matchup={currentVoteMatchup}
                  myVote={myVotes[currentVoteMatchup.index]}
                  self={self}
                  onVote={isCurrentState ? (drawerId) => submitVote(currentVoteMatchup.index, drawerId) : null}
                />
              </>
            ) : (
              <>
                <Paper sx={{ p: 1.5, textAlign: "center" }}>
                  <Typography color="text.secondary">
                    {myMatchups.length === 0
                      ? "Your poster is in every battle — results coming soon!"
                      : "All votes cast — waiting for results…"}
                  </Typography>
                </Paper>
                {myMatchups.map((m) => (
                  <MatchupDisplay
                    key={m.index}
                    matchup={m}
                    myVote={myVotes[m.index]}
                    self={self}
                    onVote={null}
                  />
                ))}
              </>
            )}
          </Stack>
        </Box>
      );
    } else if (isPostgame) {
      const gallery = extraInfo.gallery || [];
      centerContent = (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <Typography variant="h2" textAlign="center" sx={{ pt: 8, pb: 1, flexShrink: 0 }}>
            Gallery
          </Typography>
          <Box sx={{
            display: "flex",
            overflowX: "auto",
            overflowY: "hidden",
            flexGrow: 1,
            gap: 4,
            px: 4,
            py: 0.5,
            alignItems: "center",
            scrollSnapType: "x mandatory",
            "&::-webkit-scrollbar": { height: 6 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(255,255,255,0.2)", borderRadius: 3 },
          }}>
            {gallery.map((item, i) => (
              <Box key={i} sx={{ flexShrink: 0, scrollSnapAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", width: 260 }}>
                {/* Framed poster */}
                <Paper elevation={8} sx={{ p: 1.5, bgcolor: "#f5f0e8", borderRadius: 1 }}>
                  <div className="draw-canvas-wrap draw-canvas-wrap--poster">
                    <DrawCanvas mode="viewer" initialStrokes={item.strokes || []} socket={null} portrait />
                  </div>
                </Paper>
                {/* Museum label */}
                <Box sx={{ mt: 1.5, textAlign: "center", maxWidth: 240 }}>
                  {item.caption && (
                    <Typography variant="body1" fontStyle="italic" sx={{ mb: 0.5 }}>
                      {item.caption}
                    </Typography>
                  )}
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ color: playerAvatarColor(item.drawerName) }}>
                    {item.drawerName}{" "}
                    <Typography component="span" variant="caption" color="text.secondary">
                      #{item.round}
                    </Typography>
                  </Typography>
                  {item.captionerName !== "?" && (
                    <Typography variant="body2" color="text.secondary" display="block">
                      caption by {item.captionerName}
                    </Typography>
                  )}
                  {item.votes != null && (
                    <Typography variant="body2" color="text.secondary" display="block">
                      {item.votes} vote{item.votes !== 1 ? "s" : ""}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      );
    } else {
      centerContent = (
        <Stack alignItems="center" justifyContent="center" sx={{ height: 200, opacity: 0.5 }}>
          <Typography>Waiting…</Typography>
        </Stack>
      );
    }
  } else {
    // ---- REGULAR TELEPHONE / EIDETIKER MODE RENDERING ----
    if (isPostgame && chains) {
      centerContent = (
        <PostgameChainViewer chains={chains} gameId={game.gameId} playersByName={playersByName} />
      );
    } else if (isWritePhase && !eidetekerMode) {
      centerContent = (
        <TextPhase
          title="Write a starting phrase"
          subtitle="Everyone writes simultaneously — no one can see yours."
          inputText={inputText}
          setInputText={setInputText}
          onSubmit={submitText}
          submitted={iHaveSubmitted}
          placeholder="e.g. a dog riding a bicycle"
          socket={game.socket}
        />
      );
    } else if (isDrawPhase || (isWritePhase && eidetekerMode)) {
      const promptText = myPrompt ? myPrompt.content : null;
      const referenceStrokes = eidetekerMode && myPrompt ? myPrompt.strokes || [] : null;
      centerContent = (
        <Stack direction="column" spacing={1} sx={{ width: "100%", alignItems: "center" }}>
          {eidetekerMode ? (
            currentRound > 0 ? (
              flashVisible ? (
                <Stack spacing={1} sx={{ width: "100%", alignItems: "center" }}>
                  <Paper elevation={2} sx={{ width: "100%", p: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block", textAlign: "center" }}>
                      Memorize this drawing ({flashCountdown}s)
                    </Typography>
                    <div className="draw-canvas-wrap" style={{ width: "100%" }}>
                      <DrawCanvas mode="viewer" initialStrokes={referenceStrokes} socket={null} />
                    </div>
                  </Paper>
                  {isCurrentState && (
                    <Button variant="contained" fullWidth sx={{ maxWidth: 400 }} onClick={() => setFlashVisible(false)}>
                      Start Drawing
                    </Button>
                  )}
                </Stack>
              ) : (
                <Paper elevation={1} sx={{ px: 2, py: 1, textAlign: "center", opacity: 0.6 }}>
                  <Typography variant="body2">Reproduce from memory!</Typography>
                </Paper>
              )
            ) : (
              <Paper elevation={1} sx={{ px: 2, py: 1, textAlign: "center", opacity: 0.6 }}>
                <Typography variant="body2">Draw anything.</Typography>
              </Paper>
            )
          ) : (
            <>
              {promptText && (
                <Paper elevation={2} sx={{ px: 2, py: 1, textAlign: "center", bgcolor: "primary.dark" }}>
                  <Typography variant="body1" fontWeight="bold" color="white">
                    Draw: {promptText}
                  </Typography>
                </Paper>
              )}
              {!promptText && (
                <Paper elevation={1} sx={{ px: 2, py: 1, textAlign: "center", opacity: 0.6 }}>
                  <Typography variant="body2">No prompt received.</Typography>
                </Paper>
              )}
            </>
          )}
          {isCurrentState && !flashVisible && (
            <DrawTools
              color={color}
              onColor={setColor}
              size={size}
              onSize={setSize}
              eraseMode={eraseMode}
              onErase={setEraseMode}
              onUndo={() => emitUndo(game.socket)}
              onClear={() => emitClear(game.socket)}
            />
          )}
          {!flashVisible && (
            <div className="draw-canvas-wrap" style={{ width: "100%" }}>
              <DrawCanvas
                mode={isCurrentState ? "drawer" : "viewer"}
                socket={game.socket}
                initialStrokes={null}
                color={eraseMode ? "#ffffff" : color}
                size={size}
                eraseMode={eraseMode}
              />
            </div>
          )}
          {isCurrentState && !flashVisible && (
            <Button
              variant={iHaveDrawnDone ? "outlined" : "contained"}
              color={iHaveDrawnDone ? "success" : "primary"}
              disabled={iHaveDrawnDone}
              onClick={submitDrawDone}
              fullWidth
              sx={{ maxWidth: 400 }}
            >
              {iHaveDrawnDone ? "Done ✓" : "Done Drawing"}
            </Button>
          )}
        </Stack>
      );
    } else if (isGuessPhase) {
      const drawingStrokes = myPrompt && myPrompt.strokes ? myPrompt.strokes : [];
      centerContent = (
        <Stack direction="column" spacing={1} sx={{ width: "100%", alignItems: "center" }}>
          <div className="draw-canvas-wrap" style={{ width: "100%" }}>
            <DrawCanvas
              mode="viewer"
              initialStrokes={drawingStrokes}
              socket={game.socket}
            />
          </div>
          <TextPhase
            title="What is this drawing?"
            inputText={inputText}
            setInputText={setInputText}
            onSubmit={submitText}
            submitted={iHaveSubmitted}
            placeholder="Your best guess…"
            socket={game.socket}
          />
        </Stack>
      );
    } else {
      centerContent = (
        <Stack alignItems="center" justifyContent="center" sx={{ height: 200, opacity: 0.5 }}>
          <Typography>Waiting…</Typography>
        </Stack>
      );
    }
  }

  return (
    <GameTypeContext.Provider value={{ singleState: true }}>
      <TopBar />
      <ThreePanelLayout
        leftPanelContent={leftContent}
        centerPanelContent={centerContent}
        rightPanelContent={<TextMeetingLayout />}
      />
      <MobileLayout
        chatTab
        hideInfoTab
        outerLeftContent={leftContent}
        mainContent={centerContent}
      />
    </GameTypeContext.Provider>
  );
}

// --- Shared text-input phase component ---
function TextPhase({ title, subtitle, inputText, setInputText, onSubmit, submitted, placeholder }) {
  return (
    <Stack spacing={1.5} sx={{ width: "100%", maxWidth: 500, p: 1, mx: "auto" }}>
      <Typography variant="h6" textAlign="center">{title}</Typography>
      {subtitle && (
        <Typography variant="body2" textAlign="center" color="text.secondary">{subtitle}</Typography>
      )}
      <TextField
        variant="outlined"
        size="small"
        fullWidth
        value={inputText}
        disabled={submitted}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder={placeholder}
        autoFocus
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <Button
        variant={submitted ? "outlined" : "contained"}
        color={submitted ? "success" : "primary"}
        disabled={submitted || !inputText.trim()}
        onClick={onSubmit}
        fullWidth
      >
        {submitted ? "Submitted ✓" : "Submit"}
      </Button>
    </Stack>
  );
}

// --- Designer mode: MatchupDisplay ---
function MatchupDisplay({ matchup, myVote, self, onVote }) {
  const { poster1, poster2, result } = matchup;
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={2}>
        <PosterCard
          poster={poster1}
          result={result}
          voteCount={result ? result.votes1 : null}
          myVote={myVote}
          self={self}
          revealed={!!result}
          onVote={onVote}
        />
        <Box sx={{
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.2rem", fontWeight: "bold", color: "text.secondary", flexShrink: 0,
        }}>
          VS
        </Box>
        <PosterCard
          poster={poster2}
          result={result}
          voteCount={result ? result.votes2 : null}
          myVote={myVote}
          self={self}
          revealed={!!result}
          onVote={onVote}
        />
      </Stack>
      {result && (
        <Paper elevation={2} sx={{ p: 1.5, textAlign: "center", bgcolor: result.winner ? "success.dark" : "grey.800" }}>
          <Typography variant="h6" fontWeight="bold" color="white">
            {result.winner
              ? `${(result.winner === poster1.drawerId ? poster1 : poster2).drawerName} wins!`
              : "Tie!"}
          </Typography>
        </Paper>
      )}
    </Stack>
  );
}

// --- Designer mode: PosterCard ---
function PosterCard({ poster, result, voteCount, myVote, self, revealed, onVote }) {
  const isOwnPoster = poster.drawerId === self;
  const voted = myVote === poster.drawerId;
  const won = result && result.winner === poster.drawerId;
  const lost = result && result.winner && result.winner !== poster.drawerId;
  const avatarColor = playerAvatarColor(poster.drawerName);

  const borderColor = won
    ? "#4caf50"
    : lost
    ? "#555"
    : voted
    ? avatarColor
    : "transparent";

  return (
    <Stack flex={1} spacing={0.5} sx={{
      border: `2px solid ${borderColor}`,
      borderRadius: 2,
      p: 1,
      transition: "border-color 0.3s",
      opacity: lost ? 0.6 : 1,
    }}>
      <div className="draw-canvas-wrap draw-canvas-wrap--poster" style={{ width: "100%" }}>
        <DrawCanvas mode="viewer" initialStrokes={poster.strokes || []} socket={null} portrait />
      </div>

      {poster.caption && (
        <Paper elevation={1} sx={{ p: 1, textAlign: "center" }}>
          <Typography variant="body2" fontStyle="italic">
            {poster.caption}
          </Typography>
        </Paper>
      )}

      {revealed && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            <Typography variant="caption" color="text.secondary">
              🎨 {poster.drawerName}
            </Typography>
            {poster.captionerName !== "?" && (
              <Typography variant="caption" color="text.secondary">
                · 💬 {poster.captionerName}
              </Typography>
            )}
          </Stack>
          {voteCount != null && (
            <Typography variant="caption" fontWeight="bold" color="text.secondary">
              {voteCount} vote{voteCount !== 1 ? "s" : ""}
            </Typography>
          )}
        </Stack>
      )}

      {!result && (
        onVote && (
          <Button
            variant={voted ? "outlined" : "contained"}
            color={voted ? "success" : "primary"}
            size="medium"
            disabled={voted || isOwnPoster || revealed}
            onClick={() => onVote(poster.drawerId)}
            fullWidth
          >
            {isOwnPoster ? "Your poster" : voted ? "Voted ✓" : "Vote"}
          </Button>
        )
      )}
    </Stack>
  );
}


// --- GIF export ---
const GIF_W = 480;
const GIF_H = 360;

// Deterministic color per player name for avatar circles
const AVATAR_PALETTE = [
  "#e53935", "#d81b60", "#8e24aa", "#5e35b1",
  "#1e88e5", "#00897b", "#43a047", "#fb8c00",
  "#f4511e", "#6d4c41",
];

function playerAvatarColor(name) {
  let h = 0;
  for (const c of name) h = ((h * 31) + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function drawUMLogo(ctx, cx, cy, r, img) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.93)";
    ctx.fill();
    ctx.fillStyle = "#1a1a2a";
    ctx.font = `bold ${Math.round(r * 0.72)}px RobotoSlab, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("UM", cx, cy + 1);
  }
  ctx.restore();
}

function drawAvatarCircle(ctx, cx, cy, r, name) {
  ctx.fillStyle = playerAvatarColor(name);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(r)}px RobotoSlab, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((name[0] || "?").toUpperCase(), cx, cy + 1);
}

function gifDrawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function gifWrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  let startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (const l of lines) {
    ctx.fillText(l, x, startY);
    startY += lineHeight;
  }
}

function renderStepToCanvas(step, stepIndex, totalSteps, faviconImg = null) {
  const canvas = document.createElement("canvas");
  canvas.width = GIF_W;
  canvas.height = GIF_H;
  const ctx = canvas.getContext("2d");

  const AV_R = 24;
  const AV_CY = GIF_H / 2;
  const isDrawPhase = step.phase === "draw";
  // text/guess → avatar LEFT; draw → avatar RIGHT
  const AV_CX = isDrawPhase ? GIF_W - 38 : 38;
  const NAME_MAX_W = 68;

  // Background gradient + dot pattern
  const bgColors = isDrawPhase
    ? ["#37003c", "#6a1b9a"]
    : step.phase === "write"
      ? ["#0d47a1", "#1565c0"]
      : ["#1b5e20", "#2e7d32"];
  const bgGrad = ctx.createLinearGradient(0, 0, 0, GIF_H);
  bgGrad.addColorStop(0, bgColors[0]);
  bgGrad.addColorStop(1, bgColors[1]);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, GIF_W, GIF_H);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let px = 20; px < GIF_W; px += 28) {
    for (let py = 20; py < GIF_H; py += 28) {
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Avatar + player name
  drawAvatarCircle(ctx, AV_CX, AV_CY, AV_R, step.player);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "10px RobotoSlab, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(step.player, AV_CX, AV_CY + AV_R + 5, NAME_MAX_W);

  // Bubble geometry
  const COL_W = AV_R * 2 + 28;
  const BX = isDrawPhase ? 10 : COL_W;
  const BW = GIF_W - COL_W - 10;
  const BY = 14, BH = GIF_H - 28, BR = 16;

  // Shadow + bubble body
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  gifDrawRoundRect(ctx, BX + 2, BY + 3, BW, BH, BR);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  gifDrawRoundRect(ctx, BX, BY, BW, BH, BR);
  ctx.fill();

  // Bubble tail toward avatar
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  if (isDrawPhase) {
    ctx.moveTo(BX + BW + 9, AV_CY);
    ctx.lineTo(BX + BW - 1, AV_CY - 9);
    ctx.lineTo(BX + BW - 1, AV_CY + 9);
  } else {
    ctx.moveTo(BX - 9, AV_CY);
    ctx.lineTo(BX + 1, AV_CY - 9);
    ctx.lineTo(BX + 1, AV_CY + 9);
  }
  ctx.closePath();
  ctx.fill();

  if (isDrawPhase) {
    const DX = BX + 10, DY = BY + 10;
    const DW = BW - 20, DH = BH - 20;
    const scale = Math.min(DW / 800, DH / 600);
    const scaledW = Math.ceil(800 * scale);
    const scaledH = Math.ceil(600 * scale);

    const off = document.createElement("canvas");
    off.width = scaledW;
    off.height = scaledH;
    const oCtx = off.getContext("2d");
    oCtx.fillStyle = "#ffffff";
    oCtx.fillRect(0, 0, scaledW, scaledH);

    for (const stroke of step.strokes || []) {
      if (!stroke.points?.length) continue;
      oCtx.lineCap = "round";
      oCtx.lineJoin = "round";
      oCtx.lineWidth = stroke.size * scale;
      if (stroke.mode === "erase") {
        oCtx.globalCompositeOperation = "destination-out";
        oCtx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        oCtx.globalCompositeOperation = "source-over";
        oCtx.strokeStyle = stroke.color;
      }
      oCtx.beginPath();
      oCtx.moveTo(stroke.points[0][0] * scale, stroke.points[0][1] * scale);
      for (let i = 1; i < stroke.points.length; i++) {
        oCtx.lineTo(stroke.points[i][0] * scale, stroke.points[i][1] * scale);
      }
      oCtx.stroke();
    }
    oCtx.globalCompositeOperation = "source-over";
    ctx.drawImage(off, DX + (DW - scaledW) / 2, DY + (DH - scaledH) / 2);
  } else {
    const content = step.content || "";
    let fontSize = 22;
    if (content.length > 40) fontSize = 18;
    if (content.length > 70) fontSize = 15;
    if (content.length > 100) fontSize = 13;
    ctx.fillStyle = "#1a1a2a";
    ctx.font = `bold ${fontSize}px RobotoSlab, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    gifWrapText(ctx, content, BX + BW / 2, BY + BH / 2 + 10, BW - 28, fontSize + 8);
  }

  // Step counter — bottom corner away from avatar
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "10px RobotoSlab, serif";
  ctx.textBaseline = "bottom";
  if (isDrawPhase) {
    ctx.textAlign = "left";
    ctx.fillText(`${stepIndex + 1} / ${totalSteps}`, 8, GIF_H - 4);
  } else {
    ctx.textAlign = "right";
    ctx.fillText(`${stepIndex + 1} / ${totalSteps}`, GIF_W - 8, GIF_H - 4);
  }

  // UM logo — centered in the avatar column, at the top
  const LOGO_R = 14;
  drawUMLogo(ctx, AV_CX, LOGO_R + 6, LOGO_R, faviconImg);

  return canvas;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function exportChainAsGif(chain, gameId) {
  await document.fonts.ready;
  const [GIFLib, faviconImg] = await Promise.all([
    (await import("gif.js")).default,
    loadImage("/images/favicon.png"),
  ]);

  const gif = new GIFLib({
    workers: 2,
    quality: 10,
    workerScript: "/javascript/gif.worker.js",
    width: GIF_W,
    height: GIF_H,
  });

  const total = chain.history.length;
  for (let i = 0; i < total; i++) {
    const step = chain.history[i];
    const delay = step.phase === "draw" ? 3200 : 2600;
    gif.addFrame(renderStepToCanvas(step, i, total, faviconImg), { delay, copy: true });
  }

  const gameTag = gameId ? `-${gameId}` : "";
  return new Promise((resolve, reject) => {
    gif.on("finished", (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `telephone-${chain.startPlayer}${gameTag}.gif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve();
    });
    gif.on("error", reject);
    gif.render();
  });
}

// --- Postgame chain viewer ---
const TEXT_GRADIENT = "linear-gradient(135deg, #0d47a1, #1565c0)";
const DRAW_GRADIENT = "linear-gradient(90deg, #4527a0, #7b1fa2)";
const PHASE_META = {
  draw:  { gradient: DRAW_GRADIENT,  bgColor: "#e8e8e8" },
  write: { gradient: TEXT_GRADIENT,  bgColor: "#0d47a1" },
  guess: { gradient: TEXT_GRADIENT,  bgColor: "#0d47a1" },
};



function PlayerAvatar({ name, playersByName, size = 44 }) {
  const player = playersByName?.[name];
  const hasImage = player?.avatar;
  const userId = player?.userId;
  const fontSize = size <= 26 ? "0.75rem" : "1.1rem";

  return (
    <Box sx={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      bgcolor: hasImage ? "transparent" : playerAvatarColor(name),
      backgroundImage: hasImage && userId ? `url(/uploads/${userId}_avatar.webp)` : undefined,
      backgroundSize: "cover", backgroundPosition: "center",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {!hasImage && (
        <Typography sx={{ color: "white", fontWeight: "bold", fontSize, lineHeight: 1 }}>
          {(name[0] || "?").toUpperCase()}
        </Typography>
      )}
    </Box>
  );
}

function PostgameChainViewer({ chains, gameId, playersByName }) {
  const [activeChain, setActiveChain] = useState(0);
  if (!chains?.length) return null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {/* Chain selector buttons */}
      <Box sx={{ p: 1, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
          {chains.map((c, i) => (
            <Button
              key={i}
              variant={i === activeChain ? "contained" : "outlined"}
              size="small"
              onClick={() => setActiveChain(i)}
              sx={{ borderRadius: 4, textTransform: "none" }}
            >
              {c.startPlayer}
            </Button>
          ))}
        </Stack>
      </Box>

      {/* Active chain — scrolls within this box, never expands the page */}
      <Box sx={{ overflowY: "auto", maxHeight: "calc(100vh - 160px)", p: 1.5 }}>
        <ChainSection key={activeChain} chain={chains[activeChain]} gameId={gameId} playersByName={playersByName} />
      </Box>
    </Box>
  );
}

function ChainSection({ chain, gameId, playersByName }) {
  const [exporting, setExporting] = useState(false);

  const handleExportGif = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try { await exportChainAsGif(chain, gameId); }
    finally { setExporting(false); }
  }, [chain, exporting, gameId]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1" fontWeight="bold">
          {chain.startPlayer}'s album
        </Typography>
        <Button variant="outlined" size="small" disabled={exporting} onClick={handleExportGif}>
          {exporting ? "Exporting..." : "Export GIF"}
        </Button>
      </Stack>

      {chain.history.map((step, i) => {
        const meta = PHASE_META[step.phase] || PHASE_META.guess;
        return (
          <Paper key={i} elevation={4} sx={{ overflow: "hidden", borderRadius: 2 }}>
            {step.phase === "draw" ? (
              <Box sx={{
                background: meta.gradient, p: 2,
                display: "flex", flexDirection: "row", alignItems: "center", gap: 1.5,
              }}>
                {/* Bubble on the left */}
                <Box sx={{ position: "relative", flex: 1 }}>
                  <Paper elevation={2} sx={{ borderRadius: 3, p: 1.5, position: "relative", zIndex: 2 }}>
                    <div className="draw-canvas-wrap" style={{ width: "100%" }}>
                      <DrawCanvas mode="viewer" initialStrokes={step.strokes || []} socket={null} />
                    </div>
                  </Paper>
                  {/* Rotated square tail pointing right toward avatar */}
                  <Box sx={{
                    position: "absolute", right: -6, top: "50%",
                    transform: "translateY(-50%) rotate(45deg)",
                    width: 12, height: 12,
                    bgcolor: "background.paper",
                    zIndex: 1,
                  }} />
                </Box>
                {/* Avatar on the right */}
                <Stack alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
                  <PlayerAvatar name={step.player} playersByName={playersByName} />
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.65rem", textAlign: "center", maxWidth: 52, wordBreak: "break-word" }}>
                    {step.player}
                  </Typography>
                </Stack>
              </Box>
            ) : (
              <Box sx={{
                background: meta.gradient, p: 2,
                display: "flex", flexDirection: "row", alignItems: "center", gap: 1.5,
              }}>
                <Stack alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
                  <PlayerAvatar name={step.player} playersByName={playersByName} />
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.65rem", textAlign: "center", maxWidth: 52, wordBreak: "break-word" }}>
                    {step.player}
                  </Typography>
                </Stack>
                <Box sx={{ position: "relative", flex: 1 }}>
                  {/* Rotated square tail — inherits paper bg so it always matches */}
                  <Box sx={{
                    position: "absolute", left: -6, top: "50%",
                    transform: "translateY(-50%) rotate(45deg)",
                    width: 12, height: 12,
                    bgcolor: "background.paper",
                    zIndex: 1,
                  }} />
                  <Paper elevation={2} sx={{ borderRadius: 3, p: 2.5, position: "relative", zIndex: 2 }}>
                    <Typography variant="h4" fontWeight="bold" sx={{ lineHeight: 1.35, fontFamily: "RobotoSlab, serif" }}>
                      {step.content}
                    </Typography>
                  </Paper>
                </Box>
              </Box>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}
