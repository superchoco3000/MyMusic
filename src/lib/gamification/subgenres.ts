/**
 * subgenres.ts — Diccionario de Subgéneros Enriquecidos y Motor de Smart Naming
 * ==============================================================================
 * Proporciona:
 * 1. Detección de macro-género a partir del nombre de la playlist.
 * 2. Catálogo de 10 subgéneros con sus sub-subgéneros (includes) por macro-género.
 * 3. Generación de 5 propuestas de nombre (3 Pro, 1 Híbrido, 1 Fantasioso/Lore).
 */

export interface SubgenreItem {
  id: string;
  name: string;
  includes: string;
}

export type MacroGenre = "dnb" | "electronica" | "rock" | "urbano" | "chill";

/**
 * Detects the macro-genre based on keywords in playlist.name.toLowerCase()
 */
export function detectMacroGenre(name: string): MacroGenre {
  const n = name.toLowerCase();

  // 1. DnB / Jungle / Breakbeat / Bass
  if (n.includes("dnb") || n.includes("drum") || n.includes("jungle") || n.includes("bass") || n.includes("breakbeat") || n.includes("neuro")) {
    return "dnb";
  }

  // 2. Electrónica / House / Techno / Dance / Rave / Trance
  if (n.includes("house") || n.includes("techno") || n.includes("dance") || n.includes("rave") || n.includes("electro") || n.includes("club") || n.includes("trance") || n.includes("edm") || n.includes("acid")) {
    return "electronica";
  }

  // 3. Rock / Metal / Punk / Indie / Grunge / Guitar
  if (n.includes("rock") || n.includes("metal") || n.includes("punk") || n.includes("indie") || n.includes("grunge") || n.includes("guitar") || n.includes("band") || n.includes("heavy") || n.includes("hard")) {
    return "rock";
  }

  // 4. Urbano / Reggaeton / Trap / Hip-Hop / Rap / Funk / Latin / Perreo
  if (n.includes("reggaeton") || n.includes("funk") || n.includes("rfd") || n.includes("perreo") || n.includes("latin") || n.includes("trap") || n.includes("hip hop") || n.includes("hiphop") || n.includes("rap") || n.includes("urban") || n.includes("dembow")) {
    return "urbano";
  }

  // 5. Chill / Soul / Joyas / Jazz / Pop / Default
  return "chill";
}

/**
 * 10 Enriched Subgenres per Macro-Genre
 */
export const SUBGENRE_DICTIONARY: Record<MacroGenre, SubgenreItem[]> = {
  // ── 1. DnB & Bass (10 Subgenres) ────────────────────────────────────────────
  dnb: [
    { id: "liquid_dnb", name: "Liquid & Soulful DnB", includes: "Atmospheric, Vocal DnB, Jazz & Bass, Deep Rolling..." },
    { id: "neurofunk", name: "Neurofunk & Cyber Tech", includes: "Heavy Bass Design, Darkstep, Techstep, Modulated Reese..." },
    { id: "jump_up", name: "Jump Up & Festival Bass", includes: "High Energy Screeches, Rollers, Foghorn, Wobble..." },
    { id: "jungle_ragga", name: "Jungle & Ragga Drum", includes: "Amen Breaks, Dub Chords, Rastafari Toasters, Chopped Breaks..." },
    { id: "deep_minimal_dnb", name: "Deep & Minimal 174", includes: "Halftime, Micro-Funk, Skeptical Style, Sub-Heavy Clicks..." },
    { id: "dancefloor_dnb", name: "Dancefloor & Stadium DnB", includes: "Anthemic Vocals, Synth Drops, High Octane Melodies..." },
    { id: "breakcore_crossbreed", name: "Breakcore & Crossbreed", includes: "Hardcore Techno Kicks, Mashcore, Extreme Amen Splices..." },
    { id: "halftime_beats", name: "Halftime & Leftfield Bass", includes: "Slow 85 BPM Tempo, Glitch-Hop, Experimental Dubstep Drops..." },
    { id: "autonomic_ambient", name: "Autonomic & Ambient DnB", includes: "Grey Area, 80s Synthwaves, Dub Ambient Textures..." },
    { id: "drumstep_bass", name: "Drumstep & Hybrid Bass", includes: "Half-time Half-speed, Heavy Wobbles, Aggressive Drops..." },
  ],

  // ── 2. Electrónica & Rave (10 Subgenres) ────────────────────────────────────
  electronica: [
    { id: "tech_house", name: "Tech House & Groove Club", includes: "Rolling Basslines, Percussive Grooves, Latin Tech, Vocal Chops..." },
    { id: "peak_techno", name: "Peak-Time & Raw Techno", includes: "Industrial Kicks, Dark Acid 303, Driving 135+ BPM, Hypnotic Loops..." },
    { id: "melodic_house", name: "Melodic House & Techno", includes: "Progressive Chords, Emotional Synths, Organic House, Tale Of Us Style..." },
    { id: "french_electro", name: "Electro & French Touch", includes: "Distorted Bass, Funky Filters, Cyberpunk Arpeggios, Justice Style..." },
    { id: "deep_house_classic", name: "Deep House & Classic Garage", includes: "Rhodes Chords, UK Garage 2-Step, Soulful Vocals, Silky Bass..." },
    { id: "psytrance_goatrance", name: "Psytrance & Goa Energy", includes: "Rolling Bass Triplet, Cosmic FX, Forest Psy, 140+ BPM Energy..." },
    { id: "bass_house", name: "Bass House & G-House", includes: "Metallic Lead Synths, Low End Grime, UK Basslines, Hard Drops..." },
    { id: "synthwave_cyber", name: "Synthwave & Darksynth", includes: "80s Retrowave, Outrun, Carpenter Synth Bass, Cyber Highway..." },
    { id: "hard_dance", name: "Hard Techno & Neo-Rave", includes: "Schranz, Gabber Elements, Industrial Screams, Fast BPM..." },
    { id: "ambient_electronica", name: "IDM & Ambient Electronica", includes: "Glitch Textures, Aphex Twin Vibes, Downtempo, Intelligent Beats..." },
  ],

  // ── 3. Rock & Alternative (10 Subgenres) ────────────────────────────────────
  rock: [
    { id: "rapmetal", name: "Rapmetal & Nu Metal", includes: "Crossover, Funk Metal, Industrial Riffs, 90s/00s Aggressive Vocals..." },
    { id: "grunge_alternative", name: "Grunge & 90s Alternative", includes: "Seattle Sound, Distorted Guitars, Raw Melodic Vocals, Melancholy..." },
    { id: "indie_postpunk", name: "Indie Rock & Post-Punk Revival", includes: "Jangle Guitars, Motorik Beats, Garage Rock, Angular Basslines..." },
    { id: "hard_rock_classic", name: "Classic & Hard Rock Anthems", includes: "70s/80s Guitar Solos, Power Chords, Blues Rock, Heavy Arena..." },
    { id: "pop_punk_emo", name: "Pop-Punk & Emo 2000s", includes: "Fast Tempo, Palm Mutes, Hooky Chorus, Skate Punk, Midwest Emo..." },
    { id: "metalcore_modern", name: "Modern Metalcore & Djent", includes: "Heavy Breakdowns, Polymetric Chugs, Clean/Harsh Vocals, Drop-A Tuning..." },
    { id: "stoner_desert_rock", name: "Stoner & Desert Psych Rock", includes: "Fuzz Pedals, Low-tuned Sludge, Groovy Psychedelic Jams..." },
    { id: "shoegaze_dreampop", name: "Shoegaze & Dream Pop", includes: "Walls of Sound, Reverb Drench, Ethereal Whispers, Sonic Youth Style..." },
    { id: "prog_art_rock", name: "Progressive & Art Rock", includes: "Time Signature Changes, Complex Soloing, Concept Themes, Atmospheric Keyboards..." },
    { id: "blues_southern_rock", name: "Southern & Blues Rock", includes: "Slide Guitar, Organ Solos, Soulful Vocals, Swamp Boogie..." },
  ],

  // ── 4. Urbano & Latin (10 Subgenres) ────────────────────────────────────────
  urbano: [
    { id: "reggaeton_viejo", name: "Reggaeton Clásico & Perreo 2000s", includes: "Dembow Puro, Marquesina, Playero, Luny Tunes Style, Old School..." },
    { id: "trap_latino", name: "Trap Latino & Dark Drill", includes: "808 Bass Sub, Fast Hi-Hats, Melodic Flow, Raw Street Lyrics..." },
    { id: "funk_carioca", name: "Funk Carioca & Baile Funk", includes: "Tamborzão Beat, Favela Bass, Vocal Chants, 130 BPM Bounce..." },
    { id: "neoperreo_hybrid", name: "Neoperreo & Cyber Dembow", includes: "Industrial Drums, Rave Synths, Experimental Latin Bass, Hyper-Reggaeton..." },
    { id: "afrobeats_dancehall", name: "Dancehall & Afro-Fusion", includes: "Jamaican Riddims, West African Grooves, Smooth Brass, Island Flow..." },
    { id: "boombap_classic", name: "Boom Bap & 90s Golden Hip-Hop", includes: "Vinyl Sample Chops, SP1200 Drums, Lyrical Flow, Jazz Rap..." },
    { id: "rnb_latino_sensual", name: "R&B Latino & Trap Soul", includes: "Slow Grooves, Sensual Melodies, Vocoder Chords, Night Drives..." },
    { id: "drill_uk_ny", name: "UK & NY Drill", includes: "Sliding 808s, Dark Piano Melodies, Counter-Rhythms, Grime Influence..." },
    { id: "mambo_urbano", name: "Mambo Urbano & Merengue Flow", includes: "Fast Brass, Dominican Riddims, High BPM Party Grooves..." },
    { id: "cumbia_electronica", name: "Cumbia Digital & Tropical Bass", includes: "Accordion Loops, Guacharaca + Sub-bass, Latin Electronic Fusion..." },
  ],

  // ── 5. Chill, Soul, Joyas & Pop (10 Subgenres) ──────────────────────────────
  chill: [
    { id: "lofi_hiphop", name: "Lofi Hip-Hop & Study Beats", includes: "Dusty Vinyl Cracks, Mellow Rhodes, Nostalgic Anime Samples, Chill Loops..." },
    { id: "neo_soul_groove", name: "Neo-Soul & Modern R&B", includes: "Laidback Pocket Drumming, Jazzy Extended Chords, Silk Vocals..." },
    { id: "sunset_nudisco", name: "Nu-Disco & Sunset House", includes: "Funky Basslines, Slap Bass, Glitter Synths, Poolside Grooves..." },
    { id: "acoustic_coffee", name: "Acoustic & Indie Folk", includes: "Warm Fingerpicking Guitar, Soft Harmonies, Intimate Vocals, Wood & Strings..." },
    { id: "ambient_drone", name: "Pure Ambient & Space Drone", includes: "Zero Beat, Infinite Reverb Pads, Meditation Textures, Sleep Soundscapes..." },
    { id: "city_pop_retro", name: "Japanese City Pop & 80s Funk", includes: "Vintage Brass, Slap Bass, Sophisticated J-Pop, Retro Night Drives..." },
    { id: "chillstep_future", name: "Chillstep & Melodic Bass", includes: "Slow Emotional Wobbles, Female Vocals, Echo Piano, Atmospheric Drops..." },
    { id: "bossa_jazz_lounge", name: "Bossa Nova & Lounge Jazz", includes: "Nylon Guitars, Subtle Brushes, Cocktail Bar Chords, Relaxed Mood..." },
    { id: "dreamy_pop_gems", name: "Dream Pop & Soulful Gems", includes: "Sparkling Arps, Heartfelt Hooks, Indie Anthems, Healing Frequencies..." },
    { id: "cinematic_piano", name: "Cinematic Neo-Classical", includes: "Grand Piano, Solitary Cello, Film Score Melodies, Emotional Crescendos..." },
  ],
};

/**
 * Generates 5 Smart Naming Proposals:
 * - 3 Pro Names (pure style / clean standard)
 * - 1 Hybrid Name (original title + style)
 * - 1 Fantasioso / Lore Name (treats original title as code / anomaly / secret project)
 */
export function generateSmartNamingProposals(
  originalName: string,
  macroGenre: MacroGenre
): string[] {
  const cleanOriginal = originalName.trim();

  // Style Pro Templates
  const proTemplates: Record<MacroGenre, [string, string, string]> = {
    dnb: ["Drum & Bass: 174 Rolling Anthems", "Liquid & Deep Bass Sanctuary", "Sub-Low Frequency Vault"],
    electronica: ["Club Essentials: Cyber Rave Archive", "Tech & Melodic Grooves", "Nightfall Electronic Spectrum"],
    rock: ["Rock Essentials: Overdrive Anthems", "Alternative & Hard Riff Vault", "Pure Grunge & Heavy Grooves"],
    urbano: ["Perreo & Urbano Gold Edition", "Dembow & Trap Latino Heat", "Rhythm & Urban Underground"],
    chill: ["Chill & Soulful Gems Collection", "Healing Frequencies & Velvet Moods", "Sunset Resonance & Lofi Haven"],
  };

  // Hybrid Templates
  const hybridTemplates: Record<MacroGenre, string> = {
    dnb: `${cleanOriginal}: Bassline Selection`,
    electronica: `${cleanOriginal}: Club Anthems`,
    rock: `${cleanOriginal}: Rock & Alternative`,
    urbano: `${cleanOriginal}: Urbano & Dembow`,
    chill: `${cleanOriginal}: Joyas & Chill Moods`,
  };

  // Lore / Fantasy Templates
  const loreTemplates: Record<MacroGenre, string> = {
    dnb: `Anomalía [${cleanOriginal}]: Resonancia 174 BPM`,
    electronica: `El Proyecto ${cleanOriginal}: Frecuencias de Club`,
    rock: `El Archivo ${cleanOriginal}: Crónicas de Overdrive`,
    urbano: `Protocolo [${cleanOriginal}]: Ondas de Calle`,
    chill: `Anomalía [${cleanOriginal}]: Frecuencias de Curación`,
  };

  const pro = proTemplates[macroGenre] || proTemplates.chill;
  const hybrid = hybridTemplates[macroGenre] || `${cleanOriginal}: Colección Pro`;
  const lore = loreTemplates[macroGenre] || `Anomalía [${cleanOriginal}]: Archivo Reservado`;

  return [pro[0], pro[1], pro[2], hybrid, lore];
}
