export type RoomState =
  | "lobby"
  | "playing"
  | "voting"
  | "guessing"
  | "reveal";

export type GuessOutcome = "exact" | "close" | "wrong";

export type Player = {
  id: string;
  nickname: string;
  score: number;
  walletAddress: string | null;
  hasPermission: boolean; // has a live Base Account Spend Permission on file
  antePaid: boolean;
  anteTx: string | null;
};

export type PotInfo = {
  enabled: boolean;
  anteAmount: string; // base units, e.g. "1000000" for 1 USDC
  chainGameId: string | null;
  chainCreateTx: string | null;
  chainResolveTx: string | null;
  paidCount: number;
};

export type Payout = {
  wallet: string;
  amount: string;
  txHash: string;
  kind: "payout" | "refund";
};

export type Clue = {
  id: number;
  player_id: string;
  round: number;
  word: string;
};

export type Vote = {
  voter_id: string;
  target_id: string;
};

export type PublicRoomView = {
  code: string;
  hostId: string;
  state: RoomState;
  category: string | null;
  round: number;
  totalRounds: number;
  turnIndex: number;
  turnOrder: string[];
  phaseDeadline: string | null;
  // Id of the imposter the crew caught in the vote (the one who goes to
  // guess phase). Null until a plurality lands on an imposter.
  caughtImposterId: string | null;
  players: Player[];
  clues: Clue[];
  votes: Vote[];
  pot: PotInfo | null;
  payouts: Payout[];
  // Only populated for the requesting player:
  you: {
    id: string;
    isHost: boolean;
    isImposter: boolean;
    // True if the crew caught you in the vote and you're on the hook for
    // the final guess. Only meaningful during the guessing phase.
    isCaughtImposter: boolean;
    secretWord: string | null; // null if imposter
  } | null;
  // Only populated during reveal:
  reveal: {
    imposterIds: string[];
    secretWord: string;
    caught: boolean;
    caughtImposterId: string | null;
    guess: string | null;
    guessOutcome: GuessOutcome | null;
  } | null;
};
