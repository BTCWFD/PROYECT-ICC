import os
import pytest
from unittest.mock import patch

from ux_ui_media_team.config import (
    get_api_key, 
    get_generation_config, 
    get_google_client, 
    ConfigurationError
)

@pytest.fixture(autouse=True)
def clean_env():
    """Fixture to save and restore environment variables after each test."""
    old_env = dict(os.environ)
    # Remove variables that might interfere with tests
    for key in ["GEMINI_API_KEY", "MAX_RETRIES", "TEMPERATURE", "CACHE_DIR", "OUTPUT_DIR"]:
        if key in os.environ:
            del os.environ[key]
    yield
    os.environ.clear()
    os.environ.update(old_env)

# ==========================================
# TIER 1: Feature Coverage Tests
# ==========================================

def test_load_api_key_success():
    """TC-F1-01: Verify get_api_key() retrieves correct API key from environment."""
    os.environ["GEMINI_API_KEY"] = "test-key-abc"
    assert get_api_key() == "test-key-abc"

def test_default_configurations():
    """TC-F1-02: Verify get_generation_config() returns correct default parameter settings."""
    config = get_generation_config()
    assert config["temperature"] == 0.2
    assert config["top_p"] == 0.95
    assert config["max_output_tokens"] == 2048
    assert config["max_retries"] == 3

def test_client_creation():
    """TC-F1-03: Verify get_google_client() successfully creates and returns the API client instance."""
    os.environ["GEMINI_API_KEY"] = "test-key-abc"
    client = get_google_client()
    assert client is not None

def test_fallback_parameters():
    """TC-F1-04: Verify fallback values are applied when optional configuration parameters are omitted in the environment."""
    # Ensure optional parameters are missing
    if "TEMPERATURE" in os.environ:
        del os.environ["TEMPERATURE"]
    config = get_generation_config()
    assert config["temperature"] == 0.2 # default fallback

def test_config_parsing_types():
    """TC-F1-05: Verify that string numeric environment values (like MAX_RETRIES="5") are cast to correct numeric types."""
    os.environ["MAX_RETRIES"] = "5"
    os.environ["TEMPERATURE"] = "0.7"
    config = get_generation_config()
    assert isinstance(config["max_retries"], int)
    assert config["max_retries"] == 5
    assert isinstance(config["temperature"], float)
    assert config["temperature"] == 0.7

# ==========================================
# TIER 2: Boundary & Corner Cases Tests
# ==========================================

def test_missing_critical_key_raises_error():
    """TC-F1-06: Verify get_api_key() throws ConfigurationError when GEMINI_API_KEY is not present."""
    if "GEMINI_API_KEY" in os.environ:
        del os.environ["GEMINI_API_KEY"]
    with pytest.raises(ConfigurationError) as excinfo:
        get_api_key()
    assert "GEMINI_API_KEY is not defined" in str(excinfo.value)

def test_empty_string_value_raises_error():
    """TC-F1-07: Verify that GEMINI_API_KEY="" is treated as missing and raises appropriate error."""
    os.environ["GEMINI_API_KEY"] = ""
    with pytest.raises(ConfigurationError) as excinfo:
        get_api_key()
    assert "defined but empty" in str(excinfo.value)

def test_extraneous_spaces_stripped():
    """TC-F1-08: Verify leading/trailing whitespaces in env values are stripped correctly."""
    os.environ["GEMINI_API_KEY"] = "  my-spaced-key  "
    assert get_api_key() == "my-spaced-key"

def test_malformed_env_format_fallback():
    """TC-F1-09: Verify configuration loader handles syntax errors in .env files gracefully by falling back to environment."""
    # We can test this by writing a malformed line or mocking/testing the load_env function.
    from ux_ui_media_team.config import load_env
    temp_env_path = "temp_malformed.env"
    with open(temp_env_path, "w") as f:
        f.write("GEMINI_API_KEY\n") # Syntax error: no '=' symbol
        f.write("MAX_RETRIES = invalid\n")
    try:
        os.environ["GEMINI_API_KEY"] = "system-env-key"
        load_env(temp_env_path)
        # Should not crash, and should fall back to system variable
        assert os.environ.get("GEMINI_API_KEY") == "system-env-key"
    finally:
        if os.path.exists(temp_env_path):
            os.remove(temp_env_path)

def test_invalid_directory_permissions():
    """TC-F1-10: Verify system validates write permissions for cache/output paths configured in env."""
    os.environ["GEMINI_API_KEY"] = "test-key"
    
    # Set cache dir to an impossible / un-creatable or read-only directory path.
    # On Windows, using invalid characters in filename raises OSError.
    # On other systems, trying to write to root "/" without permission works.
    # We can use a path containing invalid characters like '<>?*|' to trigger directory creation failures.
    os.environ["CACHE_DIR"] = "invalid_dir<>|*"
    with pytest.raises(ConfigurationError) as excinfo:
        get_google_client()
    assert "cannot be created" in str(excinfo.value)
