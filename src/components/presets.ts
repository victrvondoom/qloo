import type { BriefInput } from "@/lib/types";

// Two clients who use exactly the same words. The demo's whole point is that
// the words don't tell you which room to build; what they love does.
export const PRESETS: { key: string; title: string; blurb: string; input: BriefInput }[] = [
  {
    key: "maya",
    title: "Maya",
    blurb: "Says “warm, modern”. Loves Khruangbin, The Bear, Wes Anderson.",
    input: {
      clientLabel: "Maya",
      trade: "lighting",
      room: "living_room",
      city: "Chicago",
      words: ["warm", "modern"],
      loves: ["Khruangbin", "The Bear (show)", "Wes Anderson (director)", "Ace Hotel (hotel)", "Norah Jones"],
    },
  },
  {
    key: "jordan",
    title: "Jordan",
    blurb: "Also says “warm, modern”. Loves Fred again.., Severance, MUJI.",
    input: {
      clientLabel: "Jordan",
      trade: "lighting",
      room: "living_room",
      city: "Chicago",
      words: ["warm", "modern"],
      loves: ["Fred again..", "Severance (show)", "MUJI (brand)", "Blue Bottle Coffee (brand)", "Kendrick Lamar"],
    },
  },
  {
    key: "resto",
    title: "A new restaurant",
    blurb: "Owner wants it “cozy but lively”. Finishes for the dining room.",
    input: {
      clientLabel: "Owner, Calle Ocho",
      trade: "finishes",
      room: "restaurant",
      city: "Austin",
      words: ["cozy", "lively"],
      loves: ["Buena Vista Social Club (band)", "Chef's Table (show)", "Anthony Bourdain", "Frida Kahlo", "Bad Bunny"],
    },
  },
];
