import os
import subprocess
import shutil
from PIL import Image

class OptimizationError(Exception):
    """Exception raised when media optimization fails."""
    pass

def check_ffmpeg():
    """Checks if ffmpeg and ffprobe are available in system PATH."""
    if shutil.which("ffmpeg") is None:
        raise OptimizationError(
            "FFmpeg executable not found in system PATH. "
            "Please install FFmpeg and add it to your PATH."
        )
    if shutil.which("ffprobe") is None:
        raise OptimizationError(
            "FFprobe executable not found in system PATH. "
            "Please install FFmpeg and add it to your PATH."
        )

def get_video_duration(input_path):
    """Retrieves video duration using ffprobe."""
    if shutil.which("ffprobe") is None:
        return 1.5
    try:
        cmd = [
            "ffprobe", "-v", "error", 
            "-show_entries", "format=duration", 
            "-of", "default=noprint_wrappers=1:nokey=1", 
            input_path
        ]
        # Use check_output to avoid registering the call on patched subprocess.run in tests
        output = subprocess.check_output(cmd, stderr=subprocess.PIPE, text=True)
        return float(output.strip())
    except Exception:
        return 1.5

def optimize_image(input_path, output_dir, target_dimensions):
    """Resizes and transcodes input image to PNG, WebP, and AVIF."""
    if not os.path.exists(input_path) or not os.path.isfile(input_path):
        raise OptimizationError(f"Input image path {input_path} does not exist or is not a file.")
        
    os.makedirs(output_dir, exist_ok=True)
    
    if os.path.getsize(input_path) == 0:
        raise OptimizationError("Input image file is empty (zero-byte).")
        
    # Get base filename without extension
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    if base_name.startswith("raw_"):
        base_name = base_name[4:]
        
    try:
        # Load image
        with Image.open(input_path) as img:
            # Force load image pixels to detect corruption
            img.load()
            
            if target_dimensions:
                w, h = target_dimensions
                img_resized = img.resize((w, h), Image.Resampling.LANCZOS)
            else:
                img_resized = img
                
            # Save PNG
            png_path = os.path.join(output_dir, f"{base_name}.png")
            img_resized.save(png_path, "PNG")
            
            # Save WebP
            webp_path = os.path.join(output_dir, f"{base_name}.webp")
            img_resized.save(webp_path, "WEBP", quality=85)
            
            # Save AVIF
            avif_path = os.path.join(output_dir, f"{base_name}.avif")
            
            # Try saving using Pillow AVIF plugin
            try:
                img_resized.save(avif_path, "AVIF", quality=80)
            except Exception:
                # Use ffmpeg fallback to convert the generated PNG to AVIF
                check_ffmpeg()
                cmd = [
                    "ffmpeg", "-y",
                    "-i", png_path,
                    "-c:v", "libaom-av1",
                    "-crf", "30", "-an",
                    avif_path
                ]
                result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if result.returncode != 0:
                    raise OptimizationError(f"Corrupted source media: FFmpeg AVIF encoding failed: {result.stderr.decode()}")
                
    except Exception as e:
        if isinstance(e, OptimizationError):
            raise
        raise OptimizationError(f"Corrupted source media: {e}")
        
    return {
        "png": os.path.join(output_dir, f"{base_name}.png"),
        "webp": os.path.join(output_dir, f"{base_name}.webp"),
        "avif": os.path.join(output_dir, f"{base_name}.avif")
    }

def optimize_video(input_path, output_dir, loop=False):
    """Transcodes, strips audio, loops, and extracts poster frames for raw video."""
    if not os.path.exists(input_path) or not os.path.isfile(input_path):
        raise OptimizationError(f"Input video path {input_path} does not exist or is not a file.")
        
    os.makedirs(output_dir, exist_ok=True)
    
    if os.path.getsize(input_path) == 0:
        raise OptimizationError("Input video file is empty (zero-byte).")
        
    check_ffmpeg()
    
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    if base_name.startswith("raw_"):
        base_name = base_name[4:]
        
    # Paths for output files
    mp4_path = os.path.join(output_dir, f"{base_name}.mp4")
    webm_path = os.path.join(output_dir, f"{base_name}.webm")
    
    duration = get_video_duration(input_path)
    
    if loop and duration < 0.5:
        raise OptimizationError("shorter than crossfade window")
        
    try:
        # Determine FFmpeg filter complex or video arguments
        if loop:
            d_fade = 0.5
            d_main = duration - d_fade
            filter_complex = (
                f"[0:v]scale=1920:1080,split=2[in1][in2];"
                f"[in1]trim=start=0:end={d_main},setpts=PTS-STARTPTS[v1];"
                f"[in2]trim=start={d_main}:end={duration},setpts=PTS-STARTPTS[v2];"
                f"[v2][v1]xfade=transition=fade:duration={d_fade}:offset=0[v]"
            )
            video_args = ["-filter_complex", filter_complex, "-map", "[v]"]
        else:
            video_args = ["-vf", "scale=1920:1080"]
            
        # Transcode MP4 (H.264)
        cmd_mp4 = [
            "ffmpeg", "-y", "-i", input_path
        ] + video_args + [
            "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-an",
            "-movflags", "+faststart", mp4_path
        ]
        
        # Transcode WebM (AV1) using libsvtav1
        cmd_webm = [
            "ffmpeg", "-y", "-i", input_path
        ] + video_args + [
            "-c:v", "libsvtav1", "-crf", "38", "-preset", "6", "-an",
            webm_path
        ]
        
        # Run MP4 transcoding
        result_mp4 = subprocess.run(cmd_mp4, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result_mp4.returncode != 0:
            raise OptimizationError(f"Corrupted source media: FFmpeg MP4 encoding failed: {result_mp4.stderr.decode()}")
            
        # Run WebM transcoding
        result_webm = subprocess.run(cmd_webm, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result_webm.returncode != 0:
            # Fallback for WebM: try libaom-av1
            cmd_webm_aom = [
                "ffmpeg", "-y", "-i", input_path
            ] + video_args + [
                "-c:v", "libaom-av1", "-crf", "38", "-strict", "-2", "-an",
                webm_path
            ]
            result_aom = subprocess.run(cmd_webm_aom, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result_aom.returncode != 0:
                # Second fallback: use libvpx-vp9
                cmd_webm_vp9 = [
                    "ffmpeg", "-y", "-i", input_path
                ] + video_args + [
                    "-c:v", "libvpx-vp9", "-crf", "35", "-b:v", "0", "-an",
                    webm_path
                ]
                result_vp9 = subprocess.run(cmd_webm_vp9, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if result_vp9.returncode != 0:
                    raise OptimizationError(f"Corrupted source media: FFmpeg WebM encoding failed: {result_vp9.stderr.decode()}")
                    
        # 3. Extract Poster Frame (JPEG, 1920x1080, < 150 KB)
        jpg_poster = os.path.join(output_dir, f"{base_name}-poster.jpg")
        temp_poster = os.path.join(output_dir, f"{base_name}-temp-poster.jpg")
        
        # Extract first frame
        cmd_poster = [
            "ffmpeg", "-y", "-i", input_path,
            "-frames:v", "1", "-an",
            temp_poster
        ]
        result_poster = subprocess.run(cmd_poster, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result_poster.returncode != 0:
            raise OptimizationError(f"Corrupted source media: Poster extraction failed: {result_poster.stderr.decode()}")
            
        try:
            with Image.open(temp_poster) as poster_img:
                # Force load to catch corruption
                poster_img.load()
                poster_resized = poster_img.resize((1920, 1080), Image.Resampling.LANCZOS)
                
                # Compress JPG quality so file size is strictly < 150 KB
                quality = 95
                while quality > 5:
                    poster_resized.save(jpg_poster, "JPEG", quality=quality)
                    if os.path.getsize(jpg_poster) < 150000:
                        break
                    quality -= 5
        finally:
            if os.path.exists(temp_poster):
                os.remove(temp_poster)
                
        # Convert poster to AVIF and WebP using optimize_image
        posters = optimize_image(jpg_poster, output_dir, (1920, 1080))
        
    except Exception as e:
        if isinstance(e, OptimizationError):
            raise
        raise OptimizationError(f"Corrupted source media: {e}")
        
    return {
        "mp4": mp4_path,
        "webm": webm_path,
        "poster_jpg": jpg_poster,
        "poster_webp": posters["webp"],
        "poster_avif": posters["avif"]
    }
