"""Generate a tiny test PSD with a few named layers for end-to-end smoke testing."""
from PIL import Image, ImageDraw, ImageFont
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
import sys

W, H = 1080, 1080

def layer_img(color, draw_fn=None):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if draw_fn:
        draw_fn(im)
    else:
        im.paste(color, (0, 0, W, H))
    return im

def draw_bg(im):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, H], fill=(245, 233, 214, 255))

def draw_product(im):
    d = ImageDraw.Draw(im)
    d.ellipse([340, 340, 740, 740], fill=(180, 80, 60, 255))

def draw_headline(im):
    d = ImageDraw.Draw(im)
    d.rectangle([120, 120, 960, 220], fill=(40, 40, 40, 255))

def draw_logo(im):
    d = ImageDraw.Draw(im)
    d.rectangle([60, 60, 220, 110], fill=(20, 20, 20, 255))

def draw_cta(im):
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([420, 880, 660, 960], radius=20, fill=(60, 120, 80, 255))

# Build PSD using psd-tools API
psd = PSDImage.new(mode="RGBA", size=(W, H))
psd.append(PixelLayer.frompil(layer_img(None, draw_bg), psd, "Background"))
psd.append(PixelLayer.frompil(layer_img(None, draw_product), psd, "Product"))
psd.append(PixelLayer.frompil(layer_img(None, draw_headline), psd, "Headline"))
psd.append(PixelLayer.frompil(layer_img(None, draw_cta), psd, "CTA"))
psd.append(PixelLayer.frompil(layer_img(None, draw_logo), psd, "Logo"))

out = sys.argv[1] if len(sys.argv) > 1 else "test.psd"
psd.save(out)
print(f"wrote {out}")
