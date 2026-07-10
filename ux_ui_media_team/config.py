import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Define custom exception
class ConfigurationError(Exception):
    """Custom exception raised for configuration-related errors."""
    pass

# Determine project root
CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent

# Attempt to load environment variables from .env
ENV_LOCATIONS = [
    CURRENT_DIR / ".env",
    ROOT_DIR / ".env"
]

def load_environment(dotenv_path=None) -> None:
    """Attempts to load environment variables from .env locations, handling errors gracefully."""
    loaded = False
    if dotenv_path is not None:
        try:
            load_dotenv(dotenv_path=dotenv_path)
            loaded = True
        except Exception as e:
            print(f"Warning: Failed to parse env file at {dotenv_path}: {e}", file=sys.stderr)
    else:
        for env_path in ENV_LOCATIONS:
            if env_path.exists():
                try:
                    load_dotenv(dotenv_path=env_path)
                    loaded = True
                    break
                except Exception as e:
                    # Handle syntax/malformed env files without crashing, fallback to system environment variables
                    print(f"Warning: Failed to parse env file at {env_path}: {e}", file=sys.stderr)
    if not loaded:
        try:
            load_dotenv()
        except Exception:
            pass

# Load environment on module import
load_environment()

# Alias for testing compatibility
load_env = load_environment

def get_api_key() -> str:
    """Retrieves the GEMINI_API_KEY from environment.
    
    Returns:
        str: The stripped API key.
        
    Raises:
        ConfigurationError: If the key is missing or empty.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key is None:
        raise ConfigurationError("GEMINI_API_KEY is not defined in the environment.")
    
    # Strip whitespace
    api_key = api_key.strip()
    
    # Strip outer quotes if present
    if (api_key.startswith('"') and api_key.endswith('"')) or (api_key.startswith("'") and api_key.endswith("'")):
        api_key = api_key[1:-1].strip()
        
    if not api_key:
        raise ConfigurationError("GEMINI_API_KEY is defined but empty in the environment.")
        
    return api_key

def get_env_float(key: str, default: float) -> float:
    """Gets an environment variable as float, fallback to default if missing or invalid."""
    val = os.environ.get(key)
    if val is None:
        return default
    val = val.strip()
    if not val:
        return default
    try:
        return float(val)
    except ValueError:
        return default

def get_env_int(key: str, default: int) -> int:
    """Gets an environment variable as int, fallback to default if missing or invalid."""
    val = os.environ.get(key)
    if val is None:
        return default
    val = val.strip()
    if not val:
        return default
    try:
        return int(val)
    except ValueError:
        return default

def get_raw_cache_dir() -> str:
    """Returns the configured RAW_CACHE_DIR, falling back to default if not set."""
    path = os.environ.get("RAW_CACHE_DIR") or os.environ.get("CACHE_DIR")
    if path:
        path = path.strip()
    if not path:
        path = str(ROOT_DIR / "ux_ui_media_team" / "raw_cache")
    return path

def get_output_dir() -> str:
    """Returns the configured OUTPUT_DIR, falling back to default if not set."""
    path = os.environ.get("OUTPUT_DIR")
    if path:
        path = path.strip()
    if not path:
        path = str(ROOT_DIR / "web" / "assets")
    return path

def get_max_retries() -> int:
    """Returns the configured MAX_RETRIES, falling back to 3 if not set or invalid."""
    return get_env_int("MAX_RETRIES", 3)

def get_timeout() -> int:
    """Returns the configured TIMEOUT, falling back to 30 if not set or invalid."""
    return get_env_int("TIMEOUT", 30)

def get_generation_config() -> dict:
    """Returns the default configuration dictionary for Gemini generations.
    
    Supports overrides via environment variables.
    """
    temperature = get_env_float("TEMPERATURE", 0.2)
    top_p = get_env_float("TOP_P", 0.95)
    top_k = get_env_int("TOP_K", 40)
    max_output_tokens = get_env_int("MAX_OUTPUT_TOKENS", 2048)
    response_mime_type = os.environ.get("RESPONSE_MIME_TYPE", "text/plain").strip()
    max_retries = get_max_retries()
    
    return {
        "temperature": temperature,
        "top_p": top_p,
        "top_k": top_k,
        "max_output_tokens": max_output_tokens,
        "response_mime_type": response_mime_type,
        "max_retries": max_retries,
    }

# Try importing google.generativeai dynamically to prevent ModuleNotFoundError
try:
    import google.generativeai as genai
except ImportError:
    genai = None

_client_initialized = False

def get_google_client():
    """Initializes and returns the Google GenAI SDK client (using google.generativeai).
    
    Raises:
        ConfigurationError: If API key is missing or invalid, or if the SDK is not installed.
    """
    global _client_initialized
    
    validate_directories()
    
    api_key = get_api_key()  # Raises ConfigurationError if key is missing/empty
    
    test_mode = os.environ.get("TEST_MODE", "").strip().lower()
    mock_api = os.environ.get("MOCK_API", "").strip().lower()
    
    if genai is None:
        # In offline or mock mode, we can return a dummy/mock client wrapper so it doesn't crash
        if test_mode == "offline" or mock_api == "true":
            class DummyGenAI:
                def __init__(self, key):
                    self.api_key = key
                def configure(self, api_key):
                    self.api_key = api_key
            return DummyGenAI(api_key)
        raise ConfigurationError("google-generativeai package is not installed. Please install requirements.")
    
    if not _client_initialized:
        if test_mode != "offline" and mock_api != "true":
            try:
                genai.configure(api_key=api_key)
            except Exception as e:
                raise ConfigurationError(f"Failed to configure Google GenAI client: {e}")
        _client_initialized = True
        
    return genai

def validate_directories() -> None:
    """Validates that cache and output directories exist (or can be created) and are writable.
    
    Raises:
        ConfigurationError: If any directory is not writable or cannot be created.
    """
    raw_cache_dir = get_raw_cache_dir()
    output_dir = get_output_dir()
    
    for name, path_str in [("Cache directory", raw_cache_dir), ("Output directory", output_dir)]:
        path = Path(path_str)
        try:
            path.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            raise ConfigurationError(f"{name} '{path_str}' cannot be created: {e}")
        
        # Test write permissions
        test_file = path / f".write_test_{os.getpid()}"
        try:
            with open(test_file, "w", encoding="utf-8") as f:
                f.write("write_test")
            test_file.unlink()
        except Exception as e:
            raise ConfigurationError(f"{name} '{path_str}' is not writable: {e}")

# Validate directories on module load to ensure configuration sanity
validate_directories()
