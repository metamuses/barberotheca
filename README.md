# Barberotheque

Group project for the Semantic Digital Libraries 2025/26 course.

A digital library of Alessandro Barbero's lectures in audio and text form.

## Process

### Manual search
Searched on YouTube some videos of Alessandro Barbero's lectures and compiled a
csv with basic metadata of each video.

### Audio download
Downloaded the audio of each video using `yt-dlp` into M4A format.

```shell
# extract all youtube URLs into a batch file
tail -n +2 metadata/barbero.csv | cut -d',' -f1 > .yt-dlp/barbero.lst

# download m4a audio files with yt-dlp
yt-dlp \
  --format bestaudio[ext=m4a] \
  --extract-audio --audio-format m4a \
  --sleep-interval 30 --limit-rate 5M \
  --batch-file .yt-dlp/barbero.lst --download-archive .yt-dlp/barbero.log \
  --output "audio/barbero-%(extractor)s-%(id)s.%(ext)s"
```

### Semantic renaming
Compiled the `metadata/barbero.csv` with the reasoned semantic filenames, adding the
column `semantic_filename` and filling it manually.
Then renamed all files in the `compressed/` folder to their semantic filenames
using the script `scripts/rename_files.py`.

### Whisper transcription
Transcribed each audio file using OpenAI Whisper in Italian language using the
`turbo` model.

```shell
for file in audio/*.m4a; do
  whisper "$file" \
    --model turbo \
    --language it \
    --task transcribe \
    --output_format all \
    --output_dir transcripts/
done
```

### Keywords/entities extraction
Extracted keywords and named entities from each transcript txt file using SpaCy
NLP model for italian (`it_core_news_lg`), saving the results as CSV files in
the `keywords/` and `entities/` folders.

```shell
python scripts/keywords.py
```

### Manual compilation of keywords
Added manually a list of reasoned keywords for each lecture in the
`metadata/barbero.csv` file in the columns `keywords` and `entities`.

### Audio compression
We compressed the audio files to reduce their size for easier storage and
handling after the higher fidelity version, used for transcription, was no longer
needed.  
We chose to compress to AAC format with 48kbps bitrate, mono channel, and 22050Hz
sample rate, which provides a good balance between audio quality and file size
for spoken word content like lectures.

```bash
for file in audio/*.m4a; do
  ffmpeg -i "$file" \
    -c:a aac -b:a 48k \
    -ac 1 -ar 22050 \
    "compressed/$(basename "$f")"
done
```

## Disclaimer

This repository and all files contained within are used solely for educational
purposes as part of a university project. No copyright infringement is intended.
All media, texts, and materials remain the property of their respective owners
and are included or referenced here only for academic, non-commercial use.

## Team members
- [Tommaso Barbato](https://github.com/epistrephein)
- [Martina Uccheddu](https://github.com/martinaucch)
