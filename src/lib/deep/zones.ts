// Room templates for the deep brief: the zones a designer plans light (or
// surfaces) around, with practical rules of thumb. These are general design
// guidance, labelled "rule of thumb" wherever they appear; the spec lines
// (evidence-driven) decide character, colour temperature and control.

import type { RoomType } from "../types";

export type ZoneRole = "ambient" | "task" | "accent" | "decorative" | "night";

export interface ZoneTemplate {
  name: string;
  role: ZoneRole;
  purpose: string;
  /** Room-specific practical guidance (rule of thumb), independent of taste. */
  guidance: string;
}

export const ROOM_ZONES: Record<RoomType, ZoneTemplate[]> = {
  living_room: [
    { name: "Seating group", role: "decorative", purpose: "Where people talk; faces should glow, not squint.", guidance: "Lamp shade bottoms at seated eye level, about 97–107 cm (38–42 in) from the floor, so nobody sees a bare source." },
    { name: "Reading chair", role: "task", purpose: "Light on the page, not in the eyes.", guidance: "Floor or swing-arm lamp over the shoulder, beside and slightly behind the reader." },
    { name: "Art and shelving wall", role: "accent", purpose: "Gives the room depth after dark.", guidance: "Aim accent light about 30° from vertical to avoid reflections in glazed art." },
    { name: "Ceiling and circulation", role: "ambient", purpose: "Lets people move safely without flattening the room.", guidance: "Keep general light on its own channel so it can drop to near-off in the evening scenes." },
  ],
  dining_room: [
    { name: "Over the table", role: "decorative", purpose: "The table is the stage; the light belongs to it.", guidance: "Centre the pendant or linear on the table, bottom about 71–86 cm (28–34 in) above the top, roughly half to two-thirds the table's width." },
    { name: "Walls and sideboard", role: "accent", purpose: "Stops the room going black beyond the table.", guidance: "Light one wall or the sideboard so the table isn't a lit island in a dark box." },
    { name: "Perimeter", role: "ambient", purpose: "Background for arriving and clearing.", guidance: "Separate channel from the table light; it should dim lower than the table." },
  ],
  kitchen: [
    { name: "Worktops", role: "task", purpose: "Shadow-free light where knives are.", guidance: "Continuous under-cabinet linear light, set to the front of the cabinet so wall units don't shadow the worktop." },
    { name: "Island or table", role: "decorative", purpose: "The social centre of the kitchen.", guidance: "Pendant bottoms about 76–91 cm (30–36 in) above the counter; space two or three evenly along the island." },
    { name: "General", role: "ambient", purpose: "Cleaning and circulation.", guidance: "Downlights over the walkway, not over the worktop edge where your head casts a shadow." },
    { name: "Open shelving and display", role: "accent", purpose: "Makes the kitchen feel lived-in at night.", guidance: "Low-output linear in the shelf front or underside, on its own channel for evening scenes." },
  ],
  bedroom: [
    { name: "Bedside", role: "task", purpose: "Reading without waking a partner.", guidance: "Wall-mounted or bedside reading lights with a shielded, focused beam, switchable from the bed." },
    { name: "General", role: "ambient", purpose: "Making the bed, finding things.", guidance: "Soft, indirect general light; avoid a downlight directly over the pillows." },
    { name: "Wardrobe and dressing", role: "task", purpose: "Clothes in their true colours.", guidance: "Light the front of the wardrobe or mirror from the front and sides, not from directly overhead." },
    { name: "Night path", role: "night", purpose: "Getting up without a jolt of light.", guidance: "Low-level, motion-triggered, very warm (amber) path light toward the door or bathroom." },
  ],
  home_office: [
    { name: "Desk", role: "task", purpose: "Even light on paper; nothing reflecting in the screen.", guidance: "Adjustable task lamp on the side opposite your writing hand; keep downlight beams out of the screen's reflection." },
    { name: "Video-call face light", role: "task", purpose: "Look like yourself on camera.", guidance: "Soft, diffuse light from in front of you, at or just above eye level; never only from behind." },
    { name: "Background and shelves", role: "accent", purpose: "Depth behind you so you aren't a silhouette.", guidance: "Low-level light on the wall or shelves behind the desk." },
    { name: "General", role: "ambient", purpose: "Background light so the eyes aren't jumping between bright desk and dark room.", guidance: "Indirect or well-shielded general light on its own channel." },
  ],
  bathroom: [
    { name: "Mirror and vanity", role: "task", purpose: "Shadow-free light on the face.", guidance: "Vertical diffused light on both sides of the mirror at face height; a single downlight above the mirror casts shadows under the eyes." },
    { name: "Shower or bath", role: "ambient", purpose: "Safe, relaxing light in the wet zone.", guidance: "Wet-location rated fittings with the ingress protection your local code requires for each zone." },
    { name: "General", role: "ambient", purpose: "Cleaning and dressing.", guidance: "Separate from the mirror light so mornings can be bright and evenings soft." },
    { name: "Night light", role: "night", purpose: "Night visits without full light.", guidance: "Low-level amber light, motion-triggered or on a separate switch." },
  ],
  restaurant: [
    { name: "Tables", role: "decorative", purpose: "Food and faces look their best; the room recedes.", guidance: "Each table gets its own pool of light; faces lit softly from the table, not hard from above." },
    { name: "Walls and banquettes", role: "accent", purpose: "Depth and a sense of enclosure.", guidance: "Light vertical surfaces so the room doesn't feel like a black void beyond the tables." },
    { name: "Bar or pass", role: "task", purpose: "Staff can work quickly without lighting the dining room.", guidance: "Shielded task light aimed onto the work surface only." },
    { name: "Entry and host stand", role: "ambient", purpose: "Guests know where to go.", guidance: "The brightest point at the door, stepping down into the room." },
    { name: "Facade and signage", role: "decorative", purpose: "Recognisable from the street at night.", guidance: "Warm, glare-free light on the facade; check local signage rules." },
  ],
  bar: [
    { name: "Bar top", role: "task", purpose: "Bartenders see; guests glow.", guidance: "Shielded downlights or a linear under the canopy onto the bar top; nothing shining into guests' eyes." },
    { name: "Back bar", role: "accent", purpose: "The bottles are the décor.", guidance: "Light shelves from inside or below so bottles glow; keep it the brightest surface in the room." },
    { name: "Booths and tables", role: "decorative", purpose: "Private pools of light.", guidance: "Low table lamps or tight downlights per booth, individually dimmable." },
    { name: "Circulation", role: "ambient", purpose: "Safe routes to the door and restrooms.", guidance: "Low-level step and route light; avoid lighting the whole floor." },
  ],
  retail: [
    { name: "Window", role: "accent", purpose: "Stops people on the street.", guidance: "Brighter than the street by day and by night; adjustable heads so displays can change." },
    { name: "Feature displays", role: "accent", purpose: "Leads the eye to the hero product.", guidance: "Accent at three to five times the ambient level on feature displays." },
    { name: "Wall merchandising", role: "ambient", purpose: "Makes the whole range visible.", guidance: "Light the walls evenly; bright walls make a store feel larger and full." },
    { name: "Fitting rooms", role: "task", purpose: "Customers like what they see.", guidance: "Front and side light at face height with high colour rendering; never a single downlight overhead." },
    { name: "Cash wrap", role: "task", purpose: "Fast, accurate transactions.", guidance: "Shielded task light on the counter, glare-free for screens." },
  ],
};

/** Surfaces the finishes trade plans around. */
export const SURFACES = ["Walls", "Ceiling", "Trim and joinery", "Floor", "Textiles", "Metalwork"] as const;
