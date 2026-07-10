import os
import subprocess
from PIL import Image, ImageDraw

def create_fixtures():
    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)
    
    # 1. mock_raw_image.png
    # Valid 2560x1440 image matching monochrome/gold rules, with subject on the right third, left third empty (negative space).
    img_valid = Image.new("RGB", (2560, 1440), (10, 10, 10))
    draw_valid = ImageDraw.Draw(img_valid)
    # Draw a grey lunar surface on the right side
    draw_valid.rectangle([1700, 200, 2500, 1200], fill=(120, 120, 120))
    # Draw some gold highlights (#ffd35b -> 255, 211, 91)
    draw_valid.rectangle([2100, 400, 2200, 500], fill=(255, 211, 91))
    img_valid.save(os.path.join(fixtures_dir, "mock_raw_image.png"))
    print("Created mock_raw_image.png")

    # 2. mock_malformed_text.png
    # Image containing text for OCR failure check
    img_text = Image.new("RGB", (2560, 1440), (10, 10, 10))
    draw_text = ImageDraw.Draw(img_text)
    # Draw a grey rectangle and some text
    draw_text.rectangle([1700, 200, 2500, 1200], fill=(120, 120, 120))
    # Draw text "ILLEGAL_TEXT"
    # We can draw it as a series of rectangles or simple lines if default font is not loaded,
    # but PIL has a default font that we can use, or we can draw shapes that look like text,
    # or just use draw.text if it works. Let's do both to be safe.
    try:
        draw_text.text((1800, 600), "WARNING: TEXT", fill=(255, 255, 255))
    except Exception:
        # Fallback to drawing a clear text-like grid/lines
        pass
    # We also add a custom attribute or metadata, but validator OCR will search for text.
    # We can also draw some letters manually using lines just in case OCR is simple
    draw_text.line([(1800, 600), (1800, 700)], fill=(255, 255, 255), width=10) # 'I'
    draw_text.line([(1820, 600), (1850, 600)], fill=(255, 255, 255), width=10) # 'T'
    draw_text.line([(1835, 600), (1835, 700)], fill=(255, 255, 255), width=10)
    img_text.save(os.path.join(fixtures_dir, "mock_malformed_text.png"))
    print("Created mock_malformed_text.png")

    # 3. mock_dark_image.png
    # Image with very low brightness (average pixel value near 0)
    img_dark = Image.new("RGB", (2560, 1440), (2, 2, 2))
    img_dark.save(os.path.join(fixtures_dir, "mock_dark_image.png"))
    print("Created mock_dark_image.png")

    # 4. mock_non_monochrome.png
    # Image containing forbidden colors like blue or magenta (e.g. blue = 0, 0, 255)
    img_colored = Image.new("RGB", (2560, 1440), (10, 10, 10))
    draw_colored = ImageDraw.Draw(img_colored)
    draw_colored.rectangle([1700, 200, 2500, 1200], fill=(0, 0, 255)) # Bright blue square
    img_colored.save(os.path.join(fixtures_dir, "mock_non_monochrome.png"))
    print("Created mock_non_monochrome.png")

    # 5. mock_raw_video.mp4
    # A valid, short video file (1 second, no audio, 1920x1080)
    video_path = os.path.join(fixtures_dir, "mock_raw_video.mp4")
    try:
        # Use ffmpeg command if available
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", "color=c=gray:s=1920x1080:d=1.5:r=25", # 1.5s video to have enough duration for 0.5s xfade tests
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            video_path
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("Created mock_raw_video.mp4 using ffmpeg")
    except Exception as e:
        print(f"Could not generate mock_raw_video.mp4 with ffmpeg: {e}")
        # Fallback to writing a small dummy file or using cv2 if available
        try:
            import cv2
            import numpy as np
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(video_path, fourcc, 25.0, (1920, 1080))
            for _ in range(38): # 1.5 seconds at 25 fps
                frame = np.ones((1080, 1920, 3), dtype=np.uint8) * 128
                out.write(frame)
            out.release()
            print("Created mock_raw_video.mp4 using OpenCV")
        except Exception as e2:
            print(f"Could not generate mock_raw_video.mp4 with OpenCV: {e2}")
            # As a ultimate fallback, write a dummy 100-byte file (tests will need to mock video size/validity if ffmpeg/opencv are both missing)
            with open(video_path, "wb") as f:
                f.write(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 2000)
            print("Created a dummy mock_raw_video.mp4 (fallback)")

if __name__ == "__main__":
    create_fixtures()
