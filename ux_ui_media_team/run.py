import os
import sys
import json
import argparse
import time

from ux_ui_media_team.config import get_api_key, get_generation_config, ConfigurationError
from ux_ui_media_team.generator import generate_page_assets, parse_media_prompts, PromptParserError, GenerationError
from ux_ui_media_team.optimizer import optimize_image, optimize_video, OptimizationError
from ux_ui_media_team.validator import validate_asset

LOCK_FILE = "ux_ui_media_team/run.lock"

def acquire_lock():
    """Acquires a concurrency lock to prevent parallel runs."""
    if os.path.exists(LOCK_FILE):
        # Check if lock is stale (older than 10 minutes)
        if time.time() - os.path.getmtime(LOCK_FILE) > 600:
            try:
                os.remove(LOCK_FILE)
            except Exception:
                pass
        else:
            print("Error: Another instance of run.py is currently running.", file=sys.stderr)
            sys.exit(1)
    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))

def release_lock():
    """Releases the concurrency lock."""
    if os.path.exists(LOCK_FILE):
        try:
            os.remove(LOCK_FILE)
        except Exception:
            pass

def main():
    parser = argparse.ArgumentParser(description="ICC UX/UI Media Automation CLI Tool")
    parser.add_argument("--page", type=str, help="Target specific page for asset generation (e.g. homepage, investors, leaderboard, press, onepager, teaser, og-cover)")
    parser.add_argument("--dry-run", action="store_true", help="Parse prompts and verify configurations without calling generation or optimization pipelines")
    parser.add_argument("--force", action="store_true", help="Force overwrite of existing files in the output directory")
    
    args = parser.parse_args()
    
    # 1. Acquire Lock (Tier 2 requirement)
    acquire_lock()
    
    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "success",
        "dry_run": args.dry_run,
        "pages_processed": [],
        "errors": []
    }
    
    try:
        # 2. Config Verification
        try:
            get_api_key()
            gen_config = get_generation_config()
        except ConfigurationError as ce:
            print(f"Configuration Error: {ce}", file=sys.stderr)
            report["status"] = "failed"
            report["errors"].append(str(ce))
            release_lock()
            sys.exit(1)
            
        # 3. Parse Prompts
        try:
            prompts = parse_media_prompts()
        except PromptParserError as pe:
            print(f"Parser Error: {pe}", file=sys.stderr)
            report["status"] = "failed"
            report["errors"].append(str(pe))
            release_lock()
            sys.exit(1)
            
        if args.dry_run:
            print("Dry run completed successfully. Parsed pages:", list(prompts.keys()))
            release_lock()
            sys.exit(0)
            
        # 4. Resolve Output Directories
        output_dir = os.environ.get("OUTPUT_DIR", "web/assets")
        os.makedirs(output_dir, exist_ok=True)
        
        # 5. Process pages
        pages_to_process = []
        if args.page:
            # Map input page argument to key
            target = args.page.lower()
            if target in ["/", "homepage", "root"]:
                pages_to_process = ["/"]
            elif target in ["og-cover", "og_cover"]:
                pages_to_process = ["og-cover"]
            else:
                # Direct match or extension match
                matched = False
                for k in prompts.keys():
                    if target in k.lower():
                        pages_to_process = [k]
                        matched = True
                        break
                if not matched:
                    print(f"Error: Unknown page '{args.page}'", file=sys.stderr)
                    release_lock()
                    sys.exit(1)
        else:
            # Process all pages defined in prompts
            pages_to_process = list(prompts.keys())
            
        for page in pages_to_process:
            page_clean = "homepage" if page == "/" else page.replace(".html", "")
            print(f"Processing page: {page}...")
            
            # Map page properties
            is_video = prompts[page]["is_video"]
            
            # Skip API generation if we have cache, unless --force is set
            cache_dir = os.environ.get("CACHE_DIR", "ux_ui_media_team/raw_cache")
            raw_filename = f"raw_{page_clean}.mp4" if is_video else f"raw_{page_clean}.png"
            raw_path = os.path.join(cache_dir, raw_filename)
            
            # Check for existing optimized outputs to avoid overwriting unless --force
            # (Tier 2 requirement TC-F5-10)
            final_filename = f"{page_clean}.mp4" if is_video else f"{page_clean}.png"
            final_path = os.path.join(output_dir, final_filename)
            
            if os.path.exists(final_path) and not args.force:
                print(f"Asset for {page} already exists at {final_path}. Skipping (use --force to overwrite).")
                report["pages_processed"].append({
                    "page": page,
                    "status": "skipped",
                    "reason": "already exists"
                })
                continue
                
            try:
                # Check cache hit (Tier 4 requirement TC-T4-05)
                if os.path.exists(raw_path) and not args.force:
                    print(f"Cache hit for raw asset: {raw_path}")
                else:
                    # Call Generator to generate raw asset
                    print(f"Generating raw asset for {page}...")
                    raw_path = generate_page_assets(page)
                    
                # Call Optimizer
                print(f"Optimizing raw asset {raw_path}...")
                if is_video:
                    loop = (page == "/")  # Hompage hero requires looping crossfade
                    opt_results = optimize_video(raw_path, output_dir, loop=loop)
                    primary_output = opt_results["mp4"]
                else:
                    # Determine target dimensions
                    dimensions = (1920, 1080)
                    if page_clean == "og-cover":
                        dimensions = (1200, 630)
                    elif page_clean == "investors" or page_clean == "press":
                        dimensions = (2560, 1440)
                        
                    opt_results = optimize_image(raw_path, output_dir, dimensions)
                    primary_output = opt_results["png"]
                    
                # Call Validator
                print(f"Validating optimized assets for {page}...")
                valid = validate_asset(primary_output)
                if not valid:
                    # In a real pipeline, we might trigger re-generation (TC-T4-04)
                    print(f"Validation failed for {primary_output}.", file=sys.stderr)
                    # We continue but report failure
                    report["pages_processed"].append({
                        "page": page,
                        "status": "failed_validation",
                        "output": primary_output
                    })
                else:
                    print(f"Page {page} processed and validated successfully.")
                    report["pages_processed"].append({
                        "page": page,
                        "status": "success",
                        "output": primary_output
                    })
                    
            except (GenerationError, OptimizationError, Exception) as sub_err:
                print(f"Error processing page {page}: {sub_err}", file=sys.stderr)
                report["errors"].append(f"Page {page}: {sub_err}")
                report["pages_processed"].append({
                    "page": page,
                    "status": "error",
                    "error": str(sub_err)
                })
                
        # Write execution report JSON (Tier 1 requirement TC-F5-05)
        report_path = "ux_ui_media_team/generation_report.json"
        with open(report_path, "w") as rf:
            json.dump(report, rf, indent=2)
        print(f"Execution report written to {report_path}")
        
    finally:
        release_lock()
        
    if report["errors"]:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
