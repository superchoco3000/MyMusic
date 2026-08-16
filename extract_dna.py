import json
import os
import sys
import tempfile
import librosa
import numpy as np
import requests
from typing import Dict, Any, Optional

# Krumhansl-Schmuckler Key Profiles for Major and Minor keys
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 2.69, 3.34, 3.17, 3.28])
PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def estimate_key_and_mode(chroma_mean: np.ndarray):
    """
    Estimates key and mode (major/minor) using Krumhansl-Schmuckler correlation.
    Returns: (key_name, mode_val) where mode_val is 1 for Major, 0 for Minor.
    """
    best_corr = -np.inf
    best_key = 'C'
    best_mode = 1  # 1 = Major, 0 = Minor

    for i in range(12):
        chroma_shift = np.roll(chroma_mean, -i)
        
        corr_major = np.corrcoef(chroma_shift, MAJOR_PROFILE)[0, 1]
        corr_minor = np.corrcoef(chroma_shift, MINOR_PROFILE)[0, 1]

        if corr_major > best_corr:
            best_corr = corr_major
            best_key = PITCH_NAMES[i]
            best_mode = 1

        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = PITCH_NAMES[i]
            best_mode = 0

    return best_key, best_mode

def analyze_track_preview(preview_url: str) -> Optional[Dict[str, Any]]:
    """
    Downloads a 30s audio preview and extracts audio DNA using Librosa:
    - bpm: Tempo in Beats Per Minute
    - energy: Normalized RMS energy (0.0 to 1.0)
    - danceability: Rhythm regularity & onset envelope stability (0.0 to 1.0)
    - key: Estimated pitch key ('C', 'F#', etc.)
    - mode: 1 (Major) or 0 (Minor)
    """
    if not preview_url:
        return None

    temp_path = None
    try:
        # 1. Download audio fragment
        response = requests.get(preview_url, timeout=10)
        if response.status_code != 200 or len(response.content) < 1000:
            return None

        # Determine appropriate file extension (.mp3 or .m4a)
        suffix = ".m4a" if ".m4a" in preview_url.lower() else ".mp3"

        # Create temporary file and close it immediately after writing so librosa can open it on Windows
        fd, temp_path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(response.content)

        # 2. Load audio waveform with Librosa (22.05 kHz sampling rate)
        y, sr = librosa.load(temp_path, sr=22050)
        if len(y) == 0:
            return None

        # 3. Extract BPM / Tempo
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(np.atleast_1d(tempo)[0])

        # 4. Extract RMS Energy (normalized 0.0 to 1.0)
        rms = librosa.feature.rms(y=y)[0]
        mean_rms = float(np.mean(rms))
        energy = float(np.clip(mean_rms / 0.30, 0.0, 1.0))

        # 5. Extract Danceability / Rhythm Regularity
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
        pulse_regularity = float(np.mean(pulse))
        danceability = float(np.clip(pulse_regularity * 2.5, 0.0, 1.0))

        # 6. Extract Key & Mode using Chroma CQT
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        musical_key, mode = estimate_key_and_mode(chroma_mean)

        return {
            "bpm": round(bpm, 1),
            "energy": round(energy, 2),
            "danceability": round(danceability, 2),
            "key": musical_key,
            "mode": mode,
        }

    except Exception as e:
        print(f"[DNA Extractor] Error processing preview: {e}", file=sys.stderr)
        return None

    finally:
        # Guarantee cleanup of temporary file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass

def process_track_batch(tracks_input: list, output_filepath: str = "public/data/audio_dna.json"):
    """
    Processes a list of track items [{id, name, preview_url}, ...]
    and updates/saves the result into output_filepath JSON database.
    """
    db = {}
    if os.path.exists(output_filepath):
        try:
            with open(output_filepath, "r", encoding="utf-8") as f:
                db = json.load(f)
        except Exception:
            db = {}

    processed_count = 0
    for item in tracks_input:
        track_id = item.get("id")
        preview_url = item.get("preview_url")

        if not track_id:
            continue

        # Skip if already extracted
        if track_id in db:
            continue

        print(f"-> Extracting DNA for '{item.get('name', track_id)}'...")
        dna = analyze_track_preview(preview_url)
        if dna:
            db[track_id] = dna
            processed_count += 1
            print(f"   [OK] BPM: {dna['bpm']} | Energy: {dna['energy']} | Key: {dna['key']} ({'Maj' if dna['mode']==1 else 'Min'})")
        else:
            print("   [SKIP] No valid audio preview available.")

    # Save output JSON
    os.makedirs(os.path.dirname(output_filepath), exist_ok=True)
    with open(output_filepath, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)

    print(f"\n[Done] Processed {processed_count} new tracks. Total DB size: {len(db)} items in {output_filepath}.")

if __name__ == "__main__":
    # Test script directly with live song
    print("Testing DNA Extraction with a live audio preview...")
    try:
        # Standard MP3 preview test URL
        preview = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
        print(f"Testing with MP3 preview URL: {preview}")
        res = analyze_track_preview(preview)
        print("Extracted DNA Result:\n", json.dumps(res, indent=2))
    except Exception as err:
        print("Test error:", err)