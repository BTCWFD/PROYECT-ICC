import os
import sys
import shutil
import socket
from unittest.mock import MagicMock

# 1. Setup Path configuration: Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# 2. Block Socket Connections to enforce offline execution (Tier 2 requirement)
# This throws an error if any test or code tries to communicate over HTTP/network.
class NetworkSocketBlockedError(RuntimeError):
    pass

def block_network():
    def blocked_socket(*args, **kwargs):
        raise NetworkSocketBlockedError("Network socket connections are blocked by the offline test runner.")
    socket.socket = blocked_socket

block_network()

# 3. Programmatically generate mock fixtures on startup
# This ensures that files like mock_raw_image.png are present before tests run.
try:
    from test.e2e.generate_fixtures import create_fixtures
    create_fixtures()
except Exception as e:
    print(f"Warning: Failed to auto-generate fixtures: {e}")

# 4. Google GenAI SDK Mocks
# We mock google.generativeai and inject it into sys.modules so that no live calls are made.
FIXTURES_DIR = os.path.join(PROJECT_ROOT, "test", "e2e", "fixtures")

class MockImage:
    def __init__(self, filename="mock_raw_image.png"):
        self.filename = filename
    def save(self, path):
        src = os.path.join(FIXTURES_DIR, self.filename)
        shutil.copy(src, path)
    @property
    def _pil_image(self):
        # Return Pillow Image
        from PIL import Image
        return Image.open(os.path.join(FIXTURES_DIR, self.filename))

class MockImageResponse:
    def __init__(self, filename="mock_raw_image.png"):
        self.images = [MockImage(filename)]
        self.generated_images = [type('GenImg', (object,), {
            'image': type('ImgObj', (object,), {
                'image_bytes': open(os.path.join(FIXTURES_DIR, filename), "rb").read()
            })()
        })()]

class MockVideoResponse:
    def __init__(self, filename="mock_raw_video.mp4"):
        self.video_path = os.path.join(FIXTURES_DIR, filename)
        self.generated_videos = [type('GenVid', (object,), {
            'bytes': open(os.path.join(FIXTURES_DIR, filename), "rb").read() if os.path.exists(os.path.join(FIXTURES_DIR, filename)) else b"mock-video-bytes"
        })()]

# We define the GenAI SDK structure
mock_sdk = MagicMock()

# Mock models
def get_model_mock(model_name):
    mock_model = MagicMock()
    
    if "imagen" in model_name:
        # Mock Imagen behavior
        # In generator.py, image tests can override the behavior to return malformed images
        def generate_images(prompt, **kwargs):
            if "malformed_text" in prompt or "text" in prompt.lower() and "no text" not in prompt.lower():
                return MockImageResponse("mock_malformed_text.png")
            elif "dark" in prompt or "brightness" in prompt.lower():
                return MockImageResponse("mock_dark_image.png")
            elif "non_monochrome" in prompt or "forbidden_color" in prompt:
                return MockImageResponse("mock_non_monochrome.png")
            return MockImageResponse("mock_raw_image.png")
        mock_model.generate_images = generate_images
        
    elif "veo" in model_name:
        # Mock Veo video behavior
        def generate_video(prompt, **kwargs):
            return MockVideoResponse("mock_raw_video.mp4")
        mock_model.generate_video = generate_video
        
    else:
        # Mock Gemini Text metadata behavior
        mock_response = MagicMock()
        mock_response.text = "Mocked LLM metadata output"
        mock_model.generate_content.return_value = mock_response
        
    return mock_model

mock_sdk.GenerativeModel.side_effect = get_model_mock
mock_sdk.ImageGenerationModel.side_effect = get_model_mock
mock_sdk.VideoGenerationModel.side_effect = get_model_mock

# Inject into sys.modules
sys.modules['google'] = MagicMock()
sys.modules['google.generativeai'] = mock_sdk
sys.modules['google.genai'] = mock_sdk
