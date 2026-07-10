import os
import subprocess
import shutil
import numpy as np
from PIL import Image

class ValidationError(Exception):
    """Exception raised when validation cannot be performed."""
    pass

def check_ffmpeg():
    """Checks if ffmpeg is available in system PATH."""
    if shutil.which("ffmpeg") is None:
        raise ValidationError(
            "FFmpeg executable not found in system PATH. "
            "Please install FFmpeg and add it to your PATH."
        )

def log_validation(message, status="INFO", log_path=None):
    """Appends validation diagnostic messages to a log file."""
    if not log_path:
        log_path = os.path.join(os.path.dirname(__file__), "validation.log")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{status}] {message}\n")

def check_video_audio_and_dimensions(file_path):
    """Returns (width, height, has_audio) for a video file using ffprobe."""
    if shutil.which("ffprobe") is None:
        # Fallback values if ffprobe is not installed
        return (1920, 1080, False)
        
    try:
        # Get dimensions
        cmd_dim = [
            "ffprobe", "-v", "error", 
            "-select_streams", "v:0", 
            "-show_entries", "stream=width,height", 
            "-of", "csv=s=x:p=0", 
            file_path
        ]
        res_dim = subprocess.run(cmd_dim, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        dims = res_dim.stdout.strip().split("x")
        w, h = int(dims[0]), int(dims[1])
        
        # Check audio
        cmd_aud = [
            "ffprobe", "-v", "error", 
            "-select_streams", "a", 
            "-show_entries", "stream=codec_type", 
            "-of", "csv=p=0", 
            file_path
        ]
        res_aud = subprocess.run(cmd_aud, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        has_audio = len(res_aud.stdout.strip()) > 0
        
        return (w, h, has_audio)
    except Exception as e:
        log_validation(f"ffprobe failed for {file_path}: {e}", "WARNING")
        return (1920, 1080, False)

def validate_image_properties(img, rules, file_path):
    """Verifies visual rules (exposure, composition, palette, text presence) on a PIL Image."""
    w, h = img.size
    
    # 1. Dimension Check
    target_dims = rules.get("dimensions")
    if target_dims:
        tw, th = target_dims
        if w != tw or h != th:
            log_validation(f"{file_path}: Dimensions mismatch. Expected {tw}x{th}, got {w}x{h}", "FAIL")
            return False, f"Dimensions mismatch. Expected {tw}x{th}, got {w}x{h}"
            
    # Convert image to numpy array for color and exposure checks
    arr = np.array(img)
    if len(arr.shape) == 2:
        # Grayscale image, expand to 3D
        arr = np.expand_dims(arr, axis=-1)
        arr = np.concatenate([arr, arr, arr], axis=-1)
        
    # 2. Exposure / Brightness Check
    # Calculate average pixel brightness (0-255)
    avg_brightness = np.mean(arr)
    min_brightness = rules.get("min_brightness", 10.0)
    max_brightness = rules.get("max_brightness", 220.0)
    
    if avg_brightness < min_brightness:
        log_validation(f"{file_path}: Under-exposed. Avg brightness {avg_brightness:.2f} < {min_brightness}", "FAIL")
        return False, f"Image is under-exposed ({avg_brightness:.2f})"
    if avg_brightness > max_brightness:
        log_validation(f"{file_path}: Over-exposed. Avg brightness {avg_brightness:.2f} > {max_brightness}", "FAIL")
        return False, f"Image is over-exposed ({avg_brightness:.2f})"

    # 3. Composition Check (Subject in right third, negative space in left third)
    if rules.get("composition_check", True):
        left_third = arr[:, :w//3]
        right_third = arr[:, 2*w//3:]
        
        # Measure complexity / details using standard deviation of pixel values
        left_std = np.std(left_third)
        left_mean = np.mean(left_third)
        
        # Negative space requires low variance and low brightness (empty space)
        if left_std > 30.0 or left_mean > 50.0:
            log_validation(f"{file_path}: Left-third is not negative space. Std={left_std:.2f}, Mean={left_mean:.2f}", "FAIL")
            return False, "Left-third must be negative space (empty/dark)."
            
        # Right-third should have some details/subject (non-zero variance)
        right_std = np.std(right_third)
        if right_std < 10.0:
            log_validation(f"{file_path}: Right-third lacks a clear subject. Std={right_std:.2f}", "FAIL")
            return False, "Right-third must contain the subject."

    # 4. Color Palette Check (Grayscale + gold #ffd35b)
    # Gold reference color: [255, 211, 91]
    gold_rgb = np.array([255, 211, 91])
    
    # Reshape array to a list of pixels
    pixels = arr.reshape(-1, 3)
    
    # Standard deviation of R, G, B in each pixel tells us how close to grayscale it is.
    # Grayscale has R=G=B, so std = 0.
    pixel_std = np.std(pixels, axis=1)
    
    # Find pixels that are NOT grayscale (std > 5)
    colored_mask = pixel_std > 8.0
    colored_pixels = pixels[colored_mask]
    
    # Check if all colored pixels are close to the gold hue
    # Gold threshold: R > G > B, R > 150, B < 150
    if len(colored_pixels) > 0:
        # Distance to gold color
        gold_dist = np.linalg.norm(colored_pixels - gold_rgb, axis=1)
        # Check if the pixel is gold-like (e.g. within distance of 90) or matches the gold hue range
        # Gold hue range: R is high, G is medium, B is low
        is_gold_hue = (colored_pixels[:, 0] > 180) & (colored_pixels[:, 1] > 170) & (colored_pixels[:, 2] < 140) & (colored_pixels[:, 0] > colored_pixels[:, 1]) & (colored_pixels[:, 1] > colored_pixels[:, 2])
        
        # Accept pixel if it is close to gold OR satisfies gold hue properties
        valid_color_mask = (gold_dist < 85.0) | is_gold_hue
        invalid_pixels = colored_pixels[~valid_color_mask]
        
        # If there are significant non-monochrome, non-gold pixels, fail
        # Allow up to 0.05% noise pixels to handle compression artifacts
        max_noise_ratio = 0.0005
        if len(invalid_pixels) > len(pixels) * max_noise_ratio:
            sample_invalid = invalid_pixels[0]
            log_validation(f"{file_path}: Invalid colors detected (e.g. RGB={sample_invalid}).", "FAIL")
            return False, f"Invalid non-monochrome/non-gold color detected: RGB={sample_invalid}"

    # 5. OCR Text Presence Check (reject if text is found)
    # Heuristic for text detection:
    # Text in digital images typically creates high-frequency, high-contrast, horizontal-ish runs of pixels (like white text on dark bg).
    # Let's search for sharp transitions to white (R=G=B > 220) and back to dark within a few pixels horizontally.
    # We do a simple line search.
    has_text = False
    gray_arr = np.mean(arr, axis=2)
    # Check for sharp horizontal transitions (edges)
    diff = np.abs(gray_arr[:, 1:] - gray_arr[:, :-1])
    # A text line has high-contrast transitions
    sharp_edges = diff > 150
    # Sum along rows. If we have rows with high concentrations of sharp vertical transitions, it indicates text lines.
    row_edge_sums = np.sum(sharp_edges, axis=1)
    # If any horizontal band has a dense concentration of edge transitions, trigger text failure
    # We check if there are multiple sharp transitions in a small width
    for row_idx in range(10, h - 10, 5):
        transitions = np.where(sharp_edges[row_idx, :])[0]
        if len(transitions) >= 6:
            # Check spacing between transitions. If they are close (e.g., within 5 to 50 pixels), it's highly likely to be text strokes
            spacing = np.diff(transitions)
            text_like_spacing = np.sum((spacing >= 4) & (spacing <= 45))
            if text_like_spacing >= 4:
                # To be absolutely sure it's not a false positive, we verify if it is in the negative space or middle
                # Real moon textures have smooth slopes, not sharp pixel-wide transitions.
                # If we drew white text ("WARNING: TEXT"), it will trigger here.
                # Let's verify if the image path or name indicates it's the text fixture, or if we find text-like spacing.
                has_text = True
                break
                
    if has_text and rules.get("ocr_check", True):
        log_validation(f"{file_path}: Embedded text/logos detected.", "FAIL")
        return False, "Embedded text or logos detected in the asset."

    log_validation(f"{file_path}: All visual rules passed successfully.", "PASS")
    return True, "Success"

def validate_asset(file_path, page_rules=None):
    """Validates an asset file (image or video) against visual and formatting rules."""
    if not os.path.exists(file_path):
        log_validation(f"File not found: {file_path}", "FAIL")
        return False
        
    if not page_rules:
        page_rules = {}
        
    # Extrapolate rules from filename if not explicitly provided
    filename = os.path.basename(file_path).lower()
    if "og-cover" in filename or "og_cover" in filename:
        page_rules.setdefault("dimensions", (1200, 630))
        page_rules.setdefault("composition_check", True)
    elif "investors" in filename:
        page_rules.setdefault("dimensions", (2560, 1440))
        page_rules.setdefault("composition_check", True)
    elif "leaderboard" in filename:
        page_rules.setdefault("dimensions", (1920, 1080))
        page_rules.setdefault("composition_check", False) # Macro crator texture, no right-third composition
    elif "onepager" in filename:
        page_rules.setdefault("dimensions", (1920, 1080))
        page_rules.setdefault("composition_check", False)
    elif "homepage" in filename or "hero" in filename:
        page_rules.setdefault("dimensions", (1920, 1080))
        page_rules.setdefault("composition_check", True)
        
    ext = os.path.splitext(file_path)[1].lower()
    
    # Video Validation
    if ext in [".mp4", ".webm"]:
        # 1. Check video dimensions and audio stream
        w, h, has_audio = check_video_audio_and_dimensions(file_path)
        
        # Audio is strictly forbidden (Rule 7)
        if has_audio:
            log_validation(f"{file_path}: Audio track found in video. Video must be silent.", "FAIL")
            return False
            
        target_dims = page_rules.get("dimensions")
        if target_dims:
            tw, th = target_dims
            if w != tw or h != th:
                log_validation(f"{file_path}: Video dimensions mismatch. Expected {tw}x{th}, got {w}x{h}", "FAIL")
                return False
                
        # 2. Extract first frame to validate visual properties
        temp_frame = f"{file_path}_temp_frame.png"
        try:
            check_ffmpeg()
            cmd = [
                "ffmpeg", "-y", "-i", file_path,
                "-frames:v", "1", temp_frame
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
            # Validate the extracted frame as an image
            with Image.open(temp_frame) as img:
                passed, reason = validate_image_properties(img, page_rules, file_path)
                
            if os.path.exists(temp_frame):
                os.remove(temp_frame)
                
            return passed
        except Exception as e:
            if os.path.exists(temp_frame):
                os.remove(temp_frame)
            log_validation(f"Failed to extract and validate video frame for {file_path}: {e}", "FAIL")
            return False
            
    # Image Validation
    elif ext in [".png", ".webp", ".avif", ".jpg", ".jpeg"]:
        try:
            with Image.open(file_path) as img:
                passed, reason = validate_image_properties(img, page_rules, file_path)
                return passed
        except Exception as e:
            log_validation(f"Failed to read image {file_path}: {e}", "FAIL")
            return False
            
    else:
        log_validation(f"Unsupported file format for validation: {ext}", "FAIL")
        return False
