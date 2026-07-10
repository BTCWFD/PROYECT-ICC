import os
import sys
import shutil
from pathlib import Path
from PIL import Image

# Add project root to sys.path if not present
CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ux_ui_media_team.optimizer import (
    optimize_image,
    optimize_video,
    check_ffmpeg,
    OptimizationError
)

FIXTURES_DIR = os.path.join(ROOT_DIR, "test", "e2e", "fixtures")
VERIFY_OUT_DIR = os.path.join(ROOT_DIR, "test_opt_verify_output")

def main():
    print("=" * 60)
    print("Running Milestone M3 Optimizer Verification Script")
    print("=" * 60)
    
    # 1. Check FFmpeg availability
    print("Checking FFmpeg and FFprobe availability...")
    try:
        check_ffmpeg()
        print(" [PASS] FFmpeg and FFprobe are available.")
    except OptimizationError as e:
        print(f" [FAIL] FFmpeg check failed: {e}")
        sys.exit(1)
        
    # 2. Ensure fixtures exist
    if not os.path.exists(FIXTURES_DIR) or not os.listdir(FIXTURES_DIR):
        print("Generating mock fixtures...")
        try:
            from test.e2e.generate_fixtures import create_fixtures
            create_fixtures()
            print(" [PASS] Mock fixtures generated successfully.")
        except Exception as e:
            print(f" [FAIL] Failed to generate mock fixtures: {e}")
            sys.exit(1)
    else:
        print(" [PASS] Mock fixtures already exist.")
        
    # 3. Clean and prepare output directory
    if os.path.exists(VERIFY_OUT_DIR):
        shutil.rmtree(VERIFY_OUT_DIR)
    os.makedirs(VERIFY_OUT_DIR, exist_ok=True)
    
    success = True
    
    # 4. Test Image Optimization
    print("\nTesting Image Optimization:")
    print("-" * 50)
    raw_img = os.path.join(FIXTURES_DIR, "mock_raw_image.png")
    target_dims = (1920, 1080)
    
    try:
        print(f"Optimizing {raw_img} to {target_dims}...")
        outputs = optimize_image(raw_img, VERIFY_OUT_DIR, target_dims)
        
        # Verify keys
        for fmt in ["png", "webp", "avif"]:
            if fmt not in outputs:
                print(f" [FAIL] Key {fmt!r} missing from output dictionary.")
                success = False
            else:
                path = outputs[fmt]
                if not os.path.exists(path):
                    print(f" [FAIL] Optimized {fmt} file does not exist: {path}")
                    success = False
                else:
                    size = os.path.getsize(path)
                    print(f"  -> Generated {fmt}: {path} ({size} bytes)")
                    
        # Check png size
        if "png" in outputs and os.path.exists(outputs["png"]):
            with Image.open(outputs["png"]) as img:
                if img.size == target_dims:
                    print(f" [PASS] PNG dimensions match target: {img.size}")
                else:
                    print(f" [FAIL] PNG dimensions mismatch: Expected {target_dims}, got {img.size}")
                    success = False
                    
    except Exception as e:
        print(f" [ERROR] Image optimization failed with exception: {e}")
        import traceback
        traceback.print_exc()
        success = False
        
    # 5. Test Video Optimization (No Loop)
    print("\nTesting Video Optimization (No Loop):")
    print("-" * 50)
    raw_vid = os.path.join(FIXTURES_DIR, "mock_raw_video.mp4")
    
    try:
        print(f"Optimizing video: {raw_vid}...")
        outputs = optimize_video(raw_vid, VERIFY_OUT_DIR, loop=False)
        
        # Verify keys
        for key in ["mp4", "webm", "poster_jpg", "poster_webp", "poster_avif"]:
            if key not in outputs:
                print(f" [FAIL] Key {key!r} missing from output dictionary.")
                success = False
            else:
                path = outputs[key]
                if not os.path.exists(path):
                    print(f" [FAIL] Optimized video/poster file does not exist: {path}")
                    success = False
                else:
                    size = os.path.getsize(path)
                    print(f"  -> Generated {key}: {path} ({size} bytes)")
                    
        # Verify poster size and dimensions
        if "poster_jpg" in outputs and os.path.exists(outputs["poster_jpg"]):
            size_bytes = os.path.getsize(outputs["poster_jpg"])
            if size_bytes < 150000:
                print(f" [PASS] Poster JPG size is {size_bytes} bytes (< 150 KB).")
            else:
                print(f" [FAIL] Poster JPG size is {size_bytes} bytes (not < 150 KB).")
                success = False
                
            with Image.open(outputs["poster_jpg"]) as img:
                if img.size == (1920, 1080):
                    print(f" [PASS] Poster JPG dimensions are {img.size}.")
                else:
                    print(f" [FAIL] Poster JPG dimensions mismatch: Expected (1920, 1080), got {img.size}")
                    success = False
                    
    except Exception as e:
        print(f" [ERROR] Video optimization failed with exception: {e}")
        import traceback
        traceback.print_exc()
        success = False
        
    # 6. Test Video Optimization (Looping)
    print("\nTesting Video Optimization (Looping):")
    print("-" * 50)
    try:
        print(f"Optimizing video with loop=True: {raw_vid}...")
        outputs = optimize_video(raw_vid, VERIFY_OUT_DIR, loop=True)
        
        # Verify files exist
        if os.path.exists(outputs["mp4"]) and os.path.exists(outputs["webm"]):
            print(" [PASS] Looped MP4 and WebM videos generated successfully.")
        else:
            print(" [FAIL] Looped MP4/WebM files are missing.")
            success = False
            
    except Exception as e:
        print(f" [ERROR] Looping video optimization failed with exception: {e}")
        import traceback
        traceback.print_exc()
        success = False
        
    # Clean up output directory
    if os.path.exists(VERIFY_OUT_DIR):
        try:
            shutil.rmtree(VERIFY_OUT_DIR)
        except Exception:
            pass
            
    print("\n" + "=" * 60)
    if success:
        print("[SUCCESS] All optimizer verification checks passed!")
        sys.exit(0)
    else:
        print("[FAILURE] One or more optimizer verification checks failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
