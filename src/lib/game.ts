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
    secretWord: string | null; // null if imposter
  } | null;
  // Only populated during reveal:
  reveal: {
    imposterId: string;
    secretWord: string;
    caught: boolean;
    guess: string | null;
    guessOutcome: GuessOutcome | null;
  } | null;
};
