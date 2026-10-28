// Example client messages for the composer. Maya and Jordan use exactly the
// same words; what they love is the only difference. That's the whole point.

export interface ExampleMessage {
  key: string;
  label: string;
  blurb: string;
  text: string;
}

export const EXAMPLES: ExampleMessage[] = [
  {
    key: "maya",
    label: "Maya",
    blurb: "“warm and modern” · Khruangbin, The Bear, Wes Anderson",
    text: "Hi! We just bought a place in Chicago and want the living room to feel warm and modern. We're obsessed with Khruangbin, The Bear (the show), anything Wes Anderson, and we always stay at the Ace Hotel. Norah Jones is always on.\n\nThanks,\nMaya",
  },
  {
    key: "jordan",
    label: "Jordan",
    blurb: "also “warm and modern” · Fred again.., Severance, MUJI",
    text: "Hey! For our Chicago living room we'd love it warm and modern. Big fans of Fred again.., Severance, MUJI and Blue Bottle Coffee, and Kendrick Lamar is on repeat.\n\nJordan",
  },
  {
    key: "sofia",
    label: "A restaurant",
    blurb: "“cozy but lively” · finishes for a dining room in Austin",
    text: "We're opening a restaurant in Austin and want the dining room cozy but lively. We love Buena Vista Social Club, Chef's Table, Anthony Bourdain, Frida Kahlo and Bad Bunny. We need help with paint, colours and materials.\n\n— Sofia, Calle Ocho",
  },
  {
    key: "ren",
    label: "A bedroom",
    blurb: "“calm and minimal” · Bon Iver, Studio Ghibli, Kinfolk",
    text: "Looking to redo my bedroom in London. I want it calm and minimal. I'm into Bon Iver, Studio Ghibli and Kinfolk magazine, and I love Aesop stores.\n\nRen",
  },
];
