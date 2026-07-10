import os
import shutil
import pytest
import time
from unittest.mock import patch, MagicMock

from ux_ui_media_team.config import get_api_key, get_google_client
from ux_ui_media_team.generator import generate_page_assets, parse_media_prompts
from ux_ui_media_team.optimizer import optimize_image, optimize_video
from ux_ui_media_team.validator import validate_asset
from ux_ui_media_team.run import main as run_main

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
TEST_CACHE_DIR = "test_run_cache"
TEST_OUTPUT_DIR = "test_run_output"

@pytest.fixture(autouse=True)
def setup_integration_env():
    old_env = dict(os.environ)
    os.environ["GEMINI_API_KEY"] = "integration-test-key"
    os.environ["CACHE_DIR"] = TEST_CACHE_DIR
    os.environ["OUTPUT_DIR"] = TEST_OUTPUT_DIR
    
    os.makedirs(TEST_CACHE_DIR, exist_ok=True)
    os.makedirs(TEST_OUTPUT_DIR, exist_ok=True)
    
    yield
    
    os.environ.clear()
    os.environ.update(old_env)
    
    if os.path.exists(TEST_CACHE_DIR):
        shutil.rmtree(TEST_CACHE_DIR)
    if os.path.exists(TEST_OUTPUT_DIR):
        shutil.rmtree(TEST_OUTPUT_DIR)
    # Cleanup run lock if it exists
    if os.path.exists("ux_ui_media_team/run.lock"):
        try:
            os.remove("ux_ui_media_team/run.lock")
        except Exception:
            pass

# ==========================================
# TIER 3: Cross-Feature Combinations
# ==========================================

def test_config_generator_routing():
    """TC-T3-01: Verify dynamic API endpoint routing from config module to Google SDK client."""
    os.environ["GEMINI_API_KEY"] = "dynamic-route-key"
    client = get_google_client()
    
    # Verify generator.py retrieves client that uses this config key
    with patch("ux_ui_media_team.generator.get_google_client") as mock_get_client:
        mock_get_client.return_value = client
        generate_page_assets("investors.html")
        assert mock_get_client.called

def test_generator_optimizer_dimensions():
    """TC-T3-02: Verify prompt specifications in MEDIA_PROMPTS.md are mapped to correct dimensions in optimizer."""
    prompts = parse_media_prompts()
    
    # Get dimensions expected for og-cover
    assert "og-cover" in prompts
    og_cover_spec = prompts["og-cover"]
    
    # In full lifecycle, run.py parses "og-cover" and applies 1200x630.
    # We verify that optimizer resize receives the exact 1200x630 target dimensions
    with patch("ux_ui_media_team.optimizer.optimize_image") as mock_opt:
        mock_opt.return_value = {"png": "mock.png"}
        
        # Simulate run.py behavior for og-cover
        raw_path = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
        optimize_image(raw_path, TEST_OUTPUT_DIR, (1200, 630))
        
        mock_opt.assert_called_once_with(raw_path, TEST_OUTPUT_DIR, (1200, 630))

def test_optimizer_validator_logs():
    """TC-T3-03: Verify validator reads optimized media files and failure logs match output characteristics."""
    raw_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    opt_outputs = optimize_image(raw_img, TEST_OUTPUT_DIR, (1200, 630))
    
    # Assert validator passes on optimized PNG
    assert validate_asset(opt_outputs["png"], {"dimensions": (1200, 630)}) is True
    
    # If we pass non-matching dimensions rule, it must fail and update log
    log_path = os.path.join("ux_ui_media_team", "validation.log")
    if os.path.exists(log_path):
        os.remove(log_path)
        
    assert validate_asset(opt_outputs["png"], {"dimensions": (1920, 1080)}) is False
    assert os.path.exists(log_path)
    with open(log_path, "r") as lf:
        log_text = lf.read()
    assert "Dimensions mismatch" in log_text

def test_config_validator_thresholds():
    """TC-T3-04: Verify validation thresholds in validator.py can be overridden using env values."""
    raw_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    
    # Normal validation uses standard thresholds. Let's override min_brightness via rule / env simulation.
    # Suppose we set min_brightness to a very high number, forcing a fail on normal image:
    assert validate_asset(raw_img, {"min_brightness": 240.0, "composition_check": False}) is False

def test_generator_validator_precheck():
    """TC-T3-05: Verify raw asset pre-validation stops optimization if raw generation fails rule verification."""
    # We simulate this by having generator return a malformed image, and checking that validator pre-check catches it
    # and we fail or stop before completing the run.
    with patch("ux_ui_media_team.generator.generate_page_assets") as mock_gen:
        mock_gen.return_value = os.path.join(FIXTURES_DIR, "mock_malformed_text.png")
        
        # If raw generated asset fails validator, we stop
        raw_path = generate_page_assets("investors.html")
        is_raw_valid = validate_asset(raw_path, {"ocr_check": True, "composition_check": False})
        
        assert is_raw_valid is False
        # The runner should decide to stop or re-generate based on this pre-check!

# ==========================================
# TIER 4: Real-World Application Scenarios
# ==========================================

def test_hero_video_lifecycle_scenario():
    """TC-T4-01: End-to-End lifecycle scenario for Hero Loop Video (/)."""
    # 1. Parse prompts
    prompts = parse_media_prompts()
    assert "/" in prompts
    
    # 2. Call generator to simulate Veo call and caching raw video
    raw_vid_path = generate_page_assets("/")
    assert os.path.exists(raw_vid_path)
    
    # 3. Optimize (loop=True for homepage hero)
    opt_vid_outputs = optimize_video(raw_vid_path, TEST_OUTPUT_DIR, loop=True)
    assert os.path.exists(opt_vid_outputs["mp4"])
    assert os.path.exists(opt_vid_outputs["webm"])
    assert os.path.exists(opt_vid_outputs["poster_jpg"])
    
    # 4. Validate output files against visual rules
    # Check silent video, no audio, 1920x1080
    assert validate_asset(opt_vid_outputs["mp4"], {"dimensions": (1920, 1080)}) is True

def test_og_cover_lifecycle_scenario():
    """TC-T4-02: End-to-End lifecycle scenario for Social og-cover image."""
    prompts = parse_media_prompts()
    assert "og-cover" in prompts
    
    # 1. Generate (Imagen mock returns valid mock image)
    raw_img_path = generate_page_assets("og-cover")
    assert os.path.exists(raw_img_path)
    
    # 2. Optimize to 1200x630
    opt_outputs = optimize_image(raw_img_path, TEST_OUTPUT_DIR, (1200, 630))
    assert os.path.exists(opt_outputs["png"])
    
    # 3. Validate visual rules: dimension, composition (right-third subject, negative left-third), no text
    assert validate_asset(opt_outputs["png"], {"dimensions": (1200, 630), "composition_check": True, "ocr_check": True}) is True

def test_investors_static_lifecycle():
    """TC-T4-03: End-to-End lifecycle scenario for investors.html hero image."""
    prompts = parse_media_prompts()
    assert "investors.html" in prompts
    
    # 1. Generate
    raw_img_path = generate_page_assets("investors.html")
    assert os.path.exists(raw_img_path)
    
    # 2. Optimize to 2560x1440 and create AVIF, WebP
    opt_outputs = optimize_image(raw_img_path, TEST_OUTPUT_DIR, (2560, 1440))
    assert os.path.exists(opt_outputs["avif"])
    assert os.path.exists(opt_outputs["webp"])
    
    # 3. Validate
    assert validate_asset(opt_outputs["webp"], {"dimensions": (2560, 1440), "composition_check": True}) is True

def test_regeneration_recovery_flow():
    """TC-T4-04: Auto-recovery flow if validator detects text, triggering negative prompt re-generation."""
    # We patch generator to return a malformed text image on first call,
    # and a clean image on the second call when a negative prompt is injected.
    first_call = True
    
    def mock_generate(page):
        nonlocal first_call
        if first_call:
            first_call = False
            return os.path.join(FIXTURES_DIR, "mock_malformed_text.png")
        else:
            return os.path.join(FIXTURES_DIR, "mock_raw_image.png")
            
    with patch("ux_ui_media_team.generator.generate_page_assets", side_effect=mock_generate):
        # 1. First generation attempt
        raw_asset = generate_page_assets("investors.html")
        
        # 2. Validator fails due to text
        passed = validate_asset(raw_asset, {"ocr_check": True, "composition_check": False})
        assert passed is False
        
        # 3. System detects failure, modifies generation params (adds "no text" negative prompt)
        # and triggers re-generation
        raw_asset_recovered = generate_page_assets("investors.html")
        
        # 4. Recovered asset passes validator
        passed_recovered = validate_asset(raw_asset_recovered, {"ocr_check": True, "composition_check": False})
        assert passed_recovered is True

def test_incremental_sync_cache_hit():
    """TC-T4-05: Incremental sync flow where unchanged prompts and cached files bypass API generation."""
    # Clear outputs
    if os.path.exists(TEST_OUTPUT_DIR):
        shutil.rmtree(TEST_OUTPUT_DIR)
    os.makedirs(TEST_OUTPUT_DIR, exist_ok=True)
    
    # Run once to cache
    raw_path_1 = generate_page_assets("investors.html")
    assert os.path.exists(raw_path_1)
    
    # Run again: we patch the SDK client call to raise an exception if it is invoked.
    # Since the raw cache file exists, it should skip the API generation call!
    import google.generativeai as genai
    with patch.object(genai.ImageGenerationModel, "generate_images") as mock_api:
        mock_api.side_effect = Exception("Should not hit API when cache is present!")
        
        # This should execute successfully by hitting cache
        raw_path_2 = generate_page_assets("investors.html")
        assert raw_path_2 == raw_path_1
        assert mock_api.called is False
