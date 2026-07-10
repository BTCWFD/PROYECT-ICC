import os
import shutil
import pytest
import time
import json
from unittest.mock import patch, MagicMock

from ux_ui_media_team.run import main as run_main, LOCK_FILE

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
TEST_CACHE_DIR = "test_run_cache"
TEST_OUTPUT_DIR = "test_run_output"
REPORT_FILE = "ux_ui_media_team/generation_report.json"

@pytest.fixture(autouse=True)
def setup_run_env():
    old_env = dict(os.environ)
    os.environ["GEMINI_API_KEY"] = "run-test-key"
    os.environ["CACHE_DIR"] = TEST_CACHE_DIR
    os.environ["OUTPUT_DIR"] = TEST_OUTPUT_DIR
    
    os.makedirs(TEST_CACHE_DIR, exist_ok=True)
    os.makedirs(TEST_OUTPUT_DIR, exist_ok=True)
    
    # Ensure any residual lock/report files are removed
    if os.path.exists(LOCK_FILE):
        try:
            os.remove(LOCK_FILE)
        except Exception:
            pass
    if os.path.exists(REPORT_FILE):
        try:
            os.remove(REPORT_FILE)
        except Exception:
            pass

    yield
    
    os.environ.clear()
    os.environ.update(old_env)
    
    if os.path.exists(TEST_CACHE_DIR):
        shutil.rmtree(TEST_CACHE_DIR)
    if os.path.exists(TEST_OUTPUT_DIR):
        shutil.rmtree(TEST_OUTPUT_DIR)
    if os.path.exists(LOCK_FILE):
        try:
            os.remove(LOCK_FILE)
        except Exception:
            pass
    if os.path.exists(REPORT_FILE):
        try:
            os.remove(REPORT_FILE)
        except Exception:
            pass

# ==========================================
# TIER 1: Feature Coverage Tests
# ==========================================

def test_run_dry_run(capsys):
    """TC-F5-01: Verify --dry-run prints parsed pages and exits with code 0."""
    with patch("sys.argv", ["run.py", "--dry-run"]):
        with pytest.raises(SystemExit) as excinfo:
            run_main()
        assert excinfo.value.code == 0
        
    captured = capsys.readouterr()
    assert "Dry run completed successfully" in captured.out
    assert "investors.html" in captured.out

def test_run_selective_page():
    """TC-F5-02: Verify --page homepage only processes the homepage asset and skips others."""
    # We patch generator, optimizer, validator to avoid actual file generation/transcoding
    # so we can easily check called pages and run extremely fast.
    with patch("sys.argv", ["run.py", "--page", "homepage"]):
        with patch("ux_ui_media_team.run.generate_page_assets") as mock_gen, \
             patch("ux_ui_media_team.run.optimize_video") as mock_opt_vid, \
             patch("ux_ui_media_team.run.validate_asset") as mock_val:
             
            mock_gen.return_value = "dummy_raw.mp4"
            mock_opt_vid.return_value = {"mp4": "dummy.mp4"}
            mock_val.return_value = True
            
            with pytest.raises(SystemExit) as excinfo:
                run_main()
            
            assert excinfo.value.code == 0
            # homepage maps to "/" in run.py
            mock_gen.assert_called_once_with("/")
            mock_opt_vid.assert_called_once()
            mock_val.assert_called_once_with("dummy.mp4")

def test_run_force_overwrite():
    """TC-F5-03: Verify --force overwrites existing files (ignores existing output)."""
    # 1. Place a fake output file in the output directory
    final_output_path = os.path.join(TEST_OUTPUT_DIR, "investors.png")
    with open(final_output_path, "w") as f:
        f.write("existing-optimized-asset")
        
    # 2. Run WITHOUT --force: it should skip processing
    with patch("sys.argv", ["run.py", "--page", "investors"]):
        with patch("ux_ui_media_team.run.generate_page_assets") as mock_gen:
            with pytest.raises(SystemExit) as excinfo:
                run_main()
            assert excinfo.value.code == 0
            # generator should NOT be called because file exists
            mock_gen.assert_not_called()
            
            # check the report says skipped
            with open(REPORT_FILE, "r") as rf:
                report = json.load(rf)
            assert report["pages_processed"][0]["status"] == "skipped"
            assert report["pages_processed"][0]["reason"] == "already exists"

    # 3. Run WITH --force: it should process anyway
    with patch("sys.argv", ["run.py", "--page", "investors", "--force"]):
        with patch("ux_ui_media_team.run.generate_page_assets") as mock_gen, \
             patch("ux_ui_media_team.run.optimize_image") as mock_opt, \
             patch("ux_ui_media_team.run.validate_asset") as mock_val:
             
            mock_gen.return_value = "dummy_raw.png"
            mock_opt.return_value = {"png": final_output_path}
            mock_val.return_value = True
            
            with pytest.raises(SystemExit) as excinfo:
                run_main()
            assert excinfo.value.code == 0
            # generator SHOULD be called now
            mock_gen.assert_called_once_with("investors.html")

def test_run_execution_report():
    """TC-F5-04: Verify that running run.py generates the generation_report.json file in correct format."""
    with patch("sys.argv", ["run.py", "--page", "investors"]):
        with patch("ux_ui_media_team.run.generate_page_assets") as mock_gen, \
             patch("ux_ui_media_team.run.optimize_image") as mock_opt, \
             patch("ux_ui_media_team.run.validate_asset") as mock_val:
             
            mock_gen.return_value = "dummy_raw.png"
            mock_opt.return_value = {"png": "dummy.png"}
            mock_val.return_value = True
            
            with pytest.raises(SystemExit) as excinfo:
                run_main()
            assert excinfo.value.code == 0
            
    assert os.path.exists(REPORT_FILE)
    with open(REPORT_FILE, "r") as f:
        report = json.load(f)
        
    assert "timestamp" in report
    assert report["status"] == "success"
    assert report["dry_run"] is False
    assert isinstance(report["pages_processed"], list)
    assert len(report["pages_processed"]) == 1
    assert report["pages_processed"][0]["page"] == "investors.html"
    assert report["pages_processed"][0]["status"] == "success"
    assert report["pages_processed"][0]["output"] == "dummy.png"
    assert report["errors"] == []

def test_run_pipeline_success():
    """TC-F5-05: Verify that running the whole pipeline coordinates config, generator, optimizer, and validator successfully."""
    # We do not mock generator, optimizer, or validator, letting them perform their tasks.
    # We only run for 'investors' to keep it fast, but we run the real code paths.
    with patch("sys.argv", ["run.py", "--page", "investors"]):
        with pytest.raises(SystemExit) as excinfo:
            run_main()
        assert excinfo.value.code == 0
        
    # Verify outputs were produced
    expected_png = os.path.join(TEST_OUTPUT_DIR, "investors.png")
    expected_webp = os.path.join(TEST_OUTPUT_DIR, "investors.webp")
    expected_avif = os.path.join(TEST_OUTPUT_DIR, "investors.avif")
    
    assert os.path.exists(expected_png)
    assert os.path.exists(expected_webp)
    assert os.path.exists(expected_avif)
    
    # Verify report reflects success
    assert os.path.exists(REPORT_FILE)
    with open(REPORT_FILE, "r") as rf:
        report = json.load(rf)
    assert report["status"] == "success"
    assert len(report["pages_processed"]) == 1
    assert report["pages_processed"][0]["status"] == "success"

# ==========================================
# TIER 2: Boundary & Corner Cases Tests
# ==========================================

def test_run_concurrency_lock(capsys):
    """TC-F5-06: Verify that running run.py while another instance is running (not stale) fails and exits with 1."""
    # Write current PID into lock file to simulate active instance
    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))
        
    with patch("sys.argv", ["run.py", "--dry-run"]):
        with pytest.raises(SystemExit) as excinfo:
            run_main()
        assert excinfo.value.code == 1
        
    captured = capsys.readouterr()
    assert "Error: Another instance of run.py is currently running." in captured.err

def test_run_invalid_arguments(capsys):
    """TC-F5-07: Verify that running run.py with invalid arguments exits with non-zero code."""
    with patch("sys.argv", ["run.py", "--page", "invalid"]):
        with pytest.raises(SystemExit) as excinfo:
            run_main()
        assert excinfo.value.code != 0
        
    captured = capsys.readouterr()
    assert "Error: Unknown page 'invalid'" in captured.err

def test_run_stale_lock_recovery():
    """TC-F5-08: Verify that if a lock file exists but is stale (> 10 minutes), it is cleared and run.py runs successfully."""
    # 1. Create a lock file
    with open(LOCK_FILE, "w") as f:
        f.write("99999") # dummy PID
        
    # 2. Modify modification time to 15 minutes ago (15 * 60 = 900 seconds)
    stale_time = time.time() - 900
    os.utime(LOCK_FILE, (stale_time, stale_time))
    
    # 3. Run dry-run. It should clear the lock and complete successfully.
    with patch("sys.argv", ["run.py", "--dry-run"]):
        with pytest.raises(SystemExit) as excinfo:
            run_main()
        assert excinfo.value.code == 0
        
    # Lock file is recreated with the new PID when running, then removed at normal exit.
    assert not os.path.exists(LOCK_FILE)

def test_run_error_reporting():
    """TC-F5-09: Verify that if generator fails, the error is recorded in the report and it exits with 1."""
    with patch("sys.argv", ["run.py", "--page", "investors"]):
        from ux_ui_media_team.generator import GenerationError
        with patch("ux_ui_media_team.run.generate_page_assets", side_effect=GenerationError("Simulated generation failure")):
            with pytest.raises(SystemExit) as excinfo:
                run_main()
            assert excinfo.value.code == 1
            
    assert os.path.exists(REPORT_FILE)
    with open(REPORT_FILE, "r") as rf:
        report = json.load(rf)
    
    assert report["errors"] != []
    assert any("Simulated generation failure" in err for err in report["errors"])
    assert report["pages_processed"][0]["status"] == "error"
    assert "Simulated generation failure" in report["pages_processed"][0]["error"]

def test_run_lock_released_on_exit():
    """TC-F5-10: Verify that the lock file is always released on normal completion or error exit."""
    # Test case 1: Normal Completion
    with patch("sys.argv", ["run.py", "--dry-run"]):
        with pytest.raises(SystemExit) as excinfo:
            run_main()
        assert excinfo.value.code == 0
    assert not os.path.exists(LOCK_FILE)
    
    # Test case 2: Error Exit (due to config error)
    with patch("sys.argv", ["run.py", "--page", "investors"]):
        from ux_ui_media_team.config import ConfigurationError
        with patch("ux_ui_media_team.run.get_api_key", side_effect=ConfigurationError("Missing API key")):
            with pytest.raises(SystemExit) as excinfo:
                run_main()
            assert excinfo.value.code == 1
    assert not os.path.exists(LOCK_FILE)
