import os
import sys
import shutil
from pathlib import Path

# Enforce environment variables before imports
os.environ["MOCK_API"] = "true"
os.environ["TEST_MODE"] = "offline"
os.environ["GEMINI_API_KEY"] = "mock-key"

# Add project root to sys.path if not present
CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ux_ui_media_team.generator import generate_page_assets
from ux_ui_media_team.validator import validate_asset
from ux_ui_media_team.config import get_raw_cache_dir

def main():
    print("=" * 60)
    print("Running Milestone M2 Generator Verification Script")
    print("=" * 60)
    
    # 1. Clean the raw cache directory
    cache_dir = get_raw_cache_dir()
    print(f"Raw cache directory: {cache_dir}")
    if os.path.exists(cache_dir):
        print("Cleaning existing raw cache files...")
        for filename in os.listdir(cache_dir):
            file_path = os.path.join(cache_dir, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                print(f"Failed to delete {file_path}: {e}")
    else:
        os.makedirs(cache_dir, exist_ok=True)

    # List of pages to generate and test
    pages_to_test = [
        ("/", "raw_homepage.mp4"),
        ("investors.html", "raw_investors.png"),
        ("leaderboard.html", "raw_leaderboard.png"),
        ("press.html", "raw_press.png"),
        ("onepager.html", "raw_onepager.png"),
        ("teaser.html", "raw_teaser.mp4"),
        ("og-cover", "raw_og-cover.png")
    ]
    
    success = True
    print("\nStarting generation and validation:")
    print("-" * 50)
    
    for page_name, expected_filename in pages_to_test:
        print(f"Generating assets for page: {page_name!r}")
        try:
            raw_path = generate_page_assets(page_name)
            print(f" -> Generated file path: {raw_path}")
            
            # Verify file exists
            if not os.path.exists(raw_path):
                print(f" [FAIL] Expected file does not exist: {raw_path}")
                success = False
                continue
                
            # Verify filename matches expected
            actual_filename = os.path.basename(raw_path)
            if actual_filename != expected_filename:
                print(f" [FAIL] Filename mismatch: Expected {expected_filename}, got {actual_filename}")
                success = False
                continue
                
            # Validate generated asset against visual rules
            print(" -> Running visual validation...")
            is_valid = validate_asset(raw_path)
            if is_valid:
                print(" [PASS] Asset is valid and matches all ICC Visual Rules!")
            else:
                print(" [FAIL] Asset failed visual validation check. See validation.log for details.")
                success = False
                
        except Exception as e:
            print(f" [ERROR] Generation failed with exception: {e}")
            import traceback
            traceback.print_exc()
            success = False
        print("-" * 50)

    if success:
        print("\n[SUCCESS] All pages generated correctly and passed the validator!")
        sys.exit(0)
    else:
        print("\n[FAILURE] One or more assets failed generation or validation.")
        sys.exit(1)

if __name__ == "__main__":
    main()
