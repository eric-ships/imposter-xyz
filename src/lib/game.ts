export type RoomState = "lobby" | "playing" | "voting" | "reveal";

export type Player = {
  id: string;
  nickname: string;
  score: number;
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
  players: Player[];
  clues: Clue[];
  votes: Vote[];
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
  } | null;
};
