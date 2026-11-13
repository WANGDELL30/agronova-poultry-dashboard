import os

from .config import max_image_pixels_from_env

# Second safeguard for AUDIT R2: OpenCV reads this once, at import, so set it before any `import cv2`
# in this package. An explicit OPENCV_IO_MAX_IMAGE_PIXELS in the environment wins.
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(max_image_pixels_from_env()))
