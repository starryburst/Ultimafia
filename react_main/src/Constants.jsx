export const GameTypes = [
  "Mafia",
  "Split Decision",
  "Resistance",
  "One Night",
  "Ghost",
  "Acrotopia",
];
export const Lobbies = ["Mafia", "Competitive", "Games"];

export const Alignments = {
  Mafia: ["Village", "Mafia", "Cult", "Independent"],
  "Split Decision": ["Blue", "Red", "Independent"],
  Resistance: ["Resistance", "Spies"],
  "One Night": ["Village", "Werewolves", "Independent"],
  Ghost: ["Town", "Ghost", "Host"],
  Acrotopia: ["Town"],
};

export const GameStates = {
  Mafia: ["Day", "Night"],
  "Split Decision": ["Initial Round", "Hostage Swap"],
  Resistance: ["Team Selection", "Team Approval", "Mission"],
  "One Night": ["Day", "Night"],
  Ghost: ["Night", "Give Clue", "Day", "Guess Word"],
  Acrotopia: ["Day", "Night"],
};

export const RatingThresholds = {
  wins: {},
  losses: {},
  abandons: {},
};

export const RequiredTotalForStats = 1;

export const MaxGameMessageLength = 240;
export const MaxTextInputLength = 100;
export const MaxWillLength = 100;

export const MaxGroupNameLength = 20;
export const MaxCategoryNameLength = 20;
export const MaxBoardNameLength = 20;
export const MaxBoardDescLength = 60;
export const MaxThreadTitleLength = 50;
export const MaxThreadContentLength = 5000;
export const MaxReplyLength = 1000;

export const MaxChatMessageLength = 240;

export const AlertFadeTimeout = 3000;
export const AlertFadeDuration = 500;

// animal deck by ultimafia-bot ultimafia.com/deck/jWqL8KjS_
export const PreferredDeckId = "jWqL8KjS_";
