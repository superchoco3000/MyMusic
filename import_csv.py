#!/usr/bin/env python3
"""
MyMusic Library — Ingestor CSV (Fase 1: Carga Inicial Masiva)
==============================================================
Diseñado para leer archivos exportados con Exportify (o herramientas
equivalentes) desde la carpeta data/imports/ y construir (o actualizar)
la fuente de verdad local: public/data/music_library.json.

USO:
    python import_csv.py [--imports-dir data/imports] [--output public/data/music_library.json]

FLUJO:
    1. Detecta todos los .csv en --imports-dir (cada archivo = una playlist).
    2. Parsea, limpia y normaliza las columnas clave de cada CSV.
    3. Hace upsert en music_library.json (no destruye datos existentes
       con audio_features enriquecidos).
    4. Actualiza sync_status.json con ETA estimado y resultado.

ESTRUCTURA DE CADA PLAYLIST EN music_library.json:
    {
        "id": "<spotify_track_id>",          # ID limpio sin prefijo URI
        "name": "...",
        "artist": "...",
        "album": "...",
        "duration_ms": 123456,
        "added_at": "2024-01-15T10:30:00Z",
        "audio_features": { ... },           # null hasta enriquecimiento futuro
        "bpm": null,
        "energy": null,
        "danceability": null,
        # ── Completion Algorithm Scaffold ─────────────────────────────────
        # Preparado para el algoritmo de completación (target: 100 tracks/playlist).
        # El benchmark de calidad es la playlist DnB.
        "completion_score": null,            # score 0.0-1.0 calculado por el algoritmo
        "completion_flags": [],              # ["low_energy", "duplicate_artist", ...]
    }

COLUMNAS ESPERADAS DEL CSV (Exportify / similares):
    Track URI, Track Name, Album Name, Artist Name(s),
    Release Date, Duration (ms), Added At
    (Danceability, Energy, Tempo, etc. son opcionales y se usan si están presentes)

NOTAS ARQUITECTÓNICAS:
    - Este script NO hace ninguna llamada a la API de Spotify.
    - Es el único punto de entrada para la carga inicial masiva.
    - La sincronización de deltas está en sync_library.py (Fase 2).
"""

import os
import sys
import json
import csv
import re
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Paths por defecto ────────────────────────────────────────────────────────

DEFAULT_IMPORTS_DIR  = os.path.join("data", "imports")
DEFAULT_LIBRARY_PATH = os.path.join("public", "data", "music_library.json")
DEFAULT_STATUS_PATH  = os.path.join("public", "data", "sync_status.json")
LOG_FILE_PATH        = os.path.join("public", "data", "sync.log")

os.makedirs(os.path.dirname(LOG_FILE_PATH), exist_ok=True)


# ── Logging ─────────────────────────────────────────────────────────────────

class FlushingFileHandler(logging.FileHandler):
    def emit(self, record):
        super().emit(record)
        self.flush()

logger = logging.getLogger("import_csv")
logger.setLevel(logging.INFO)

_fh = FlushingFileHandler(LOG_FILE_PATH, mode="a", encoding="utf-8")
_fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(_fh)

_ch = logging.StreamHandler(sys.stdout)
_ch.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
logger.addHandler(_ch)


def log(msg, level="info"):
    getattr(logger, level, logger.info)(msg)


# ── Helpers de limpieza ──────────────────────────────────────────────────────

_URI_PREFIX_RE = re.compile(r"^spotify:(track|episode|local):", re.IGNORECASE)


def extract_track_id(raw: str) -> Optional[str]:
    """
    Extrae el ID limpio de Spotify desde un Track URI o ID directo.
    'spotify:track:1tzVSIgVtqfWNbQ63Imd5A'  →  '1tzVSIgVtqfWNbQ63Imd5A'
    '1tzVSIgVtqfWNbQ63Imd5A'               →  '1tzVSIgVtqfWNbQ63Imd5A'
    Tracks locales ('spotify:local:...')    →  None (descartados)
    """
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    if raw.lower().startswith("spotify:local:"):
        return None  # tracks locales sin ID de Spotify real
    cleaned = _URI_PREFIX_RE.sub("", raw).strip()
    # Validar que tenga aspecto de ID de Spotify (22 chars alfanuméricos)
    if re.match(r"^[A-Za-z0-9]{10,30}$", cleaned):
        return cleaned
    return None


def safe_float(val, fallback=None) -> Optional[float]:
    try:
        return float(val)
    except (TypeError, ValueError):
        return fallback


def safe_int(val, fallback=None) -> Optional[int]:
    try:
        return int(val)
    except (TypeError, ValueError):
        return fallback


def playlist_name_from_filename(filepath: str) -> str:
    """Convierte 'data/imports/DnB.csv' → 'DnB'."""
    name = Path(filepath).stem
    # Reemplazar guiones bajos y separadores tipicos de Exportify
    return name.replace("_", " ").strip()


def is_dnb_playlist(name: str) -> bool:
    """Heurística para identificar la playlist benchmark DnB."""
    normalized = name.lower().replace(" ", "").replace("_", "")
    return normalized in {"dnb", "drumnbass", "drumandbass", "drumandbasss"}


def is_liked_songs_playlist(name: str) -> bool:
    """Heurística para identificar Canciones que te gustan (Liked Songs)."""
    normalized = name.lower().replace("_", " ").strip()
    return normalized in {"liked songs", "canciones que te gustan", "favoritas", "me gusta"}


# ── Parser de CSV ────────────────────────────────────────────────────────────

# Mapa de aliases de columnas → clave interna normalizada
# Exportify puede variar ligeramente los nombres entre versiones
_COLUMN_ALIASES = {
    # Track URI
    "track uri":        "uri",
    "trackuri":         "uri",
    "uri":              "uri",
    "spotify uri":      "uri",
    # Track name
    "track name":       "name",
    "trackname":        "name",
    "title":            "name",
    "song":             "name",
    # Artist
    "artist name(s)":   "artist",
    "artist names":     "artist",
    "artist name":      "artist",
    "artist":           "artist",
    "artists":          "artist",
    # Album
    "album name":       "album",
    "albumname":        "album",
    "album":            "album",
    # Duration
    "duration (ms)":    "duration_ms",
    "duration(ms)":     "duration_ms",
    "duration_ms":      "duration_ms",
    "duration ms":      "duration_ms",
    # Added at
    "added at":         "added_at",
    "addedat":          "added_at",
    "date added":       "added_at",
    # Release date
    "release date":     "release_date",
    "releasedate":      "release_date",
    # Audio features (opcionales, presentes en algunos exports)
    "danceability":     "danceability",
    "energy":           "energy",
    "key":              "key",
    "loudness":         "loudness",
    "mode":             "mode",
    "speechiness":      "speechiness",
    "acousticness":     "acousticness",
    "instrumentalness": "instrumentalness",
    "liveness":         "liveness",
    "valence":          "valence",
    "tempo":            "tempo",
    "time signature":   "time_signature",
    "popularity":       "popularity",
    "genres":           "genres",
    "record label":     "record_label",
    "explicit":         "explicit",
}


def normalize_header(header: str) -> str:
    """Normaliza un nombre de columna al alias interno."""
    key = header.strip().lower()
    return _COLUMN_ALIASES.get(key, key)


def minify_track(t: dict) -> dict:
    """Minifica un track a lo estrictamente necesario para la UI y la curación."""
    if not t or not isinstance(t, dict):
        return {}
    tid = t.get("id") or ""
    if not tid:
        return {}

    artist_val = t.get("artist")
    if not artist_val and t.get("artists"):
        if isinstance(t["artists"], list):
            artist_val = ", ".join(a.get("name", "") if isinstance(a, dict) else str(a) for a in t["artists"])
        else:
            artist_val = str(t["artists"])
    if not artist_val:
        artist_val = "Artista Desconocido"

    album_val = t.get("album")
    if isinstance(album_val, dict):
        album_name = album_val.get("name", "")
        album_cover = (album_val.get("images") or [{}])[0].get("url")
    else:
        album_name = str(album_val or "")
        album_cover = t.get("album_cover") or t.get("image_url")

    cover = t.get("album_cover") or t.get("image_url") or album_cover

    af = t.get("audio_features")
    bpm = t.get("bpm") if t.get("bpm") is not None else (af.get("tempo") if isinstance(af, dict) else None)
    energy = t.get("energy") if t.get("energy") is not None else (af.get("energy") if isinstance(af, dict) else None)
    danceability = t.get("danceability") if t.get("danceability") is not None else (af.get("danceability") if isinstance(af, dict) else None)
    key = t.get("key") if t.get("key") is not None else (af.get("key") if isinstance(af, dict) else None)
    mode = t.get("mode") if t.get("mode") is not None else (af.get("mode") if isinstance(af, dict) else None)

    track_clean = {
        "id": tid,
        "name": t.get("name") or "Track",
        "artist": artist_val,
        "album": album_name,
        "duration_ms": int(t.get("duration_ms") or 0),
    }

    if cover:
        track_clean["album_cover"] = cover
        track_clean["image_url"] = cover
    if t.get("preview_url"):
        track_clean["preview_url"] = t.get("preview_url")
    if bpm is not None:
        track_clean["bpm"] = round(float(bpm), 1)
    if energy is not None:
        track_clean["energy"] = round(float(energy), 2)
    if danceability is not None:
        track_clean["danceability"] = round(float(danceability), 2)
    if key is not None:
        track_clean["key"] = key
    if mode is not None:
        track_clean["mode"] = mode

    if isinstance(af, dict) and any(v is not None for v in af.values()):
        track_clean["audio_features"] = {
            "tempo": track_clean.get("bpm"),
            "energy": track_clean.get("energy"),
            "danceability": track_clean.get("danceability"),
            "valence": round(float(af["valence"]), 2) if af.get("valence") is not None else None,
            "acousticness": round(float(af["acousticness"]), 2) if af.get("acousticness") is not None else None,
            "instrumentalness": round(float(af["instrumentalness"]), 2) if af.get("instrumentalness") is not None else None,
            "key": key,
            "mode": mode,
        }

    return track_clean


def parse_csv_file(filepath: str) -> list[dict]:
    """
    Parsea un CSV de Exportify y devuelve una lista de tracks normalizados y minificados.
    """
    tracks = []
    skipped = 0

    try:
        with open(filepath, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)

            if reader.fieldnames is None:
                log(f"CSV vacío o sin cabecera: {filepath}", level="warning")
                return []

            normalized_fields = {col: normalize_header(col) for col in reader.fieldnames}

            for row_num, row in enumerate(reader, start=2):
                normalized_row = {normalized_fields[k]: v for k, v in row.items() if k in normalized_fields}

                raw_uri = normalized_row.get("uri", "").strip()
                track_id = extract_track_id(raw_uri)

                if not track_id:
                    skipped += 1
                    continue

                name     = normalized_row.get("name", "").strip() or f"Track {track_id[:8]}"
                artist   = normalized_row.get("artist", "").strip() or "Artista Desconocido"
                album    = normalized_row.get("album", "").strip() or ""
                duration_ms = safe_int(normalized_row.get("duration_ms"), fallback=0)

                af_danceability     = safe_float(normalized_row.get("danceability"))
                af_energy           = safe_float(normalized_row.get("energy"))
                af_tempo            = safe_float(normalized_row.get("tempo"))
                af_key              = safe_int(normalized_row.get("key"))
                af_mode             = safe_int(normalized_row.get("mode"))
                af_valence          = safe_float(normalized_row.get("valence"))
                af_acousticness     = safe_float(normalized_row.get("acousticness"))
                af_instrumentalness = safe_float(normalized_row.get("instrumentalness"))

                has_audio_features = any(v is not None for v in [
                    af_danceability, af_energy, af_tempo, af_key, af_mode
                ])

                audio_features = None
                if has_audio_features:
                    audio_features = {
                        "tempo":            af_tempo,
                        "energy":           af_energy,
                        "danceability":     af_danceability,
                        "valence":          af_valence,
                        "acousticness":     af_acousticness,
                        "instrumentalness": af_instrumentalness,
                        "mode":             af_mode,
                        "key":              af_key,
                    }

                raw_track = {
                    "id":               track_id,
                    "name":             name,
                    "artist":           artist,
                    "album":            album,
                    "duration_ms":      duration_ms,
                    "audio_features":   audio_features,
                    "bpm":              af_tempo,
                    "energy":           af_energy,
                    "danceability":     af_danceability,
                    "mode":             af_mode,
                    "key":              af_key,
                }
                tracks.append(minify_track(raw_track))

    except FileNotFoundError:
        log(f"Archivo no encontrado: {filepath}", level="error")
    except Exception as e:
        log(f"Error parseando {filepath}: {e}", level="error")
        logger.exception(f"Stacktrace de error en {filepath}")

    if skipped:
        log(f"  {skipped} filas descartadas en {Path(filepath).name} (tracks locales o URIs inválidas).")

    return tracks


# ── Carga y guardado de la librería ─────────────────────────────────────────

def load_library(path: str) -> dict:
    if not os.path.exists(path):
        return {"playlists": [], "last_updated_at": None}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log(f"No se pudo leer {path}: {e}. Se creará una nueva librería.", level="warning")
        return {"playlists": [], "last_updated_at": None}


def save_library(library: dict, path: str):
    """Guarda library con deduplicación estricta y minificación completa."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    library["last_updated_at"] = datetime.now(timezone.utc).isoformat()

    # Deduplicación estricta por ID y por Nombre
    clean_playlists_dict = {}
    for pl in library.get("playlists", []):
        if not pl:
            continue
        pname = (pl.get("name") or "").strip()
        norm_name = pname.lower()
        pid = pl.get("id")

        if not pid or pid == "None":
            pid = f"pl_{re.sub(r'[^a-zA-Z0-9_]', '_', norm_name)}"
            pl["id"] = pid

        # Minificar todos los tracks de la playlist
        raw_tracks = pl.get("tracks_data") or []
        minified_tracks = []
        seen_tids = set()
        for t in raw_tracks:
            tid = t.get("id")
            if tid and tid not in seen_tids:
                seen_tids.add(tid)
                minified_tracks.append(minify_track(t))

        pl["tracks_data"] = minified_tracks
        pl["total_tracks"] = len(minified_tracks)
        pl["tracks"] = {"total": len(minified_tracks)}

        # Si ya existe por ID o por nombre, quedarse con el que tenga más tracks
        matched_key = None
        if pid in clean_playlists_dict:
            matched_key = pid
        else:
            for k, existing in clean_playlists_dict.items():
                if (existing.get("name") or "").lower().strip() == norm_name:
                    matched_key = k
                    break

        if matched_key:
            existing = clean_playlists_dict[matched_key]
            if len(existing.get("tracks_data") or []) < len(minified_tracks):
                clean_playlists_dict[matched_key] = pl
        else:
            clean_playlists_dict[pid] = pl

    library["playlists"] = list(clean_playlists_dict.values())

    with open(path, "w", encoding="utf-8") as f:
        json.dump(library, f, indent=2, ensure_ascii=False)
    log(f"Librería guardada en {path} ({len(library['playlists'])} playlists únicas).")


def save_status(path: str, status: str, message: str = None, extra: dict = None):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    payload = {
        "status":     status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "message":    message,
        **(extra or {}),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


# ── Ingestión principal ──────────────────────────────────────────────────────

def ingest(imports_dir: str, library_path: str, status_path: str):
    """
    Punto de entrada principal del ingestor.
    Detecta CSVs → parsea → hace upsert en library → guarda.
    """
    save_status(status_path, "syncing", message="Ingesta CSV iniciada")

    # ── 1. Descubrir archivos CSV ────────────────────────────────────────────
    csv_files = sorted(Path(imports_dir).glob("*.csv"))

    if not csv_files:
        msg = f"No se encontraron archivos .csv en {imports_dir}"
        log(msg, level="warning")
        save_status(status_path, "done", message=msg, extra={"playlists_count": 0})
        return

    log("==========================================")
    log("  MyMusic CSV Ingestor — Fase 1 (v1.0)   ")
    log("==========================================")
    log(f"Encontrados {len(csv_files)} archivos CSV en '{imports_dir}'.")

    # ── 2. Estimar ETA ───────────────────────────────────────────────────────
    total_size_bytes = sum(f.stat().st_size for f in csv_files)
    # Throughput estimado: ~500KB/s en parsing+normalización conservador
    eta_seconds = max(1, round(total_size_bytes / (500 * 1024)))
    log(f"Tamaño total: {total_size_bytes / 1024:.1f} KB — ETA estimado: ~{eta_seconds}s")
    save_status(
        status_path, "syncing",
        message=f"Ingiriendo {len(csv_files)} playlists...",
        extra={"eta_seconds": eta_seconds, "total_files": len(csv_files)},
    )

    # ── 3. Cargar librería existente ─────────────────────────────────────────
    library = load_library(library_path)
    existing_playlists = {pl["name"]: pl for pl in library.get("playlists", []) if pl.get("name")}
    dnb_benchmark_name = None  # se detecta durante el loop

    results = []

    # ── 4. Parsear cada CSV ──────────────────────────────────────────────────
    for i, csv_path in enumerate(csv_files, start=1):
        pl_name = playlist_name_from_filename(str(csv_path))
        log(f"[{i}/{len(csv_files)}] Procesando '{pl_name}' ({csv_path.name})...")

        tracks = parse_csv_file(str(csv_path))

        if not tracks:
            log(f"  Sin tracks válidos en '{pl_name}'. Saltando.", level="warning")
            results.append({"name": pl_name, "tracks": 0, "status": "skipped"})
            continue

        # Detectar si es la playlist benchmark DnB
        if is_dnb_playlist(pl_name):
            dnb_benchmark_name = pl_name
            log(f"  [DnB BENCHMARK] Detectada playlist benchmark: '{pl_name}'")

        # Upsert: si ya existe la playlist, conservar campos enriquecidos
        # que no están disponibles en el CSV (album_cover, preview_url, snapshot_id…)
        if pl_name in existing_playlists:
            existing = existing_playlists[pl_name]
            existing_tracks_map = {t["id"]: t for t in existing.get("tracks_data", []) if t.get("id")}

            merged_tracks = []
            for t in tracks:
                tid = t["id"]
                if tid in existing_tracks_map:
                    ex = existing_tracks_map[tid]
                    # Preservar campos enriquecidos existentes, actualizar campos CSV
                    merged = {**ex, **t}
                    # Pero conservar audio_features del existente si el CSV no los trae
                    if t.get("audio_features") is None and ex.get("audio_features"):
                        merged["audio_features"] = ex["audio_features"]
                        merged["bpm"]         = ex.get("bpm")
                        merged["energy"]      = ex.get("energy")
                        merged["danceability"]= ex.get("danceability")
                    # Conservar album_cover y preview_url si el CSV no los tiene
                    if not merged.get("album_cover"):
                        merged["album_cover"] = ex.get("album_cover")
                    if not merged.get("image_url"):
                        merged["image_url"]   = ex.get("image_url")
                    if not merged.get("preview_url"):
                        merged["preview_url"] = ex.get("preview_url")
                    merged_tracks.append(merged)
                else:
                    merged_tracks.append(t)  # track nuevo en el CSV

            updated_pl = {
                **existing,
                "name":         pl_name,
                "total_tracks": len(merged_tracks),
                "tracks":       {"total": len(merged_tracks)},
                "tracks_data":  merged_tracks,
                "last_synced_at": datetime.now(timezone.utc).isoformat(),
                "source":       "csv_import",
            }
            existing_playlists[pl_name] = updated_pl
            log(f"  Upsert: {len(merged_tracks)} tracks (era {len(existing.get('tracks_data', []))} localmente).")

        else:
            # Nueva playlist
            # ─────────────────────────────────────────────────────────────────
            # COMPLETION ALGORITHM SCAFFOLD (nivel playlist)
            # ─────────────────────────────────────────────────────────────────
            # `completion_meta` almacena el estado del algoritmo de completación
            # para esta playlist. El algoritmo futuro leerá y escribirá aquí.
            #
            # Campos del contrato:
            #   target_count: int = 100
            #     Número objetivo de tracks tras la completación.
            #   current_count: int
            #     Número de tracks actuales (antes de completar).
            #   benchmark_playlist: str | null
            #     Nombre de la playlist benchmark usada para el scoring.
            #     Se establecerá en la playlist DnB cuando se detecte.
            #   is_benchmark: bool
            #     True si esta playlist ES el benchmark DnB.
            #   status: "pending" | "in_progress" | "completed"
            #     Estado del proceso de completación.
            #   last_run_at: str | null
            #     ISO timestamp de la última ejecución del algoritmo.
            #   gap: int
            #     Diferencia entre target_count y current_count.
            #     Positivo → faltan tracks; negativo → sobran tracks.
            # ─────────────────────────────────────────────────────────────────
            is_liked = is_liked_songs_playlist(pl_name)
            new_pl = {
                "id":           "spotify_liked_songs" if is_liked else None,
                "name":         "Liked Songs" if is_liked else pl_name,
                "description":  "Tus canciones favoritas sincronizadas con Spotify." if is_liked else None,
                "image_url":    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=60" if is_liked else None,
                "owner_name":   "Tú" if is_liked else None,
                "total_tracks": len(tracks),
                "tracks":       {"total": len(tracks)},
                "collaborative": False,
                "snapshot_id":  f"liked_songs_{len(tracks)}" if is_liked else None,
                "last_synced_at": datetime.now(timezone.utc).isoformat(),
                "source":       "spotify_liked_songs" if is_liked else "csv_import",
                "tracks_data":  tracks,
                # Completion Algorithm Scaffold (ver comentario arriba)
                "completion_meta": {
                    "target_count":       100,
                    "current_count":      len(tracks),
                    "benchmark_playlist": None,   # se enlaza con DnB en post-proceso
                    "is_benchmark":       is_dnb_playlist(pl_name),
                    "status":             "pending",
                    "last_run_at":        None,
                    "gap":                100 - len(tracks),
                },
            }
            existing_playlists[pl_name] = new_pl
            log(f"  Nueva playlist: {len(tracks)} tracks importados.")

        results.append({"name": pl_name, "tracks": len(tracks), "status": "ok"})

    # ── 5. Post-proceso: enlazar benchmark DnB en todas las playlists ────────
    if dnb_benchmark_name:
        log(f"Enlazando benchmark DnB ('{dnb_benchmark_name}') en completion_meta de todas las playlists...")
        for pl in existing_playlists.values():
            meta = pl.get("completion_meta")
            if meta and not meta.get("is_benchmark"):
                meta["benchmark_playlist"] = dnb_benchmark_name

    # ── 6. Guardar librería ──────────────────────────────────────────────────
    library["playlists"] = list(existing_playlists.values())
    save_library(library, library_path)

    # ── 7. Resumen ───────────────────────────────────────────────────────────
    total_tracks = sum(r["tracks"] for r in results if r["status"] == "ok")
    ok_count     = sum(1 for r in results if r["status"] == "ok")
    skip_count   = sum(1 for r in results if r["status"] == "skipped")

    log("==========================================")
    log(f"  Ingesta completada: {ok_count} playlists OK, {skip_count} saltadas.")
    log(f"  Total de tracks importados: {total_tracks}")
    if dnb_benchmark_name:
        log(f"  Benchmark DnB detectado: '{dnb_benchmark_name}'")
    log("==========================================")

    save_status(
        status_path, "done",
        message=f"Ingesta CSV completada: {ok_count} playlists, {total_tracks} tracks.",
        extra={
            "playlists_count":   ok_count,
            "total_tracks":      total_tracks,
            "dnb_benchmark":     dnb_benchmark_name,
            "results":           results,
        },
    )


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Ingestor CSV de Exportify → music_library.json"
    )
    parser.add_argument(
        "--imports-dir", default=DEFAULT_IMPORTS_DIR,
        help=f"Carpeta con los CSVs exportados (default: {DEFAULT_IMPORTS_DIR})",
    )
    parser.add_argument(
        "--output", default=DEFAULT_LIBRARY_PATH,
        help=f"Ruta del music_library.json de salida (default: {DEFAULT_LIBRARY_PATH})",
    )
    parser.add_argument(
        "--status", default=DEFAULT_STATUS_PATH,
        help=f"Ruta del sync_status.json (default: {DEFAULT_STATUS_PATH})",
    )
    args = parser.parse_args()

    ingest(
        imports_dir=args.imports_dir,
        library_path=args.output,
        status_path=args.status,
    )


if __name__ == "__main__":
    main()
