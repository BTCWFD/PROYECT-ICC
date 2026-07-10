import os
import sys
import shutil
import tempfile
import importlib
from pathlib import Path

# Add current directory to path so we can import config
CURRENT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CURRENT_DIR))

def test_runner():
    print("========================================")
    print("Running config.py verification tests...")
    print("========================================")
    
    # Save original environment to restore it later
    original_env = dict(os.environ)
    
    # Clean up environment to test fallbacks
    for key in ["GEMINI_API_KEY", "RAW_CACHE_DIR", "CACHE_DIR", "OUTPUT_DIR", "MAX_RETRIES", "TIMEOUT", "TEMPERATURE", "TOP_P", "TOP_K", "MAX_OUTPUT_TOKENS", "TEST_MODE", "MOCK_API"]:
        os.environ.pop(key, None)
        
    import config
    try:
        importlib.reload(config)
    except Exception as e:
        print(f"✗ Failed to reload config module during setup: {e}")
        return False
    
    # 1. Test fallback when env vars are not set
    print("\n--- Test 1: Fallback Parameters ---")
    try:
        # Expected defaults
        assert config.get_max_retries() == 3
        assert config.get_timeout() == 30
        gen_config = config.get_generation_config()
        assert gen_config["temperature"] == 0.2
        assert gen_config["top_p"] == 0.95
        assert gen_config["top_k"] == 40
        assert gen_config["max_output_tokens"] == 2048
        assert gen_config["response_mime_type"] == "text/plain"
        
        # Verify default paths contain project folders
        assert "raw_cache" in config.get_raw_cache_dir()
        assert "assets" in config.get_output_dir()
        print("✓ Fallback values successfully applied.")
    except AssertionError as e:
        print(f"✗ Fallback values test failed: {e}")
        return False
        
    # 2. Test missing critical key raises ConfigurationError
    print("\n--- Test 2: Missing Critical Key ---")
    try:
        config.get_api_key()
        print("✗ Expected ConfigurationError when API key is missing, but no exception was raised.")
        return False
    except config.ConfigurationError as e:
        print(f"✓ Correctly raised ConfigurationError: {e}")
        
    # 3. Test empty API key raises ConfigurationError
    print("\n--- Test 3: Empty API Key ---")
    os.environ["GEMINI_API_KEY"] = ""
    try:
        importlib.reload(config)
    except Exception as e:
        # We expect reload to work fine even if GEMINI_API_KEY is empty,
        # because the import only validates directories. Let's make sure it doesn't crash on reload.
        pass
        
    try:
        config.get_api_key()
        print("✗ Expected ConfigurationError when API key is empty string, but no exception was raised.")
        return False
    except config.ConfigurationError as e:
        print(f"✓ Correctly raised ConfigurationError for empty string: {e}")
        
    # 4. Test extraneous space stripping
    print("\n--- Test 4: Extraneous Spaces Stripping ---")
    os.environ["GEMINI_API_KEY"] = "   my-secret-key-123   "
    os.environ["MAX_RETRIES"] = "  5  "
    os.environ["TEMPERATURE"] = "  0.7  "
    try:
        importlib.reload(config)
        assert config.get_api_key() == "my-secret-key-123"
        assert config.get_max_retries() == 5
        assert config.get_generation_config()["temperature"] == 0.7
        print("✓ Spaces correctly stripped from config values.")
    except AssertionError as e:
        print(f"✗ Space stripping test failed: {e}")
        return False
    except Exception as e:
        print(f"✗ Space stripping test failed with exception: {e}")
        return False
        
    # 5. Test config parsing types
    print("\n--- Test 5: Config Parsing Types ---")
    try:
        assert isinstance(config.get_max_retries(), int)
        assert isinstance(config.get_generation_config()["temperature"], float)
        assert isinstance(config.get_generation_config()["top_k"], int)
        print("✓ Types correctly cast to int/float.")
    except AssertionError as e:
        print(f"✗ Type casting test failed: {e}")
        return False

    # 6. Test invalid directory paths/permissions
    print("\n--- Test 6: Invalid/Read-only Directory Permissions ---")
    temp_dir = tempfile.mkdtemp()
    
    # Point cache directory to a subdirectory of a file, which is impossible to create
    file_path = Path(temp_dir) / "some_file.txt"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("I am a file")
    
    impossible_dir = file_path / "subdir"
    os.environ["RAW_CACHE_DIR"] = str(impossible_dir)
    os.environ["OUTPUT_DIR"] = str(temp_dir)
    os.environ["GEMINI_API_KEY"] = "mock-key"
    
    try:
        # Reloading config should raise ConfigurationError since the path is invalid/impossible
        importlib.reload(config)
        print("✗ Expected ConfigurationError for impossible directory path, but no exception was raised.")
        return False
    except config.ConfigurationError as e:
        print(f"✓ Correctly raised ConfigurationError for invalid directory path: {e}")
    except Exception as e:
        print(f"✗ Unexpected exception raised: {type(e).__name__}: {e}")
        return False

    # Restore original environment
    os.environ.clear()
    os.environ.update(original_env)
    
    # Clean up temp files
    try:
        shutil.rmtree(temp_dir)
    except Exception:
        pass
        
    print("\n========================================")
    print("All configuration tests PASSED!")
    print("========================================")
    return True

if __name__ == "__main__":
    success = test_runner()
    sys.exit(0 if success else 1)
