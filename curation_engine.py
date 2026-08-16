#!/usr/bin/env python3
"""
curation_engine.py — Copiloto Analítico y Motor de Clasificación de Playlists
=============================================================================
Audita una playlist caótica o de materia prima (>= 200 tracks), extrae su ADN
musical (BPM mediana, Energía mediana, Década dominante, Top Artistas) y clasifica
cada track en un semáforo analítico:
  🟢 VERDE (Aceptada): match_score >= 85%
  🟠 NARANJA (En Revisión): 70% <= match_score < 85%
  🔴 ROJA (Rechazada): match_score < 70%
"""

import sys
import json
import statistics
import argparse
from pathlib import Path
from collections import Counter
from typing import Dict, List, Any, Optional, Tuple

# Ensure UTF-8 stdout on Windows terminal
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ─── Terminal ANSI Colors ──────────────────────────────────────────────────────
class C:
    RESET   = "\033[0m"
    BOLD    = "\033[1m"
    DIM     = "\033[2m"
    GREEN   = "\033[38;5;46m"
    LIME    = "\033[38;5;118m"
    AMBER   = "\033[38;5;214m"
    ORANGE  = "\033[38;5;208m"
    RED     = "\033[38;5;196m"
    CYAN    = "\033[38;5;51m"
    MAGENTA = "\033[38;5;201m"
    YELLOW  = "\033[38;5;226m"
    WHITE   = "\033[38;5;231m"
    GRAY    = "\033[38;5;244m"
    BG_DARK = "\033[48;5;234m"

# ─── Helpers ──────────────────────────────────────────────────────────────────

def extract_year_decade(release_date: Optional[str]) -> Optional[str]:
    """Extracts decade string (e.g., '1990s', '2020s') from release_date."""
    if not release_date:
        return None
    date_str = str(release_date).strip()
    if len(date_str) >= 4:
        try:
            year = int(date_str[:4])
            if 1900 <= year <= 2030:
                decade = (year // 10) * 10
                return f"{decade}s"
        except ValueError:
            pass
    return None

def extract_artists_from_string(artist_str: Optional[str]) -> List[str]:
    """Splits multiple artists if separated by semicolons or commas."""
    if not artist_str:
        return []
    # Primary split by semicolon, fallback by comma
    parts = [a.strip() for a in artist_str.replace(";", ",").split(",") if a.strip()]
    return parts if parts else [artist_str.strip()]

# ─── DNA Extraction ───────────────────────────────────────────────────────────

def extract_playlist_dna(tracks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes baseline DNA:
    - Median Tempo (BPM)
    - Median Energy
    - Dominant Decade
    - Top 3 Artists
    """
    tempos: List[float] = []
    energies: List[float] = []
    decades: List[str] = []
    artist_counter: Counter = Counter()

    for t in tracks:
        # 1. BPM / Tempo
        af = t.get("audio_features") or {}
        tempo = af.get("tempo") or t.get("bpm")
        if isinstance(tempo, (int, float)) and tempo > 30:
            tempos.append(float(tempo))

        # 2. Energy
        energy = af.get("energy") or t.get("energy")
        if isinstance(energy, (int, float)) and 0.0 <= energy <= 1.0:
            energies.append(float(energy))

        # 3. Decade
        dec = extract_year_decade(t.get("release_date"))
        if dec:
            decades.append(dec)

        # 4. Artists
        raw_artists = extract_artists_from_string(t.get("artist"))
        for a in raw_artists:
            if a.lower() not in ("desconocido", "unknown", "various artists"):
                artist_counter[a] += 1

    # Medians or safe defaults
    median_tempo = statistics.median(tempos) if tempos else 125.0
    median_energy = statistics.median(energies) if energies else 0.75

    dominant_decade = Counter(decades).most_common(1)[0][0] if decades else "2020s"
    top_3_artists = [name for name, _ in artist_counter.most_common(3)]

    return {
        "median_tempo": round(median_tempo, 1),
        "median_energy": round(median_energy, 3),
        "dominant_decade": dominant_decade,
        "top_3_artists": top_3_artists,
        "tracks_with_features": len(tempos),
        "total_tracks": len(tracks),
    }

# ─── Scoring Engine (El Semáforo) ─────────────────────────────────────────────

def evaluate_track(
    track: Dict[str, Any],
    dna: Dict[str, Any]
) -> Tuple[float, str, str]:
    """
    Calculates match_score (0% to 100%) and returns (score, category, reason).
    Categories: 'VERDE', 'NARANJA', 'ROJA'
    """
    median_tempo = dna["median_tempo"]
    median_energy = dna["median_energy"]
    dominant_decade = dna["dominant_decade"]
    top_3_artists = [a.lower() for a in dna["top_3_artists"]]

    af = track.get("audio_features") or {}
    t_tempo = af.get("tempo") or track.get("bpm")
    t_energy = af.get("energy") or track.get("energy")
    t_decade = extract_year_decade(track.get("release_date"))
    t_artists = [a.lower() for a in extract_artists_from_string(track.get("artist"))]

    has_features = isinstance(t_tempo, (int, float)) and isinstance(t_energy, (int, float))

    reasons: List[str] = []

    if has_features:
        t_bpm = float(t_tempo)
        t_en = float(t_energy)

        # 1. BPM match score (Deviation penalty)
        bpm_diff = abs(t_bpm - median_tempo)
        bpm_dev_pct = bpm_diff / median_tempo
        # 10% diff -> 0.75, 20% diff -> 0.50, 40%+ diff -> 0.0
        bpm_score = max(0.0, 1.0 - (bpm_dev_pct * 2.5))

        # 2. Energy match score
        energy_diff = abs(t_en - median_energy)
        # 0.10 diff -> 0.75, 0.20 diff -> 0.50, 0.40+ diff -> 0.0
        energy_score = max(0.0, 1.0 - (energy_diff * 2.5))

        base_score = (bpm_score * 0.55 + energy_score * 0.45) * 100.0

        # Build diagnostic notes
        if bpm_dev_pct > 0.18:
            reasons.append(f"BPM {round(t_bpm)} vs {median_tempo} mediana (Δ{round(bpm_dev_pct * 100)}%)")
        if energy_diff > 0.22:
            reasons.append(f"Energía {round(t_en, 2)} vs {median_energy} (Δ{round(energy_diff, 2)})")
    else:
        base_score = 55.0
        reasons.append("Sin audio features completos")

    # 3. Bonus: +15% if matches dominant decade OR is one of top 3 artists
    bonus = 0.0
    matched_decade = t_decade == dominant_decade if t_decade else False
    matched_artist = any(a in top_3_artists for a in t_artists)

    if matched_decade or matched_artist:
        bonus = 15.0
        bonus_tags = []
        if matched_decade:
            bonus_tags.append(f"década {t_decade}")
        if matched_artist:
            bonus_tags.append("Top Artista")
        # note bonus if relevant
    else:
        if t_decade and t_decade != dominant_decade:
            reasons.append(f"década {t_decade} vs {dominant_decade}")

    final_score = min(100.0, max(0.0, base_score + bonus))
    final_score = round(final_score, 1)

    # 4. Strict Classification Thresholds
    if final_score >= 85.0:
        category = "VERDE"
        reason = "Afinidad óptima en BPM, energía acústica y contexto."
    elif final_score >= 70.0:
        category = "NARANJA"
        reason = "Duda de encaje: " + (", ".join(reasons) if reasons else "Variación moderada de estilo.")
    else:
        category = "ROJA"
        reason = "Rechazada: " + (", ".join(reasons) if reasons else "Incompatibilidad rítmica y energética severa.")

    return final_score, category, reason

# ─── Curation Engine Runner ───────────────────────────────────────────────────

def run_curation_audit(json_path: Path, playlist_filter: Optional[str] = None):
    if not json_path.exists():
        print(f"{C.RED}Error: Archivo no encontrado en {json_path}{C.RESET}")
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        library = json.load(f)

    playlists: List[Dict[str, Any]] = library.get("playlists", [])
    if not playlists:
        print(f"{C.RED}Error: No hay playlists en {json_path}{C.RESET}")
        sys.exit(1)

    # 1. Selection: >= 200 tracks, or max tracks
    target_pl: Optional[Dict[str, Any]] = None

    if playlist_filter:
        for p in playlists:
            if playlist_filter.lower() in p.get("name", "").lower():
                target_pl = p
                break

    if not target_pl:
        # Find first playlist with >= 200 tracks
        candidates = [p for p in playlists if len(p.get("tracks_data") or []) >= 200]
        if candidates:
            target_pl = candidates[0]
        else:
            # Fallback: playlist with most tracks
            target_pl = max(playlists, key=lambda p: len(p.get("tracks_data") or []))

    pl_name = target_pl.get("name", "Playlist Desconocida")
    tracks = target_pl.get("tracks_data") or []

    # 2. Extract DNA
    dna = extract_playlist_dna(tracks)

    # 3. Classify all tracks
    green_tracks: List[Dict[str, Any]] = []
    orange_tracks: List[Dict[str, Any]] = []
    red_tracks: List[Dict[str, Any]] = []

    for t in tracks:
        score, cat, reason = evaluate_track(t, dna)
        item = {
            "name": t.get("name") or "Sin Título",
            "artist": t.get("artist") or "Desconocido",
            "score": score,
            "category": cat,
            "reason": reason,
            "bpm": (t.get("audio_features") or {}).get("tempo") or t.get("bpm"),
            "energy": (t.get("audio_features") or {}).get("energy") or t.get("energy"),
            "decade": extract_year_decade(t.get("release_date")),
        }
        if cat == "VERDE":
            green_tracks.append(item)
        elif cat == "NARANJA":
            orange_tracks.append(item)
        else:
            red_tracks.append(item)

    total = len(tracks) or 1
    pct_green = round((len(green_tracks) / total) * 100, 1)
    pct_orange = round((len(orange_tracks) / total) * 100, 1)
    pct_red = round((len(red_tracks) / total) * 100, 1)

    # 4. Stylized Visual Audit in Terminal
    print("\n" + f"{C.BG_DARK}{C.CYAN}{'═' * 76}{C.RESET}")
    print(f"{C.BG_DARK}{C.BOLD}{C.WHITE}  ⚡ SPOTIFY COLLAB · MOTOR DE CURACIÓN ANALÍTICA (COPILOTO) ⚡  {C.RESET}")
    print(f"{C.BG_DARK}{C.CYAN}{'═' * 76}{C.RESET}\n")

    print(f"{C.BOLD}📁 Playlist Auditada:{C.RESET} {C.YELLOW}{pl_name}{C.RESET}")
    print(f"{C.BOLD}📊 Total de Canciones:{C.RESET} {C.WHITE}{len(tracks):,} tracks{C.RESET} ({dna['tracks_with_features']} con metadatos acústicos)")

    print(f"\n{C.BOLD}{C.MAGENTA}🧬 ADN MUSICAL DETECTADO (Mediana & Patrón):{C.RESET}")
    print(f"  ├─ 🎵 {C.BOLD}BPM Mediana:{C.RESET}      {C.CYAN}{dna['median_tempo']} BPM{C.RESET}")
    print(f"  ├─ ⚡ {C.BOLD}Energía Mediana:{C.RESET}  {C.CYAN}{round(dna['median_energy'] * 100, 1)}%{C.RESET} ({dna['median_energy']})")
    print(f"  ├─ 📅 {C.BOLD}Década Dominante:{C.RESET} {C.CYAN}{dna['dominant_decade']}{C.RESET}")
    top_artists_str = ", ".join(dna['top_3_artists']) if dna['top_3_artists'] else "Sin datos"
    print(f"  └─ 👑 {C.BOLD}Top 3 Artistas:{C.RESET}   {C.CYAN}{top_artists_str}{C.RESET}")

    print(f"\n{C.BOLD}{C.WHITE}🚦 RESUMEN DEL SEMÁFORO DE CURACIÓN:{C.RESET}")
    print(f"  ┌────────────────────────────────────────────────────────────────────────┐")
    print(f"  │  🟢 {C.GREEN}{C.BOLD}VERDE (Aceptada):{C.RESET}     {len(green_tracks):>4} tracks  ({pct_green:>5}%) │ {C.DIM}Encaje perfecto (>= 85%){C.RESET}  │")
    print(f"  │  🟠 {C.ORANGE}{C.BOLD}NARANJA (En Revisión):{C.RESET}{len(orange_tracks):>4} tracks  ({pct_orange:>5}%) │ {C.DIM}Duda del algoritmo (70-84%){C.RESET} │")
    print(f"  │  🔴 {C.RED}{C.BOLD}ROJA (Rechazada):{C.RESET}     {len(red_tracks):>4} tracks  ({pct_red:>5}%) │ {C.DIM}Impostores musicales (< 70%){C.RESET} │")
    print(f"  └────────────────────────────────────────────────────────────────────────┘")

    # 5. Sample Audit: 3 Orange & 3 Red
    print(f"\n{C.BOLD}{C.ORANGE}🔍 MUESTRA DE AUDITORÍA: CANCIONES EN REVISIÓN (🟠 NARANJAS){C.RESET}")
    if orange_tracks:
        sample_orange = orange_tracks[:3]
        for i, t in enumerate(sample_orange, 1):
            print(f"  {C.BOLD}[{i}]{C.RESET} {C.WHITE}{t['name']}{C.RESET} — {C.GRAY}{t['artist']}{C.RESET}")
            print(f"      {C.ORANGE}Match Score: {t['score']}%{C.RESET} | {C.DIM}{t['reason']}{C.RESET}")
    else:
        print(f"  {C.DIM}No hay canciones en revisión.{C.RESET}")

    print(f"\n{C.BOLD}{C.RED}🚫 MUESTRA DE AUDITORÍA: CANCIONES RECHAZADAS (🔴 ROJAS){C.RESET}")
    if red_tracks:
        sample_red = red_tracks[:3]
        for i, t in enumerate(sample_red, 1):
            print(f"  {C.BOLD}[{i}]{C.RESET} {C.WHITE}{t['name']}{C.RESET} — {C.GRAY}{t['artist']}{C.RESET}")
            print(f"      {C.RED}Match Score: {t['score']}%{C.RESET} | {C.DIM}{t['reason']}{C.RESET}")
    else:
        print(f"  {C.DIM}No hay canciones rechazadas.{C.RESET}")

    print("\n" + f"{C.BG_DARK}{C.CYAN}{'═' * 76}{C.RESET}")
    print(f"{C.GREEN}✔ Auditoría en modo Dry-Run completada sin modificar la base de datos.{C.RESET}\n")

# ─── Entry Point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Motor de Curación Analítica de Playlists (Dry Run)")
    parser.add_argument(
        "--file",
        "-f",
        default="public/data/music_library.json",
        help="Ruta al archivo music_library.json (default: public/data/music_library.json)"
    )
    parser.add_argument(
        "--playlist",
        "-p",
        default=None,
        help="Nombre o fragmento del nombre de la playlist a auditar (default: primera con >= 200 tracks)"
    )
    args = parser.parse_args()

    json_path = Path(args.file)
    run_curation_audit(json_path, args.playlist)

if __name__ == "__main__":
    main()
