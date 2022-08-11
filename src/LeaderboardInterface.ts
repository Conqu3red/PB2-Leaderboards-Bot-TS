import { Remote } from "./RemoteLeaderboardInterface";

export interface LevelLeaderboards {
    any: Leaderboard;
    unbroken: Leaderboard;
}

export interface Leaderboard {
    top1000: LeaderboardEntry[];
    top_history: OldestEntry[] | undefined;
    metadata: Remote.LeaderboardMetadata;
}

export interface LeaderboardEntry extends Remote.LeaderboardEntry {
    rank: number;
}

export interface OldestEntry extends LeaderboardEntry {
    time: string;
}

export interface WeeklyLevelInfo {
    id: string;
    title: string;
    week: number;
    payload: string;
    preview: string;
}