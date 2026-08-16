#!/usr/bin/env python3
"""
MyMusic Library — Enriquecedor de Metadatos (El Francotirador)
==============================================================
Rellena los huecos de audio_features en music_library.json
llamando al endpoint sp.audio_features() de forma sigilosa:
  - Chunks de exactamente 100 IDs (límite máximo del endpoint)
  - time.sleep(3) entre cada chunk para simular tráfico humano
  - Guarda progresivamente cada CHECKPOINT_EVERY chunks
  - Maneja None silencioso (tracks retirados sin features)
  - Filtra tracks locales y duplicados antes de enviar

AUTENTICACIÓN:
  NOTA: Spotify deprecó el acceso a audio-features con Client Credentials
  (app-only) en mayo 2024 → devuelve HTTP 403.
  El endpoint REQUIERE un token OAuth de usuario con scope user-library-read.

  Estrategia de autenticación (prioridad):
    1. --token <ACCESS_TOKEN>          Token OAuth pasado por CLI (recomendado)
    2. SPOTIFY_ACCESS_TOKEN env var    Token OAuth en .env.local
    3. Client Credentials              Fallback (solo funciona si Spotify lo
                                        re-habilita en el futuro)

USO:
    python enrich_metadata.py --token <SPOTIFY_ACCESS_TOKEN>
    python enrich_metadata.py --dry-run
    python enrich_metadata.py --token <TOKEN> --sleep 5 --chunk-size 50

    --token       Token OAuth de usuario de Spotify (recomendado).
    --dry-run     Solo reporta cuántos tracks necesitan enriquecimiento.
    --chunk-size  Tamaño del chunk (máx. 100, default: 100).
    --sleep       Segundos entre chunks (default: 3).
    --checkpoint  Guardar cada N chunks (default: 5).
"""

import os
import sys
import json
import time
import logging
import argparse
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

LIBRARY_JSON_PATH = os.path.join("public", "data", "music_library.json")
STATUS_JSON_PATH  = os.path.join("public", "data", "sync_status.json")
LOG_FILE_PATH     = os.path.join("public", "data", "sync.log")

os.makedirs(os.path.dirname(LOG_FILE_PATH), exist_ok=True)

# ── Logging ─────────────────────────────────────────────────────────────────

class FlushingFileHandler(logging.FileHandler):
    def emit(self, record):
        super().emit(record)
        self.flush()

logger = logging.getLogger("enrich_metadata")
logger.setLevel(logging.INFO)

_fh = FlushingFileHandler(LOG_FILE_PATH, mode="a", encoding="utf-8")
_fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(_fh)

_ch = logging.StreamHandler(sys.stdout)
_ch.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
logger.addHandler(_ch)

def log(msg, level="info"):
    getattr(logger, level, logger.info)(msg)


# ── Carga / guardado de librería ─────────────────────────────────────────────

def load_library() -> dict:
    if not os.path.exists(LIBRARY_JSON_PATH):
        log(f"No se encontró {LIBRARY_JSON_PATH}. Ejecuta import_csv.py primero.", level="error")
        sys.exit(1)
    with open(LIBRARY_JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_library(library: dict, checkpoint: bool = False):
    library["last_updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(LIBRARY_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(library, f, indent=2, ensure_ascii=False)
    tag = "[CHECKPOINT]" if checkpoint else "[FINAL]"
    n = len(library.get("playlists", []))
    log(f"{tag} Librería guardada: {LIBRARY_JSON_PATH} ({n} playlists).")


def save_status(status: str, message: str = None, extra: dict = None):
    payload = {
        "status":     status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "message":    message,
        **(extra or {}),
    }
    with open(STATUS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


# ── Análisis de huecos ───────────────────────────────────────────────────────

def find_missing_ids(library: dict) -> tuple[list[str], dict[str, list]]:
    """
    Escanea music_library.json y devuelve:
      - missing_ids: lista ordenada de IDs únicos sin audio_features válidos
      - id_to_playlists: mapa {track_id: [playlist_name, ...]} para el upsert

    Criterio de "audio_features vacío":
      - campo ausente, None, o dict sin clave 'tempo' (campo representativo)
    """
    missing_set    = set()
    id_to_playlists = {}   # {track_id: [pl_name, ...]}

    for pl in library.get("playlists", []):
        pl_name = pl.get("name", "?")
        for t in pl.get("tracks_data", []):
            tid = t.get("id")
            if not tid:
                continue
            # Registrar en el mapa de playlists
            if tid not in id_to_playlists:
                id_to_playlists[tid] = []
            id_to_playlists[tid].append(pl_name)

            # Comprobar si faltan features
            af = t.get("audio_features")
            if not af or not isinstance(af, dict) or af.get("tempo") is None:
                missing_set.add(tid)

    missing_ids = sorted(missing_set)
    return missing_ids, id_to_playlists


# ── Normalización de audio features ─────────────────────────────────────────

def normalize_audio_features(af: dict, track_id: str) -> dict:
    """
    Convierte la respuesta cruda de Spotify audio_features en el
    esquema canónico de la librería. Garantiza tipos correctos.
    """
    return {
        "id":               af.get("id", track_id),
        "tempo":            float(af.get("tempo") or 120.0),
        "energy":           float(af.get("energy") or 0.0),
        "danceability":     float(af.get("danceability") or 0.0),
        "valence":          float(af.get("valence") or 0.0),
        "acousticness":     float(af.get("acousticness") or 0.0),
        "instrumentalness": float(af.get("instrumentalness") or 0.0),
        "speechiness":      float(af.get("speechiness") or 0.0),
        "loudness":         float(af.get("loudness") or -60.0),
        "mode":             int(af.get("mode") or 0),
        "key":              int(af.get("key") or 0),
        "time_signature":   int(af.get("time_signature") or 4),
        "duration_ms":      int(af.get("duration_ms") or 0),
    }


# ── Motor de enriquecimiento ─────────────────────────────────────────────────

def enrich(
    chunk_size: int = 100,
    sleep_between_chunks: float = 3.0,
    checkpoint_every: int = 5,
    dry_run: bool = False,
    access_token: str = None,
):
    """
    Flujo principal del Francotirador de Metadatos.

    1. Carga librería y detecta huecos.
    2. Construye chunks de IDs.
    3. Por cada chunk: llama a Spotify, parsea, mapea de vuelta al JSON.
    4. Guarda checkpoint cada `checkpoint_every` chunks.
    5. Guarda versión final al terminar.
    """

    # ── Importar Spotipy ─────────────────────────────────────────────────────
    try:
        import spotipy
        from spotipy.oauth2 import SpotifyClientCredentials
        from spotipy.exceptions import SpotifyException
    except ImportError:
        log("Libreria spotipy no instalada. Ejecuta: pip install spotipy python-dotenv", level="error")
        sys.exit(1)

    # ── Selección de estrategia de autenticación ─────────────────────────────
    # Prioridad: token CLI → SPOTIFY_ACCESS_TOKEN env → Client Credentials
    # NOTA: audio-features requiere token OAuth desde mayo 2024 (403 en app-only)
    resolved_token = (
        access_token
        or os.getenv("SPOTIFY_ACCESS_TOKEN", "").strip()
        or None
    )

    if resolved_token:
        log("Auth: usando token OAuth de usuario (--token / SPOTIFY_ACCESS_TOKEN).")
        sp = spotipy.Spotify(auth=resolved_token, requests_timeout=20, retries=0)
    else:
        client_id     = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()
        if not client_id or not client_secret:
            log("Falta token OAuth (--token) y no hay SPOTIFY_CLIENT_ID/SECRET en .env.local", level="error")
            log("SOLUCION: Pasa un token OAuth con: python enrich_metadata.py --token <TOKEN>", level="error")
            sys.exit(1)
        log("Auth: usando Client Credentials (ADVERTENCIA: puede devolver 403 en audio-features).")
        auth_manager = SpotifyClientCredentials(
            client_id=client_id,
            client_secret=client_secret,
        )
        sp = spotipy.Spotify(auth_manager=auth_manager, requests_timeout=20, retries=0)

    # ── Cargar librería y analizar huecos ────────────────────────────────────
    log("==========================================")
    log("  MyMusic Enrich Metadata — Francotirador ")
    log("==========================================")
    log(f"Cargando {LIBRARY_JSON_PATH}...")

    library = load_library()
    missing_ids, id_to_playlists = find_missing_ids(library)

    total_unique    = sum(len(set(t["id"] for t in pl.get("tracks_data", []) if t.get("id")))
                         for pl in library.get("playlists", []))
    total_missing   = len(missing_ids)
    total_chunks    = (total_missing + chunk_size - 1) // chunk_size
    eta_seconds     = total_chunks * sleep_between_chunks

    log(f"Total IDs únicos en la librería: {total_unique:,}")
    log(f"IDs sin audio_features:          {total_missing:,}")
    log(f"Ya enriquecidos:                 {total_unique - total_missing:,}")
    log(f"Chunks a procesar:               {total_chunks} x {chunk_size} IDs")
    log(f"Throttle:                        {sleep_between_chunks}s entre chunks")
    log(f"ETA estimado:                    ~{int(eta_seconds)}s (~{eta_seconds/60:.1f} min)")

    if total_missing == 0:
        log("La libreria ya esta completamente enriquecida. Nada que hacer.")
        save_status("done", message="Libreria ya completamente enriquecida", extra={
            "total_unique": total_unique,
            "enriched": total_unique - total_missing,
            "missing": 0,
        })
        return

    if dry_run:
        log("[DRY-RUN] Modo de solo lectura. No se realizaran llamadas a la API.")
        log(f"[DRY-RUN] Tracks a enriquecer: {missing_ids[:10]}{'...' if total_missing > 10 else ''}")
        return

    save_status("syncing", message=f"Enriqueciendo {total_missing} tracks ({total_chunks} chunks)...", extra={
        "total_missing": total_missing,
        "eta_seconds": int(eta_seconds),
    })

    # ── Construir índice rápido de tracks para upsert ────────────────────────
    # Estructura: {track_id: [referencia al dict del track en memoria]}
    # Trabajamos en memoria para hacer el upsert in-place sin re-parsear el JSON.
    track_refs: dict[str, list[dict]] = {}
    for pl in library.get("playlists", []):
        for t in pl.get("tracks_data", []):
            tid = t.get("id")
            if tid:
                if tid not in track_refs:
                    track_refs[tid] = []
                track_refs[tid].append(t)  # referencia directa al dict

    # ── Iterar chunks ─────────────────────────────────────────────────────────
    enriched_count  = 0
    null_count      = 0   # tracks sin features en Spotify (retirados, etc.)
    error_count     = 0

    for chunk_idx in range(total_chunks):
        chunk_start = chunk_idx * chunk_size
        chunk       = missing_ids[chunk_start : chunk_start + chunk_size]

        log(f"[Chunk {chunk_idx + 1}/{total_chunks}] Solicitando features para {len(chunk)} tracks...")

        # ── Llamada a la API ─────────────────────────────────────────────────
        try:
            af_list = sp.audio_features(chunk)
        except Exception as e:
            # Importar SpotifyException sin referencia al scope anterior
            try:
                from spotipy.exceptions import SpotifyException
                if isinstance(e, SpotifyException):
                    retry_after = (getattr(e, "headers", None) or {}).get("Retry-After", "?")
                    if e.http_status == 429:
                        log(f"  Rate Limit 429 en chunk {chunk_idx + 1}. Retry-After: {retry_after}s. "
                            f"Esperando 60s antes de reintentar...", level="warning")
                        time.sleep(60)
                        try:
                            af_list = sp.audio_features(chunk)
                        except Exception as e2:
                            log(f"  Segundo intento fallido en chunk {chunk_idx + 1}: {e2}", level="error")
                            error_count += len(chunk)
                            continue
                    elif e.http_status == 403:
                        log(
                            f"  HTTP 403 en chunk {chunk_idx + 1}: Spotify requiere token OAuth de usuario "
                            f"para audio-features (deprecado para Client Credentials desde mayo 2024).",
                            level="error"
                        )
                        log("  SOLUCION: python enrich_metadata.py --token <SPOTIFY_ACCESS_TOKEN>", level="error")
                        error_count += len(chunk)
                        # Abortar: todos los chunks siguientes daran el mismo 403
                        break
                    else:
                        log(f"  SpotifyException HTTP {e.http_status} en chunk {chunk_idx + 1}: {e}", level="error")
                        error_count += len(chunk)
                        continue
                else:
                    raise
            except ImportError:
                log(f"  Error en chunk {chunk_idx + 1}: {e}", level="error")
                error_count += len(chunk)
                continue

        # ── Parsear respuesta ─────────────────────────────────────────────────
        if not af_list or not isinstance(af_list, list):
            log(f"  Respuesta vacía para chunk {chunk_idx + 1}.", level="warning")
            error_count += len(chunk)
            continue

        chunk_enriched = 0
        for af in af_list:
            # Spotify puede devolver None para tracks retirados o sin features
            if af is None or not isinstance(af, dict) or not af.get("id"):
                null_count += 1
                continue

            tid = af["id"]
            normalized_af = normalize_audio_features(af, tid)

            # Upsert in-place: actualizar todas las referencias al track en memoria
            refs = track_refs.get(tid, [])
            for t_ref in refs:
                t_ref["audio_features"] = normalized_af
                t_ref["bpm"]            = normalized_af["tempo"]
                t_ref["energy"]         = normalized_af["energy"]
                t_ref["danceability"]   = normalized_af["danceability"]
                t_ref["mode"]           = normalized_af["mode"]
                t_ref["key"]            = normalized_af["key"]
                # Actualizar completion_flags si audio_features estaban marcados como missing
                flags = t_ref.get("completion_flags") or []
                if "missing_features" in flags:
                    flags.remove("missing_features")
                    t_ref["completion_flags"] = flags

            chunk_enriched += len(refs)
            enriched_count += 1  # IDs únicos enriquecidos

        log(f"  OK: {chunk_enriched} tracks actualizados en la librería"
            f" ({null_count} sin features en Spotify acumulados).")

        # ── Checkpoint progresivo ─────────────────────────────────────────────
        is_last_chunk = (chunk_idx + 1 == total_chunks)
        if (chunk_idx + 1) % checkpoint_every == 0 and not is_last_chunk:
            log(f"  Guardando checkpoint (cada {checkpoint_every} chunks)...")
            save_library(library, checkpoint=True)

        # ── Throttle ─────────────────────────────────────────────────────────
        if not is_last_chunk:
            log(f"  Esperando {sleep_between_chunks}s...")
            time.sleep(sleep_between_chunks)

    # ── Guardar versión final ─────────────────────────────────────────────────
    save_library(library, checkpoint=False)

    # ── Resumen ──────────────────────────────────────────────────────────────
    log("==========================================")
    log(f"  Enriquecimiento completado.")
    log(f"  IDs unicos enriquecidos: {enriched_count}")
    log(f"  Sin features en Spotify: {null_count}  (tracks retirados)")
    log(f"  Errores de chunk:        {error_count}")
    log("==========================================")

    save_status("done", message=f"Enriquecimiento completado: {enriched_count} IDs", extra={
        "enriched_unique_ids": enriched_count,
        "null_from_spotify":   null_count,
        "chunk_errors":        error_count,
        "total_chunks":        total_chunks,
    })


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Enriquecedor de audio_features — El Francotirador de Metadatos"
    )
    parser.add_argument(
        "--token", type=str, default=None,
        metavar="ACCESS_TOKEN",
        help="Token OAuth de usuario de Spotify (requerido para audio-features).",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Solo reporta huecos sin llamar a la API.",
    )
    parser.add_argument(
        "--chunk-size", type=int, default=100,
        metavar="N",
        help="IDs por chunk (max 100, default: 100).",
    )
    parser.add_argument(
        "--sleep", type=float, default=3.0,
        metavar="SECS",
        help="Segundos de espera entre chunks (default: 3.0).",
    )
    parser.add_argument(
        "--checkpoint", type=int, default=5,
        metavar="N",
        help="Guardar libreria cada N chunks (default: 5).",
    )
    args = parser.parse_args()

    # Validar chunk_size
    if args.chunk_size > 100:
        log("--chunk-size no puede superar 100 (límite del endpoint de Spotify).", level="error")
        sys.exit(1)

    enrich(
        chunk_size=args.chunk_size,
        sleep_between_chunks=args.sleep,
        checkpoint_every=args.checkpoint,
        dry_run=args.dry_run,
        access_token=args.token,
    )


if __name__ == "__main__":
    main()
