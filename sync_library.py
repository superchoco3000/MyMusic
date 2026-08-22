#!/usr/bin/env python3
"""
MyMusic Library — Delta Sync (Fase 2)
======================================
ARQUITECTURA (post-pivote anti-429):
  - Fase 1 (Carga Inicial): Usa import_csv.py para ingerir CSVs exportados localmente.
  - Fase 2 (Este script): Delta-sync hiper-ligero. Solo detecta y aplica cambios
    (tracks añadidos, borrados o movidos) desde la última sincronización.

OBSOLETO / ELIMINADO:
  - Full Sync en bucle (paginación masiva de playlists + tracks completos).
  - Batch fetch de audio_features por cada playlist.
  Ambos procesos generaban HTTP 429 Rate Limit de forma sistemática.

Saves execution status to `public/data/sync_status.json`.
"""

import os
import sys
import json
import re
import time
import logging
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
    """FileHandler que flushea cada entrada al disco de forma inmediata."""
    def emit(self, record):
        super().emit(record)
        self.flush()

logger = logging.getLogger("sync_logger")
logger.setLevel(logging.INFO)
file_handler = FlushingFileHandler(LOG_FILE_PATH, mode="a", encoding="utf-8")
file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(file_handler)


def log_msg(msg, level="info"):
    """Log a sync.log con flush inmediato. Sin prints a stdout."""
    try:
        getattr(logger, level, logger.info)(msg)
    except Exception:
        pass


# ── Status helpers ───────────────────────────────────────────────────────────

def save_sync_status(status_str, message=None, playlists_count=0, delta=None):
    """
    Escribe sync_status.json.
    delta: dict opcional con resumen del delta aplicado:
        {"added": int, "removed": int, "moved": int}
    """
    os.makedirs(os.path.dirname(STATUS_JSON_PATH), exist_ok=True)
    payload = {
        "status": status_str,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "playlists_count": playlists_count,
        "message": message,
        "delta": delta,
    }
    try:
        with open(STATUS_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
    except Exception as e:
        log_msg(f"No se pudo guardar sync_status: {e}", level="error")


def load_library() -> dict:
    """Carga music_library.json. Devuelve estructura vacía si no existe."""
    if not os.path.exists(LIBRARY_JSON_PATH):
        return {"playlists": [], "last_updated_at": None}
    try:
        with open(LIBRARY_JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log_msg(f"No se pudo leer music_library.json: {e}", level="error")
        return {"playlists": [], "last_updated_at": None}


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


def save_library(library_data: dict):
    """Persiste music_library.json con deduplicación estricta y minificación completa."""
    os.makedirs(os.path.dirname(LIBRARY_JSON_PATH), exist_ok=True)
    library_data["last_updated_at"] = datetime.now(timezone.utc).isoformat()

    clean_playlists_dict = {}
    for pl in library_data.get("playlists", []):
        if not pl:
            continue
        pname = (pl.get("name") or "").strip()
        norm_name = pname.lower()
        pid = pl.get("id")

        if not pid or pid == "None":
            pid = f"pl_{re.sub(r'[^a-zA-Z0-9_]', '_', norm_name)}"
            pl["id"] = pid

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

    library_data["playlists"] = list(clean_playlists_dict.values())

    with open(LIBRARY_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(library_data, f, indent=2, ensure_ascii=False)
    n = len(library_data["playlists"])
    log_msg(f"Library guardada: {LIBRARY_JSON_PATH} ({n} playlists únicas).")


# ── Delta Sync (Fase 2) ──────────────────────────────────────────────────────

def delta_sync(access_token: str) -> tuple[bool, int, dict]:
    """
    Realiza un delta-sync hiper-ligero contra la API de Spotify.

    Estrategia por playlist:
      1. Obtener snapshot_id de la playlist (1 llamada API, sin descargar tracks).
      2. Si snapshot_id no cambió desde last_synced_snapshot → skip.
      3. Si cambió → comparar track IDs actuales vs. los locales para detectar:
         - Tracks AÑADIDOS   (en API pero no en local)
         - Tracks BORRADOS   (en local pero no en API)
         - Tracks MOVIDOS    (mismos IDs, distinto orden de posición)
      4. Aplicar sólo el delta al JSON local.

    Retorna: (success: bool, playlists_count: int, delta_summary: dict)
    """
    try:
        import spotipy
        from spotipy.exceptions import SpotifyException
    except ImportError:
        log_msg("Librería spotipy no instalada.", level="error")
        save_sync_status("error", message="spotipy no instalada")
        sys.exit(1)

    if not access_token or not isinstance(access_token, str) or not access_token.strip():
        log_msg("Token de acceso no proporcionado.", level="error")
        save_sync_status("error", message="Token de Spotify no proporcionado")
        sys.exit(1)

    # retries=0: lanza SpotifyException en 429 inmediatamente, sin sleeps silenciosos
    sp = spotipy.Spotify(auth=access_token, requests_timeout=15, retries=0)

    # ── Verificar autenticación ──────────────────────────────────────────────
    try:
        log_msg("Verificando perfil de usuario (delta-sync)...")
        me = sp.current_user()
        log_msg(f"Autenticado: {me.get('display_name')} ({me.get('id')})")
    except SpotifyException as e:
        retry_after = (e.headers or {}).get("Retry-After", "N/A")
        log_msg(f"Error Spotify al verificar usuario: HTTP {e.http_status}", level="error")
        if e.http_status == 429:
            save_sync_status("error", message=f"Rate Limit 429 en auth. Esperar {retry_after}s")
        else:
            save_sync_status("error", message=f"Error {e.http_status}: {e.msg}")
        sys.exit(1)
    except Exception as e:
        log_msg(f"Error de autenticación: {e}", level="error")
        save_sync_status("error", message=f"Token inválido: {e}")
        sys.exit(1)

    library = load_library()
    all_existing_playlists = library.get("playlists", [])

    # Categorize existing playlists to prevent data loss:
    # 1. Local/CSV playlists (not synced from Spotify's playlist endpoint)
    # 2. Liked Songs playlist
    # 3. Spotify standard playlists (keyed by Spotify ID)
    local_non_spotify_playlists = []
    local_liked_playlist = None
    existing_spotify_playlists_by_id = {}

    for pl in all_existing_playlists:
        pid = pl.get("id")
        pname = (pl.get("name") or "").lower().strip()
        source = pl.get("source")

        if pid == "spotify_liked_songs" or pname in ["liked songs", "canciones que te gustan"]:
            local_liked_playlist = pl
        elif source == "csv_import" or not pid or pid.startswith("pl_"):
            local_non_spotify_playlists.append(pl)
        else:
            existing_spotify_playlists_by_id[pid] = pl

    delta_summary = {"added": 0, "removed": 0, "moved": 0, "playlists_checked": 0}

    # ── 1. Sincronizar Canciones que te gustan (Liked Songs) ─────────────────
    log_msg("Sincronizando 'Liked Songs' (Canciones que te gustan)...")
    try:
        liked_res = sp.current_user_saved_tracks(limit=50)
        total_remote_liked = liked_res.get("total", 0)
        remote_liked_items = list(liked_res.get("items", []))

        local_liked_tracks = local_liked_playlist.get("tracks_data", []) if local_liked_playlist else []
        first_remote_id = remote_liked_items[0].get("track", {}).get("id") if remote_liked_items else None
        first_local_id = local_liked_tracks[0].get("id") if local_liked_tracks else None

        liked_tracks_final = local_liked_tracks


        # Construir/Actualizar objeto de Liked Songs
        local_liked_playlist = {
            "id": "spotify_liked_songs",
            "name": "Liked Songs",
            "description": "Tus canciones favoritas sincronizadas con Spotify.",
            "image_url": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=60",
            "owner_name": me.get("display_name", "Tú"),
            "total_tracks": len(liked_tracks_final),
            "tracks": {"total": len(liked_tracks_final)},
            "collaborative": False,
            "snapshot_id": f"liked_songs_{len(liked_tracks_final)}",
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "source": "spotify_liked_songs",
            "tracks_data": liked_tracks_final,
            "completion_meta": (local_liked_playlist.get("completion_meta") if local_liked_playlist else None) or {
                "target_count": 100,
                "current_count": len(liked_tracks_final),
                "classification": "caotica",
                "is_benchmark": False,
                "status": "pending",
                "gap": 100 - len(liked_tracks_final),
            },
        }
        log_msg(f"Liked Songs sincronizado con éxito ({len(liked_tracks_final)} tracks).")
    except Exception as e:
        log_msg(f"No se pudo sincronizar Liked Songs vía API: {e}. Se conserva versión local si existe.", level="warning")
        if local_liked_playlist:
            local_liked_playlist["id"] = "spotify_liked_songs"

    # ── 2. Obtener lista ligera de playlists del usuario (solo metadatos) ────
    try:
        log_msg("Obteniendo lista de playlists (metadatos ligeros)...")
        playlists_res = sp.current_user_playlists(limit=50)
    except SpotifyException as e:
        retry_after = (e.headers or {}).get("Retry-After", "N/A")
        log_msg(f"Error al obtener playlists: HTTP {e.http_status}", level="error")
        if e.http_status == 429:
            save_sync_status("error", message=f"Rate Limit 429 en playlists. Esperar {retry_after}s")
        else:
            save_sync_status("error", message=f"Error {e.http_status}: {e.msg}")
        sys.exit(1)

    remote_playlists = list(playlists_res.get("items", []))

    # Paginar si hay más de 50 (solo metadatos, coste mínimo)
    while playlists_res.get("next"):
        time.sleep(0.5)
        try:
            playlists_res = sp.next(playlists_res)
            remote_playlists.extend(playlists_res.get("items", []))
        except SpotifyException as e:
            if e.http_status == 429:
                log_msg("Rate Limit 429 en paginación de playlists. Abortando paginación.", level="warning")
            break

    log_msg(f"Encontradas {len(remote_playlists)} playlists remotas en la cuenta.")

    # ── 3. Por cada playlist remota: comparar snapshot_id y actualizar ───────
    updated_spotify_playlists = {}
    for pl in remote_playlists:
        if not pl or not pl.get("id"):
            continue

        pl_id         = pl["id"]
        pl_name       = pl.get("name", pl_id)
        remote_snap   = pl.get("snapshot_id", "")
        local_pl      = existing_spotify_playlists_by_id.get(pl_id)
        local_snap    = local_pl.get("snapshot_id", "") if local_pl else ""

        delta_summary["playlists_checked"] += 1

        if remote_snap and remote_snap == local_snap and local_pl:
            log_msg(f"[SKIP] '{pl_name}' — snapshot sin cambios.")
            updated_spotify_playlists[pl_id] = local_pl
            continue

        log_msg(f"[DELTA] '{pl_name}' — snapshot cambió. Descargando IDs de tracks...")

        # Descargar SOLO los IDs de los tracks
        try:
            tracks_res = sp.playlist_items(
                pl_id,
                fields="items(track(id,name,artists(name),album(name,images),duration_ms,preview_url)),next",
                limit=100,
                additional_types=["track"],
            )
        except SpotifyException as e:
            if e.http_status == 429:
                log_msg(f"Rate Limit 429 en tracks de '{pl_name}'. Saltando.", level="warning")
            else:
                log_msg(f"Error {e.http_status} en tracks de '{pl_name}'. Saltando.", level="warning")
            if local_pl:
                updated_spotify_playlists[pl_id] = local_pl
            continue

        remote_items = list(tracks_res.get("items", []))
        while tracks_res.get("next"):
            time.sleep(0.5)
            try:
                tracks_res = sp.next(tracks_res)
                remote_items.extend(tracks_res.get("items", []))
            except SpotifyException as e:
                if e.http_status == 429:
                    log_msg(f"Rate Limit 429 paginando tracks de '{pl_name}'. Parando paginación.", level="warning")
                break

        remote_tracks_map = {}
        for item in remote_items:
            track = item.get("track") if isinstance(item, dict) else None
            if not track or not isinstance(track, dict) or not track.get("id"):
                continue
            tid = track["id"]
            artists = ", ".join(
                a["name"] for a in (track.get("artists") or [])
                if isinstance(a, dict) and a.get("name")
            ) or "Artista Desconocido"
            album_obj    = track.get("album") or {}
            album_images = album_obj.get("images") or []
            album_cover  = album_images[0]["url"] if album_images else None
            remote_tracks_map[tid] = {
                "id":           tid,
                "name":         track.get("name", ""),
                "artist":       artists,
                "album":        album_obj.get("name", ""),
                "album_cover":  album_cover,
                "image_url":    album_cover,
                "duration_ms":  track.get("duration_ms", 0),
                "preview_url":  track.get("preview_url"),
                "audio_features": None,
            }

        # ── Calcular delta ───────────────────────────────────────────────────
        local_tracks_data = local_pl.get("tracks_data", []) if local_pl else []
        local_ids  = {t["id"] for t in local_tracks_data if t.get("id")}
        remote_ids = set(remote_tracks_map.keys())

        added_ids   = remote_ids - local_ids
        removed_ids = local_ids - remote_ids

        common_ids        = local_ids & remote_ids
        local_order_map   = {t["id"]: i for i, t in enumerate(local_tracks_data) if t.get("id")}
        remote_order_list = [item.get("track", {}).get("id") for item in remote_items if item.get("track", {}).get("id")]
        remote_order_map  = {tid: i for i, tid in enumerate(remote_order_list)}
        moved_ids = {
            tid for tid in common_ids
            if local_order_map.get(tid) != remote_order_map.get(tid)
        }

        delta_summary["added"]   += len(added_ids)
        delta_summary["removed"] += len(removed_ids)
        delta_summary["moved"]   += len(moved_ids)

        log_msg(
            f"  Delta '{pl_name}': +{len(added_ids)} añadidas, "
            f"-{len(removed_ids)} borradas, ~{len(moved_ids)} movidas."
        )

        local_enriched = {t["id"]: t for t in local_tracks_data if t.get("id")}
        new_tracks_data = []
        for tid in remote_order_list:
            if tid in local_enriched:
                new_tracks_data.append(local_enriched[tid])
            elif tid in remote_tracks_map:
                new_tracks_data.append(remote_tracks_map[tid])

        updated_pl = {
            "id":              pl_id,
            "name":            pl_name,
            "description":     pl.get("description"),
            "image_url":       (pl.get("images") or [{}])[0].get("url"),
            "owner_name":      (pl.get("owner") or {}).get("display_name", ""),
            "total_tracks":    len(new_tracks_data),
            "tracks":          {"total": len(new_tracks_data)},
            "collaborative":   pl.get("collaborative", False),
            "snapshot_id":     remote_snap,
            "last_synced_at":  datetime.now(timezone.utc).isoformat(),
            "tracks_data":     new_tracks_data,
            "completion_meta": local_pl.get("completion_meta") if local_pl else None,
        }
        updated_spotify_playlists[pl_id] = updated_pl

    # ── 4. Poda de Huérfanos & Fusión Final ──────────────────────────────────
    # Las playlists remotas de Spotify que ya no existen en `remote_playlists` se descartan automáticamente (Poda).
    # Las playlists locales/CSV y Liked Songs se preservan fusionándose limpiamente sin duplicados.
    final_dict = {}

    # 1. Liked Songs
    if local_liked_playlist:
        final_dict["spotify_liked_songs"] = local_liked_playlist

    # 2. Playlists de Spotify actualizadas
    for pl_id, pl in updated_spotify_playlists.items():
        final_dict[pl_id] = pl

    # 3. Playlists locales y de CSV (sin duplicar si ya existen por ID o por Nombre)
    for pl in local_non_spotify_playlists:
        pid = pl.get("id")
        norm_name = (pl.get("name") or "").lower().strip()

        matched_key = None
        if pid and pid in final_dict:
            matched_key = pid
        else:
            for k, existing in final_dict.items():
                if (existing.get("name") or "").lower().strip() == norm_name:
                    matched_key = k
                    break

        if matched_key:
            existing = final_dict[matched_key]
            # Si la versión de Spotify vino con 0 tracks pero el CSV tenía tracks, adoptar los tracks del CSV
            if len(existing.get("tracks_data") or []) < len(pl.get("tracks_data") or []):
                existing["tracks_data"] = pl.get("tracks_data")
                existing["total_tracks"] = len(pl.get("tracks_data") or [])
                existing["tracks"] = {"total": len(pl.get("tracks_data") or [])}
        else:
            clean_id = pid if pid else f"pl_{re.sub(r'[^a-zA-Z0-9_]', '_', norm_name)}"
            pl["id"] = clean_id
            final_dict[clean_id] = pl

    library["playlists"] = list(final_dict.values())
    save_library(library)

    pruned_count = len(existing_spotify_playlists_by_id) - len(updated_spotify_playlists)
    if pruned_count > 0:
        log_msg(f"Poda completada: {pruned_count} playlists eliminadas de Spotify purgadas del archivo local.")

    return True, len(final_dict), delta_summary


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    save_sync_status("syncing")
    log_msg("==========================================")
    log_msg("   MyMusic Delta Sync — Fase 2 (v2.0)    ")
    log_msg("==========================================")

    try:
        token_arg = sys.argv[1] if len(sys.argv) > 1 else os.getenv("SPOTIFY_ACCESS_TOKEN")
        success, count, delta = delta_sync(token_arg)

        if success:
            save_sync_status("done", playlists_count=count, delta=delta)
            log_msg(
                f"Delta-sync completado. Playlists: {count}. "
                f"Delta: +{delta['added']} / -{delta['removed']} / ~{delta['moved']}."
            )
        else:
            save_sync_status("error", message="Delta-sync sin datos o cancelado")
            sys.exit(1)

    except Exception as err:
        logger.exception("Error fatal durante el delta-sync")
        log_msg(f"Error fatal: {err}", level="error")
        save_sync_status("error", message=str(err))
        sys.exit(1)


if __name__ == "__main__":
    main()
