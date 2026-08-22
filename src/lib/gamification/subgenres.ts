/**
 * subgenres.ts — Diccionario de Subgéneros Enriquecidos, Asistente Jerárquico y Smart Naming
 * ===========================================================================================
 */

export interface SubgenreItem {
  id: string;
  name: string;
  includes: string;
}

export type MacroGenre =
  | "electronica"
  | "rock"
  | "pop"
  | "hiphop"
  | "urbano"
  | "chill"
  | "rnb"
  | "jazz_clasica"
  | "dnb";

export interface MacroGenreCategory {
  id: MacroGenre;
  name: string;
  icon: string;
  description: string;
  badgeColor: string;
  gradient: string;
  subgenres: SubgenreItem[]; // Exactly 6 curated subgenres
}

/**
 * 8 Macro-Categorías Principales con exactamente 6 subgéneros asociados cada una
 */
export const HIERARCHICAL_MACRO_GENRES: MacroGenreCategory[] = [
  {
    id: "electronica",
    name: "Electrónica & Club",
    icon: "⚡",
    description: "House, Techno, Melodic, Synthwave y ritmos de pista de baile.",
    badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-400/40",
    gradient: "from-cyan-500/20 via-blue-500/10 to-transparent",
    subgenres: [
      { id: "house_tech", name: "House & Tech House", includes: "Rolling Basslines, Groove Club, Vocal Chops, Latin Tech..." },
      { id: "techno_raw", name: "Techno & Industrial Peak", includes: "Dark Acid 303, Driving 135+ BPM, Hypnotic Loops..." },
      { id: "melodic_techno", name: "Melodic & Progressive House", includes: "Emotional Synths, Organic House, Tale Of Us Style..." },
      { id: "deep_garage", name: "Deep House & UK Garage", includes: "Rhodes Chords, 2-Step Grooves, Silky Basslines..." },
      { id: "synthwave_cyber", name: "Synthwave & Retrowave", includes: "80s Analog Synths, Outrun, Carpenter Basslines..." },
      { id: "hard_techno", name: "Hard Techno & Neo-Rave", includes: "Schranz, Industrial Screams, Fast 145+ BPM..." },
    ],
  },
  {
    id: "rock",
    name: "Rock & Alternativo",
    icon: "🎸",
    description: "Indie, Classic Rock, Grunge, Metal, Punk y guitarras con fuerza.",
    badgeColor: "bg-rose-500/20 text-rose-300 border-rose-400/40",
    gradient: "from-rose-500/20 via-amber-500/10 to-transparent",
    subgenres: [
      { id: "indie_postpunk", name: "Indie Rock & Post-Punk", includes: "Jangle Guitars, Motorik Beats, Garage Revival..." },
      { id: "classic_hard_rock", name: "Classic & Hard Rock Anthems", includes: "70s/80s Guitar Solos, Power Chords, Blues Arena..." },
      { id: "grunge_alt90s", name: "Grunge & 90s Alternative", includes: "Seattle Sound, Raw Distortions, Melancholy Vocals..." },
      { id: "pop_punk_emo", name: "Pop-Punk & 2000s Emo", includes: "Fast Tempo, Palm Mutes, Hooky Chorus, Skate Punk..." },
      { id: "metal_riffs", name: "Metalcore & Modern Djent", includes: "Heavy Breakdowns, Polymetric Chugs, Drop Tuning..." },
      { id: "shoegaze_dream", name: "Shoegaze & Dream Pop", includes: "Walls of Reverb, Ethereal Whispers, Sonic Soundscapes..." },
    ],
  },
  {
    id: "pop",
    name: "Pop & Contemporáneo",
    icon: "✨",
    description: "Synth-Pop, Indie Pop, Dance-Pop, Hyperpop y melodías pegadizas.",
    badgeColor: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-400/40",
    gradient: "from-fuchsia-500/20 via-pink-500/10 to-transparent",
    subgenres: [
      { id: "synth_pop80s", name: "Synth-Pop & 80s Revival", includes: "Vintage Linndrum, Shimmering Keys, Bright Hooks..." },
      { id: "indie_pop_folk", name: "Indie Pop & Singer-Songwriter", includes: "Acoustic Guitars, Intimate Vocals, Heartfelt Anthems..." },
      { id: "electro_dance_pop", name: "Electro-Pop & Dancefloor Pop", includes: "Bouncy Basslines, Club Hooks, Stems Vocales..." },
      { id: "hyperpop_future", name: "Hyperpop & Future Pop", includes: "Glitch FX, Metallic Snare, Pitch-Shifted Vocals..." },
      { id: "dream_pop_ethereal", name: "Dream Pop & Atmospheric Gems", includes: "Lush Reverbs, Soft Pads, Melodic Whispers..." },
      { id: "modern_chart_pop", name: "Contemporary Mainstream Pop", includes: "Clean 808s, Top-40 Production, Catchy Melodies..." },
    ],
  },
  {
    id: "hiphop",
    name: "Hip-Hop & Rap",
    icon: "🎤",
    description: "Trap, Boom Bap, Drill, Lo-Fi y líricas urbanas con peso.",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-400/40",
    gradient: "from-amber-500/20 via-orange-500/10 to-transparent",
    subgenres: [
      { id: "trap_808", name: "Trap & 808 Hard Bass", includes: "Sub-Bass Sliders, Fast Hi-Hat Rolls, Dark Leads..." },
      { id: "boombap_90s", name: "Boom Bap & 90s Golden Era", includes: "Vinyl Sample Chops, SP1200 Drums, Lyrical Flow..." },
      { id: "lofi_hiphop_chill", name: "Lo-Fi Hip-Hop & Chill Beats", includes: "Dusty Vinyl, Mellow Rhodes, Study Chords..." },
      { id: "drill_uk_ny", name: "UK & NY Drill", includes: "Sliding 808s, Dark Piano Melodies, Counter-Rhythms..." },
      { id: "conscious_lyrical", name: "Conscious & Jazz Rap", includes: "Live Horns, Upright Bass, Storytelling Bars..." },
      { id: "cloud_melodic_rap", name: "Cloud & Melodic Emo Rap", includes: "Reverb Flutes, Autotune Melodies, Ambient Synths..." },
    ],
  },
  {
    id: "urbano",
    name: "Urbano & Latino",
    icon: "🔥",
    description: "Reggaeton, Dembow, Trap Latino, Baile Funk y ritmos caribeños.",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
    gradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
    subgenres: [
      { id: "reggaeton_clasico", name: "Reggaeton Clásico & Perreo 2000s", includes: "Dembow Puro, Marquesina, Luny Tunes Style..." },
      { id: "trap_latino_dark", name: "Trap Latino & Dark Melodies", includes: "808 Subs, Melodic Street Flow, Synth Leads..." },
      { id: "dembow_mambo", name: "Dembow Dominicano & Mambo", includes: "Fast 120+ BPM, Heavy Snare, Party Flow..." },
      { id: "funk_favela", name: "Funk Carioca & Baile Funk", includes: "Tamborzão 130 BPM, Favela Beat, Vocal Chants..." },
      { id: "afro_dancehall", name: "Afrobeats & Dancehall", includes: "Jamaican Riddims, West African Grooves, Smooth Island..." },
      { id: "neoperreo_cyber", name: "Neoperreo & Cyber Dembow", includes: "Industrial Drums, Rave Bass, Hyper-Latin Energy..." },
    ],
  },
  {
    id: "chill",
    name: "Lo-Fi, Chill & Ambient",
    icon: "☕",
    description: "Study Beats, Ambient, Downtempo, Neo-Classical y sonidos relajantes.",
    badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-400/40",
    gradient: "from-indigo-500/20 via-sky-500/10 to-transparent",
    subgenres: [
      { id: "lofi_study_beats", name: "Lo-Fi Beats & Chillhop", includes: "Vinyl Dust, Nostalgic Rhodes, Relaxed Drums..." },
      { id: "ambient_space_drone", name: "Pure Ambient & Space Drone", includes: "Zero Beat, Infinite Reverb Pads, Meditation..." },
      { id: "downtempo_trip_hop", name: "Downtempo & Trip-Hop", includes: "Slow Breakbeats, Dusty Guitars, Cinematic Moods..." },
      { id: "sunset_nu_disco", name: "Nu-Disco & Sunset Grooves", includes: "Slap Bass, Funky Chords, Glitter Synths..." },
      { id: "chillstep_melodic", name: "Chillstep & Melodic Atmosphere", includes: "Half-Tempo Bass, Emotional Piano, Vocal Echoes..." },
      { id: "neo_classical_piano", name: "Cinematic Neo-Classical", includes: "Grand Piano, Soft Strings, Soundtrack Crescendo..." },
    ],
  },
  {
    id: "rnb",
    name: "R&B & Soul",
    icon: "🎷",
    description: "Neo-Soul, Contemporary R&B, Funk, Motown y elegancia vocal.",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-400/40",
    gradient: "from-purple-500/20 via-pink-500/10 to-transparent",
    subgenres: [
      { id: "neo_soul_organic", name: "Neo-Soul & Pocket Grooves", includes: "Laidback Drums, Jazzy 9th Chords, Silk Vocals..." },
      { id: "contemporary_rnb", name: "Contemporary R&B & Trap Soul", includes: "Slow 808s, Vocal Layers, Midnight Drives..." },
      { id: "classic_soul_funk", name: "Funk & Classic Soul", includes: "Tight Brass Section, Slap Bass, Motown Rhythm..." },
      { id: "smooth_motown", name: "Vintage Motown & Northern Soul", includes: "Stomp Beats, Tambourines, Gospel Chords..." },
      { id: "alternative_rnb", name: "Alternative R&B & Ambient Soul", includes: "Dark Textures, Reverb Vocals, Frank Ocean Vibe..." },
      { id: "disco_funk_modern", name: "Modern Disco & Nu-Funk", includes: "Punchy Bass, Wah Guitars, Upbeat Dancefloor..." },
    ],
  },
  {
    id: "jazz_clasica",
    name: "Jazz, Acústico & Clásica",
    icon: "🎻",
    description: "Bossa Nova, Indie Folk, Smooth Jazz, Cello y composiciones acústicas.",
    badgeColor: "bg-emerald-500/20 text-teal-300 border-emerald-400/40",
    gradient: "from-emerald-500/20 via-amber-500/10 to-transparent",
    subgenres: [
      { id: "bossa_lounge_jazz", name: "Bossa Nova & Lounge Jazz", includes: "Nylon Guitars, Brushes, Cocktail Bar Mood..." },
      { id: "indie_folk_acoustic", name: "Indie Folk & Fingerpicking", includes: "Warm Acoustic Guitars, Harmonies, Organic Strings..." },
      { id: "smooth_jazz_sax", name: "Smooth Jazz & Sax Grooves", includes: "Mellow Saxophone, Electric Piano, Evening Vibe..." },
      { id: "modern_classical_strings", name: "Modern Classical & Cello", includes: "Minimalist Piano, String Quartets, Peaceful Pads..." },
      { id: "acoustic_singer_songwriter", name: "Acoustic Singer-Songwriter", includes: "Solo Guitar/Piano, Raw Emotion, Storytelling..." },
      { id: "nu_jazz_broken_beat", name: "Nu-Jazz & Broken Beat", includes: "Syncopated Drums, Horn Drops, Electronic Jazz Fusion..." },
    ],
  },
];

/**
 * Fallback / Legacy SUBGENRE_DICTIONARY mapped from HIERARCHICAL_MACRO_GENRES
 */
export const SUBGENRE_DICTIONARY: Record<MacroGenre, SubgenreItem[]> = {
  electronica: HIERARCHICAL_MACRO_GENRES.find((g) => g.id === "electronica")!.subgenres,
  rock: HIERARCHICAL_MACRO_GENRES.find((g) => g.id === "rock")!.subgenres,
  pop: HIERARCHICAL_MACRO_GENRES.find((g) => g.id === "pop")!.subgenres,
  hiphop: HIERARCHICAL_MACRO_GENRES.find((g) => g.id === "hiphop")!.subgenres,
  urbano: HIERARCHICAL_MACRO_GENRES.find((g) => g.id === "urbano")!.subgenres,
  chill: HIERARCHICAL_MACRO_GENRES.find((g) => g.id === "chill")!.subgenres,
  rnb: HIERARCHICAL_MACRO_GENRES.find((g) => g.id === "rnb")!.subgenres,
  jazz_clasica: HIERARCHICAL_MACRO_GENRES.find((g) => g.id === "jazz_clasica")!.subgenres,
  dnb: [
    { id: "liquid_dnb", name: "Liquid & Soulful DnB", includes: "Atmospheric, Vocal DnB, Jazz & Bass, Deep Rolling..." },
    { id: "neurofunk", name: "Neurofunk & Cyber Tech", includes: "Heavy Bass Design, Darkstep, Techstep, Modulated Reese..." },
    { id: "jump_up", name: "Jump Up & Festival Bass", includes: "High Energy Screeches, Rollers, Foghorn, Wobble..." },
    { id: "jungle_ragga", name: "Jungle & Ragga Drum", includes: "Amen Breaks, Dub Chords, Rastafari Toasters, Chopped Breaks..." },
    { id: "deep_minimal_dnb", name: "Deep & Minimal 174", includes: "Halftime, Micro-Funk, Skeptical Style, Sub-Heavy Clicks..." },
    { id: "dancefloor_dnb", name: "Dancefloor & Stadium DnB", includes: "Anthemic Vocals, Synth Drops, High Octane Melodies..." },
  ],
};

/**
 * Detects the macro-genre based on keywords in playlist.name.toLowerCase()
 */
export function detectMacroGenre(name: string): MacroGenre {
  const n = name.toLowerCase();

  if (n.includes("dnb") || n.includes("drum") || n.includes("jungle") || n.includes("bass") || n.includes("breakbeat")) {
    return "dnb";
  }
  if (n.includes("house") || n.includes("techno") || n.includes("dance") || n.includes("rave") || n.includes("electro") || n.includes("club") || n.includes("trance") || n.includes("edm") || n.includes("acid")) {
    return "electronica";
  }
  if (n.includes("rock") || n.includes("metal") || n.includes("punk") || n.includes("indie") || n.includes("grunge") || n.includes("guitar") || n.includes("heavy") || n.includes("hard")) {
    return "rock";
  }
  if (n.includes("pop") || n.includes("hits") || n.includes("radio") || n.includes("chart")) {
    return "pop";
  }
  if (n.includes("hip hop") || n.includes("hiphop") || n.includes("rap") || n.includes("trap") || n.includes("boom bap") || n.includes("drill")) {
    return "hiphop";
  }
  if (n.includes("reggaeton") || n.includes("perreo") || n.includes("latin") || n.includes("latino") || n.includes("urbano") || n.includes("dembow") || n.includes("funk carioca")) {
    return "urbano";
  }
  if (n.includes("r&b") || n.includes("rnb") || n.includes("soul") || n.includes("motown") || n.includes("funk")) {
    return "rnb";
  }
  if (n.includes("jazz") || n.includes("bossa") || n.includes("classical") || n.includes("clasica") || n.includes("folk") || n.includes("acoustic") || n.includes("acustica")) {
    return "jazz_clasica";
  }

  return "chill";
}

/**
 * Generates 5 Smart Naming Proposals:
 * - 3 Pro Names
 * - 1 Hybrid Name
 * - 1 Fantasioso / Lore Name
 */
export function generateSmartNamingProposals(
  originalName: string,
  macroGenre: MacroGenre
): string[] {
  const cleanOriginal = originalName.trim() || "Nueva Playlist";

  const proTemplates: Record<MacroGenre, [string, string, string]> = {
    dnb: ["Drum & Bass: 174 Rolling Anthems", "Liquid & Deep Bass Sanctuary", "Sub-Low Frequency Vault"],
    electronica: ["Club Essentials: Cyber Rave Archive", "Tech & Melodic Grooves", "Nightfall Electronic Spectrum"],
    rock: ["Rock Essentials: Overdrive Anthems", "Alternative & Hard Riff Vault", "Pure Grunge & Heavy Grooves"],
    pop: ["Pop Radiance: Modern Anthems", "Synth-Pop & Velvet Hooks", "Contemporary Sparkle Collection"],
    hiphop: ["808 Vault: Hip-Hop & Trap Heavy", "Golden Era: Boom Bap Classics", "Midnight Flow & Lyrical Wave"],
    urbano: ["Perreo & Urbano Gold Edition", "Dembow & Trap Latino Heat", "Rhythm & Urban Underground"],
    chill: ["Chill & Soulful Gems Collection", "Healing Frequencies & Velvet Moods", "Sunset Resonance & Lofi Haven"],
    rnb: ["Neo-Soul Sanctuary: Velvet Chords", "Midnight R&B & Trap Soul Glow", "Classic Soul & Deep Grooves"],
    jazz_clasica: ["Acoustic & Bossa Nova Sanctuary", "Indie Folk & Wood Strings", "Cinematic Classical Echoes"],
  };

  const hybridTemplates: Record<MacroGenre, string> = {
    dnb: `${cleanOriginal}: Bassline Selection`,
    electronica: `${cleanOriginal}: Club Anthems`,
    rock: `${cleanOriginal}: Rock & Alternative`,
    pop: `${cleanOriginal}: Pop & Hits`,
    hiphop: `${cleanOriginal}: Hip-Hop Essentials`,
    urbano: `${cleanOriginal}: Urbano & Dembow`,
    chill: `${cleanOriginal}: Joyas & Chill Moods`,
    rnb: `${cleanOriginal}: Soul & R&B Sessions`,
    jazz_clasica: `${cleanOriginal}: Acoustic & Jazz Vault`,
  };

  const loreTemplates: Record<MacroGenre, string> = {
    dnb: `Anomalía [${cleanOriginal}]: Resonancia 174 BPM`,
    electronica: `El Proyecto ${cleanOriginal}: Frecuencias de Club`,
    rock: `El Archivo ${cleanOriginal}: Crónicas de Overdrive`,
    pop: `Proyecto [${cleanOriginal}]: Resonancia Pop`,
    hiphop: `Protocolo [${cleanOriginal}]: Frecuencias 808`,
    urbano: `Protocolo [${cleanOriginal}]: Ondas de Calle`,
    chill: `Anomalía [${cleanOriginal}]: Frecuencias de Curación`,
    rnb: `El Archivo ${cleanOriginal}: Velvet Sessions`,
    jazz_clasica: `Crónicas [${cleanOriginal}]: Armonías Acústicas`,
  };

  const pro = proTemplates[macroGenre] || proTemplates.chill;
  const hybrid = hybridTemplates[macroGenre] || `${cleanOriginal}: Colección Pro`;
  const lore = loreTemplates[macroGenre] || `Anomalía [${cleanOriginal}]: Archivo Reservado`;

  return [pro[0], pro[1], pro[2], hybrid, lore];
}
