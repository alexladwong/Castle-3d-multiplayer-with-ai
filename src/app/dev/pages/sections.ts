// src/app/dev/pages/sections.ts  [U4]
// Plain module (deliberately NOT "use client"): the server page reads these
// values, and every export of a client module is a reference proxy on the
// server, not the value itself.
export const SECTION_IDS = ["play", "leaderboard", "profile", "settings"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
