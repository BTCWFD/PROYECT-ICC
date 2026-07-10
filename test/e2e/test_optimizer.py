import os
import shutil
import pytest
from unittest.mock import patch, MagicMock

from ux_ui_media_team.optimizer import (
    optimize_image,
    optimize_video,
    check_ffmpeg,
    OptimizationError
)

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
TEMP_OUT_DIR = "test_opt_output"

@pytest.fixture(autouse=True)
def setup_teardown_out_dir():
    os.makedirs(TEMP_OUT_DIR, exist_ok=True)
    yield
    if os.path.exists(TEMP_OUT_DIR):
        shutil.rmtree(TEMP_OUT_DIR)

# ==========================================
# TIER 1: Feature Coverage Tests
# ==========================================

def test_image_format_transcoding():
    """TC-F3-01: Verify optimize_image generates AVIF, WebP, and PNG versions."""
    raw_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    
    # Run optimization
    outputs = optimize_image(raw_img, TEMP_OUT_DIR, (1920, 1080))
    
    # Assert return dictionary contains correct paths and they exist
    assert "png" in outputs
    assert "webp" in outputs
    assert "avif" in outputs
    
    assert os.path.exists(outputs["png"])
    assert os.path.exists(outputs["webp"])
    assert os.path.exists(outputs["avif"])

def test_image_resizing_output():
    """TC-F3-02: Verify output images match target sizes: 1200x630 (og-cover), 1920x1080 (standard), 2560x1440 (high-res)."""
    raw_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    from PIL import Image
    
    # 1. og-cover
    out_og = optimize_image(raw_img, TEMP_OUT_DIR, (1200, 630))
    with Image.open(out_og["png"]) as img:
        assert img.size == (1200, 630)
        
    # 2. Standard
    out_std = optimize_image(raw_img, TEMP_OUT_DIR, (1920, 1080))
    with Image.open(out_std["png"]) as img:
        assert img.size == (1920, 1080)
        
    # 3. High-res
    out_hi = optimize_image(raw_img, TEMP_OUT_DIR, (2560, 1440))
    with Image.open(out_hi["png"]) as img:
        assert img.size == (2560, 1440)

def test_video_transcoding_formats():
    """TC-F3-03: Verify optimize_video encodes raw input to AV1 .webm and H.264 .mp4."""
    raw_vid = os.path.join(FIXTURES_DIR, "mock_raw_video.mp4")
    
    # Run optimization (no loop)
    outputs = optimize_video(raw_vid, TEMP_OUT_DIR, loop=False)
    
    assert "mp4" in outputs
    assert "webm" in outputs
    
    assert os.path.exists(outputs["mp4"])
    assert os.path.exists(outputs["webm"])
    assert outputs["mp4"].endswith(".mp4")
    assert outputs["webm"].endswith(".webm")

def test_audio_track_removal():
    """TC-F3-04: Verify -an parameter is successfully applied to strip all audio from outputs."""
    raw_vid = os.path.join(FIXTURES_DIR, "mock_raw_video.mp4")
    
    # Intercept subprocess.run to verify "-an" is in ffmpeg arguments
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0)
        try:
            optimize_video(raw_vid, TEMP_OUT_DIR, loop=False)
        except Exception:
            pass
            
        # Verify that for each ffmpeg run call, "-an" is present
        assert mock_run.called
        for call in mock_run.call_args_list:
            args_list = call[0][0]
            assert "-an" in args_list

def test_poster_extraction():
    """TC-F3-05: Verify a 1920x1080 poster is extracted from the video's first frame and size is < 150 KB."""
    raw_vid = os.path.join(FIXTURES_DIR, "mock_raw_video.mp4")
    
    outputs = optimize_video(raw_vid, TEMP_OUT_DIR, loop=False)
    
    assert "poster_jpg" in outputs
    assert os.path.exists(outputs["poster_jpg"])
    
    # Check dimensions
    from PIL import Image
    with Image.open(outputs["poster_jpg"]) as img:
        assert img.size == (1920, 1080)
        
    # Check size is less than 150 KB (150 * 1024 bytes)
    size_bytes = os.path.getsize(outputs["poster_jpg"])
    assert size_bytes < 150000

# ==========================================
# TIER 2: Boundary & Corner Cases Tests
# ==========================================

def test_corrupted_source_media():
    """TC-F3-06: Verify optimization fails gracefully with specific error when source file is corrupted."""
    corrupt_file = os.path.join(TEMP_OUT_DIR, "corrupt.png")
    with open(corrupt_file, "w") as f:
        f.write("not a real image content")
        
    with pytest.raises(OptimizationError) as excinfo:
        optimize_image(corrupt_file, TEMP_OUT_DIR, (1920, 1080))
    assert "Corrupted source media" in str(excinfo.value)

def test_zero_byte_raw_asset():
    """TC-F3-07: Verify system aborts and reports error when processing zero-byte files."""
    zero_byte_img = os.path.join(TEMP_OUT_DIR, "zero.png")
    zero_byte_vid = os.path.join(TEMP_OUT_DIR, "zero.mp4")
    
    open(zero_byte_img, "wb").close()
    open(zero_byte_vid, "wb").close()
    
    with pytest.raises(OptimizationError) as excinfo1:
        optimize_image(zero_byte_img, TEMP_OUT_DIR, (1920, 1080))
    assert "empty (zero-byte)" in str(excinfo1.value)

    with pytest.raises(OptimizationError) as excinfo2:
        optimize_video(zero_byte_vid, TEMP_OUT_DIR, loop=True)
    assert "empty (zero-byte)" in str(excinfo2.value)

def test_short_video_looping_boundary():
    """TC-F3-08: Verify video loop behavior when raw video is shorter than crossfade window (0.5s)."""
    raw_vid = os.path.join(FIXTURES_DIR, "mock_raw_video.mp4")
    
    # Mock video duration to be 0.3s
    with patch("ux_ui_media_team.optimizer.get_video_duration") as mock_dur:
        mock_dur.return_value = 0.3
        
        with pytest.raises(OptimizationError) as excinfo:
            optimize_video(raw_vid, TEMP_OUT_DIR, loop=True)
        assert "shorter than crossfade window" in str(excinfo.value)

def test_ffmpeg_missing():
    """TC-F3-09: Verify optimization engine catches missing ffmpeg executable in path on setup."""
    with patch("shutil.which") as mock_which:
        mock_which.return_value = None
        
        with pytest.raises(OptimizationError) as excinfo:
            check_ffmpeg()
        assert "FFmpeg executable not found" in str(excinfo.value)

def test_aspect_ratio_mismatches():
    """TC-F3-10: Verify scaling behavior for weird raw input ratios (e.g. 1:1 square image scaled to 16:9 1920x1080)."""
    # Create a 500x500 square image
    square_img_path = os.path.join(TEMP_OUT_DIR, "square.png")
    from PIL import Image
    square_img = Image.new("RGB", (500, 500), (128, 128, 128))
    square_img.save(square_img_path)
    
    outputs = optimize_image(square_img_path, TEMP_OUT_DIR, (1920, 1080))
    with Image.open(outputs["png"]) as img:
        assert img.size == (1920, 1080)
