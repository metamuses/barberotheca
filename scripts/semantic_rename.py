"""
Rename audio and transcript files based on CSV mapping of computed/semantic names.
"""

from pathlib import Path
import csv
import shutil

ROOT_DIR = Path(__file__).resolve().parent.parent
CSV_FILE = ROOT_DIR / "metadata" / "barbero.csv"

DIRS_EXTS_RENAMES = {
    ROOT_DIR / "audio": [".m4a"],
    ROOT_DIR / "transcripts": [".srt", ".txt"],
}

with open(CSV_FILE, encoding="utf-8") as csv_file:
    csv_reader = csv.DictReader(csv_file)
    for row in csv_reader:
        for directory, extensions in DIRS_EXTS_RENAMES.items():
            for ext in extensions:
                src = directory / f"{row['computed_filename']}{ext}"
                dst = directory / f"{row['semantic_filename']}{ext}"

                if src.exists():
                    shutil.move(src, dst)
                    print(f"✅ Renamed: {src.name} → {dst.name}")
                else:
                    print(f"⚠️ Missing: {src.name}")
