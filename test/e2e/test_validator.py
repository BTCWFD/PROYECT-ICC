import os
import pytest
from PIL import Image

from ux_ui_media_team.validator import (
    validate_asset,
    validate_image_properties,
    ValidationError
)

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

# ==========================================
# TIER 1: Feature Coverage Tests
# ==========================================

def test_ocr_text_detection():
    """TC-F4-01: Verify validator rejects images with embedded text/logos and accepts clean images."""
    clean_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    text_img = os.path.join(FIXTURES_DIR, "mock_malformed_text.png")
    
    # Clean image should pass validation (returns True)
    assert validate_asset(clean_img, {"ocr_check": True, "composition_check": False}) is True
    
    # Text image should fail validation (returns False)
    assert validate_asset(text_img, {"ocr_check": True, "composition_check": False}) is False

def test_exposure_brightness_verification():
    """TC-F4-02: Verify validator measures average brightness and ensures it is in acceptable exposure range."""
    clean_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    dark_img = os.path.join(FIXTURES_DIR, "mock_dark_image.png")
    
    # Normal image is in range
    assert validate_asset(clean_img, {"min_brightness": 10.0, "max_brightness": 240.0, "composition_check": False}) is True
    
    # Dark image fails minimum brightness
    assert validate_asset(dark_img, {"min_brightness": 10.0, "composition_check": False}) is False

def test_composition_layout_check():
    """TC-F4-03: Verify validator detects subject placement in right-third and negative space in left-third."""
    clean_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    
    # mock_raw_image has subject on the right and black/negative space on the left -> should pass composition check
    assert validate_asset(clean_img, {"composition_check": True}) is True
    
    # Let's create an image with subject on the LEFT instead of right to test failure
    left_subject_img = os.path.join(FIXTURES_DIR, "temp_left_subject.png")
    try:
        with Image.open(clean_img) as img:
            # Mirror the image (moves right subject to left)
            mirrored = img.transpose(Image.FLIP_LEFT_RIGHT)
            mirrored.save(left_subject_img)
            
        assert validate_asset(left_subject_img, {"composition_check": True}) is False
    finally:
        if os.path.exists(left_subject_img):
            os.remove(left_subject_img)

def test_color_palette_verification():
    """TC-F4-04: Verify validator rejects images containing non-monochrome colors (except gold)."""
    clean_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    colored_img = os.path.join(FIXTURES_DIR, "mock_non_monochrome.png")
    
    # Grayscale/gold should pass
    assert validate_asset(clean_img, {"composition_check": False}) is True
    
    # Blue/colored should fail
    assert validate_asset(colored_img, {"composition_check": False}) is False

def test_validation_log_updates():
    """TC-F4-05: Verify validation log file is updated with pass/fail and detail metrics."""
    log_path = os.path.join("ux_ui_media_team", "validation.log")
    if os.path.exists(log_path):
        os.remove(log_path)
        
    clean_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    validate_asset(clean_img)
    
    assert os.path.exists(log_path)
    with open(log_path, "r") as f:
        log_content = f.read()
        
    assert "PASS" in log_content or "FAIL" in log_content

# ==========================================
# TIER 2: Boundary & Corner Cases Tests
# ==========================================

def test_completely_black_image_fails():
    """TC-F4-06: Verify black images are rejected due to low exposure."""
    black_img = os.path.join(FIXTURES_DIR, "mock_dark_image.png")
    # Even with composition disabled, pure black should fail brightness check
    assert validate_asset(black_img, {"min_brightness": 10.0, "composition_check": False}) is False

def test_borderline_gold_hue_threshold():
    """TC-F4-07: Verify threshold sensitivity for gold hue range."""
    gold_img_path = os.path.join(FIXTURES_DIR, "temp_gold_hue.png")
    try:
        # Create an image with borderline gold color (#ffe066)
        img = Image.new("RGB", (100, 100), (10, 10, 10))
        # Draw some gold highlights
        for x in range(80, 100):
            for y in range(80, 100):
                img.putpixel((x, y), (255, 224, 102)) # Borderline gold #ffe066
        img.save(gold_img_path)
        
        # Should pass because it is gold-like (under distance of 85 from #ffd35b)
        assert validate_asset(gold_img_path, {"composition_check": False}) is True
        
        # Draw some orange/yellow highlights (#ff9900 - orange)
        for x in range(80, 100):
            for y in range(80, 100):
                img.putpixel((x, y), (255, 153, 0))
        img.save(gold_img_path)
        
        # Should fail because it is orange/non-monochrome
        assert validate_asset(gold_img_path, {"composition_check": False}) is False
    finally:
        if os.path.exists(gold_img_path):
            os.remove(gold_img_path)

def test_noise_shadows_ocr_tolerance():
    """TC-F4-08: Verify validator OCR does not trigger false positives on noisy/rocky crater shadows."""
    noise_img_path = os.path.join(FIXTURES_DIR, "temp_noise.png")
    try:
        # Create an image with high-frequency noise (like crater shadow textures) but no text
        import numpy as np
        arr = np.random.randint(5, 25, size=(100, 100, 3), dtype=np.uint8)
        img = Image.fromarray(arr)
        img.save(noise_img_path)
        
        # Noise should not be detected as text
        assert validate_asset(noise_img_path, {"ocr_check": True, "composition_check": False}) is True
    finally:
        if os.path.exists(noise_img_path):
            os.remove(noise_img_path)

def test_exact_pixel_dimension_boundary():
    """TC-F4-09: Verify asset size verification rejects dimensions off by 1 pixel (e.g. 1200x631 for og-cover)."""
    off_dimension_img = os.path.join(FIXTURES_DIR, "temp_off_dim.png")
    try:
        # Create 1200x631 image (og-cover is exactly 1200x630)
        img = Image.new("RGB", (1200, 631), (10, 10, 10))
        img.save(off_dimension_img)
        
        # Check against og-cover dimensions rule
        assert validate_asset(off_dimension_img, {"dimensions": (1200, 630), "composition_check": False}) is False
    finally:
        if os.path.exists(off_dimension_img):
            os.remove(off_dimension_img)

def test_missing_file_validation_error():
    """TC-F4-10: Verify validator fails gracefully with clear error when attempting to validate a non-existent file path."""
    non_existent_file = "this_file_does_not_exist.png"
    # Should return False and log a failure without crashing
    assert validate_asset(non_existent_file) is False
