# ICC UX/UI Media Automation Pipeline

This directory contains the automated media generation, optimization, and validation toolset developed for the **International Crator Cup (ICC)** site.

The pipeline parses high-level visual descriptions, generates raw media assets via Google GenAI APIs (Gemini/Imagen/Veo), optimizes them for web deployment (resizing, transcoding, looping, compressing), and validates them against strict visual compliance guidelines.

---

## 1. Installation & Setup

### Prerequisites
- **Python**: version 3.8 or higher.
- **FFmpeg & FFprobe**: Required for video transcoding, audio stripping, crossfading, poster frame extraction, and video property validation.
  - **Windows**: Download from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) or install via winget:
    ```powershell
    winget install "FFmpeg (Essentials Build)"
    ```
    Ensure `ffmpeg` and `ffprobe` are added to your system's `PATH`.
  - **macOS**: Install via Homebrew:
    ```bash
    brew install ffmpeg
    ```
  - **Linux**: Install via APT:
    ```bash
    sudo apt update && sudo apt install ffmpeg
    ```

### Install Dependencies
Run the following command to install the required Python packages:
```bash
pip install -r requirements.txt
```

### Environment Configuration
Copy the `.env.template` file to `.env` and fill in the values:
```bash
cp .env.template .env
```

---

## 2. Configuration Guide

The pipeline is configured via environment variables defined in the `.env` file or directly in the shell:

| Environment Variable | Default Value | Description |
|---|---|---|
| `GEMINI_API_KEY` | *(None, Required)* | Your Google AI Studio API key. |
| `MOCK_API` | `"false"` | If set to `"true"`, bypasses real Gemini API calls and generates programmatically compliant mock images and videos locally. |
| `TEST_MODE` | `"online"` | Set to `"offline"` to block outbound network calls and force mock asset generation (crucial for local testing). |
| `OUTPUT_DIR` | `"web/assets"` | Target directory where the final optimized assets (.png, .webp, .avif, .mp4, .webm) are saved. |
| `CACHE_DIR` | `"ux_ui_media_team/raw_cache"` | Directory where raw assets retrieved from the GenAI APIs are stored before optimization. |
| `MAX_RETRIES` | `3` | Maximum number of retry attempts for remote API calls (handles rate limits with exponential backoff). |
| `TEMPERATURE` | `0.2` | Controls creativity/temperature of Gemini text/metadata generative queries. |

---

## 3. CLI Usage Guide

The main entry point for the automation tool is `ux_ui_media_team/run.py`.

### Basic Command
To generate and optimize assets for all pages:
```bash
python ux_ui_media_team/run.py
```

### Command Line Options

- **`--page <page_name>`**: Specifies a single page target to process, skipping the others.
  - *Supported values*: `homepage`, `investors`, `leaderboard`, `press`, `onepager`, `teaser`, `og-cover`.
  - *Example*:
    ```bash
    python ux_ui_media_team/run.py --page investors
    ```

- **`--dry-run`**: Parses the prompts from `docs/MEDIA_PROMPTS.md` and validates config and directories without calling the generation or optimization engines.
  - *Example*:
    ```bash
    python ux_ui_media_team/run.py --dry-run
    ```

- **`--force`**: Forces the pipeline to overwrite existing assets in the output and cache directories, bypassing the default incremental sync check.
  - *Example*:
    ```bash
    python ux_ui_media_team/run.py --force
    ```

### Concurrency Lock
To prevent corrupting files during concurrent execution pipelines, the script creates a lock file at `ux_ui_media_team/run.lock`.
- If the lock file is present, the script exits with code `1`.
- If the lock file is older than 10 minutes (stale), the script automatically clears it and recovers execution.

---

## 4. Asset Mapping Table

The following table details how the generated assets are mapped to the 7 pages of the ICC website:

| Page / Target | Output Filename(s) | Asset Type | Target Resolution | Description |
|---|---|---|---|---|
| **Homepage `/`** | `homepage.webm`<br>`homepage.mp4`<br>`homepage-poster.jpg`/`webp`/`avif` | Video (Loop) + Poster | 1920×1080 | Humanoid robot standing on the Moon with a soccer ball. Low-gravity regolito dust settling. |
| **Investors** | `investors.png`<br>`investors.webp`<br>`investors.avif` | Image (Static) | 2560×1440 | Ultra-wide lunar valley showing a tiny robot next to a soccer ball (8% frame scale). |
| **Leaderboard** | `leaderboard.png`<br>`leaderboard.webp`<br>`leaderboard.avif` | Image (Static) | 1920×1080 | Macro detail of lunar regolito and a single soccer ball impact imprint. Very dark background. |
| **Press** | `press.png`<br>`press.webp`<br>`press.avif` | Image (Static) | 2560×1440 | Product-style profile shot (waist up) of the robot with gold rim lighting against pure black. |
| **Onepager** | `onepager.png`<br>`onepager.webp`<br>`onepager.avif` | Image (Static) | 1920×1080 | Curvature of the lunar limb against space. A gold light line highlighting the horizon. |
| **Teaser** | `teaser.webm`<br>`teaser.mp4`<br>`teaser-poster.jpg`/`webp`/`avif` | Video (Teaser) + Poster | 1920×1080 | Close-up shot of the ball leaving the robot's foot, spinning slowly into the black void. |
| **Social Cover** | `og-cover.png`<br>`og-cover.webp`<br>`og-cover.avif` | Image (Social) | 1200×630 | Social preview cover featuring the wide valley, leaving the left third empty for text overlays. |

---

## 5. Visual Compliance Guidelines

Every generated asset undergoes programmatic checks in `validator.py` to ensure it strictly respects the project's art direction (conforming to SpaceX visual design):

1. **Negative Left-Third Space**:
   - The left-third (`x < width/3`) must be completely empty and dark (background sky/regolito) to house HTML overlays.
   - Programmatic Rule: Standard deviation of pixel values in the left-third must be `< 30.0`, and mean brightness `< 50.0`.
2. **Subject in Right-Third**:
   - The primary subject (robot, ball, or crater detail) must reside in the right-third (`x > 2*width/3`).
   - Programmatic Rule: Standard deviation of pixel values in the right-third must be `> 10.0` (indicating detail/variance).
3. **No Embedded Text / Logos**:
   - Any words, branding logos, or watermarks will cause validation failure (OCR compliance).
   - Programmatic Rule: Heuristic edge transition analysis detects sharp vertical contrast runs typical of digital text.
4. **Color Palette Constraints**:
   - Monochromatic grayscales (negros, gris regolito, blanco puro) with **only one gold accent color** (`#ffd35b` / BGR `(91, 211, 255)`) representing the rim light or horizon line. No magentas or cyans allowed.
5. **Exposure Check**:
   - Average pixel brightness must be between `10.0` (not pitch black) and `220.0` (not washed out) to survive the `brightness(.5)` post-processing filter applied via CSS backdrop filters.

---

## 6. Video Optimization Technical Details

Videos generated by APIs like Google Veo require specialized compression and adjustment pipelines handled by `optimizer.py`:

- **Transcoding Codecs**:
  - **Primary**: AV1 codec (`.webm` output using `libsvtav1`, fallback to `libaom-av1` or `libvpx-vp9`). Recommended for its superior compression and low bitrate.
  - **Fallback**: H.264 codec (`.mp4` output using `libx264` with `-movflags +faststart` to enable instant progressive loading).
- **Audio Stripping**:
  - Automatically applies the `-an` flag to strip all audio channels. The site serves videos `muted` + `playsinline`, and CDNs/browsers require completely silent streams to save bandwidth.
- **0.5s Seamless Crossfade Looping**:
  - Raw videos are generated with a slightly longer duration. The optimizer splits the video, trims the main body, and applies a `0.5` seconds `xfade` filter between the end and the start to generate a visually seamless, infinite loop for the homepage hero backdrop.
- **Poster Extraction**:
  - Extracts the first frame from the video as a JPEG, resizes it to `1920×1080`, and runs an iterative quality reduction loop until the poster size is strictly **less than 150 KB**. The poster is then transcoded into WebP and AVIF formats as lightweight fallbacks.
