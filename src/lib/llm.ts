// Optional Claude calls. Tastespec's spec values never come from the model;
// Claude is used for three bounded jobs, each with a JSON schema:
//   1. the LLM-only baseline: pick spec values from the same menu, knowing the
//      client's words and loves but with no Qloo data (so it can be audited)
//   2. mapping a client word that isn't in the lexicon onto the 9 dimensions
//   3. a short client-facing note that may only restate supplied evidence
// Without ANTHROPIC_API_KEY all three are skipped and labelled as such.

import Anthropic from "@anthropic-ai/sdk";
import { DIMENSIONS } from "./dimensions";
import type { DimensionId } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function llmModel() {
  return MODEL;
}

let client: Anthropic | undefined;
function getClient() {
  client ??= new Anthropic({ maxRetries: 1, timeout: 45_000 });
  return client;
}

async function jsonCall<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens = 4000): Promise<T> {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: { type: "json_schema", schema } },
  });
  if (response.stop_reason === "refusal") throw new Error("model declined the request");
  if (response.stop_reason === "max_tokens") throw new Error("model output was truncated");
  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as T;
}

export async function llmBaselineSpec(args: {
  trade: string;
  room: string;
  words: string[];
  loves: string[];
  menu: Record<string, { category: string; values: string[] }>;
}): Promise<{ id: string; value: string }[]> {
  const properties: Record<string, unknown> = {};
  for (const [id, m] of Object.entries(args.menu)) properties[id] = { type: "string", enum: m.values };
  const schema = {
    type: "object",
    properties,
    required: Object.keys(args.menu),
    additionalProperties: false,
  };
  const menuText = Object.entries(args.menu)
    .map(([id, m]) => `${id} (${m.category}):\n${m.values.map((v) => `  - ${v}`).join("\n")}`)
    .join("\n\n");
  const out = await jsonCall<Record<string, string>>(
    "You are an experienced residential and hospitality designer. Choose one option per category for the client described. Use only what you are told about the client.",
    `Trade: ${args.trade}\nRoom: ${args.room}\nClient's own words: ${args.words.join(", ")}\nThings the client loves: ${args.loves.join("; ")}\n\nOptions:\n${menuText}`,
    schema,
  );
  return Object.keys(args.menu).map((id) => ({ id, value: out[id] }));
}

export async function llmMapWord(word: string): Promise<{ dimension: DimensionId; meaning: string; isDictionaryDefault: boolean }[]> {
  const ids = DIMENSIONS.map((d) => d.id);
  const schema = {
    type: "object",
    properties: {
      readings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension: { type: "string", enum: ids },
            meaning: { type: "string" },
            isDictionaryDefault: { type: "boolean" },
          },
          required: ["dimension", "meaning", "isDictionaryDefault"],
          additionalProperties: false,
        },
      },
    },
    required: ["readings"],
    additionalProperties: false,
  };
  const out = await jsonCall<{ readings: { dimension: DimensionId; meaning: string; isDictionaryDefault: boolean }[] }>(
    "You map a word a client used to describe how they want a room to feel onto atmosphere dimensions. Give 2-4 distinct plausible readings, at most one marked as the most common dictionary sense. Meanings are under 8 words.",
    `Word: "${word}"\nDimensions:\n${DIMENSIONS.map((d) => `- ${d.id}: ${d.label}`).join("\n")}`,
    schema,
    1500,
  );
  const readings = out.readings.filter((r) => ids.includes(r.dimension)).slice(0, 4);
  if (readings.length && !readings.some((r) => r.isDictionaryDefault)) readings[0].isDictionaryDefault = true;
  return readings;
}

export async function llmNarrative(facts: string): Promise<string> {
  const out = await jsonCall<{ note: string }>(
    "You write a short note from a designer to their client explaining the direction. Use ONLY the facts provided. Do not add venues, numbers, products or claims that are not in the facts. Plain, warm, under 110 words. No headings, no lists.",
    facts,
    {
      type: "object",
      properties: { note: { type: "string" } },
      required: ["note"],
      additionalProperties: false,
    },
    2000,
  );
  return out.note;
}
