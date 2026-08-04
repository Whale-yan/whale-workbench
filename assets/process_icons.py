# -*- coding: utf-8 -*-
"""Rename and compress icon files for the whale workbench."""
import os
from PIL import Image

ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "icons")

# Mapping: original hash filename -> meaningful name
# Based on visual inspection of each icon
RENAME_MAP = {
    # Whale variants (main character)
    "4E7B8D673601227AFDA0F94574F27602.png": "whale-main.png",       # Whale with water spray, full body
    "7E0BA4EFB08F1FAEBC7ABB614783750B.png": "whale-spray.png",       # Whale with water spray, variant
    "61B1913474EACCD9C1870BE4748EF639.png": "whale-simple.png",      # Simple whale, no spray
    "DD55497C62A42D8F63F3F719CC192DC1.png": "whale-happy.png",       # Happy whale with spray
    "8043271E67944FFD71CE12AAD97461CD.png": "whale-star.png",        # Whale with star on head
    "98AC96C9A3ED4895CAA8E26184DCA23E.png": "whale-tail.png",        # Just the tail

    # Sea creatures
    "3E0C3F1554B7B716DE60E10E0F95C847.png": "jellyfish.png",         # Jellyfish
    "445FE8238DE1182D81C1397F7456DE9C.png": "crab.png",              # Crab
    "BC5F9AC6524ED80978FCA54237A1D35C.png": "octopus.png",           # Octopus
    "DBC514DFAA9BB85AF623C85BC12057D4.png": "shell.png",             # Clam shell

    # Objects
    "5A020F6A517BE6D6B9CFB5D4925C62C4.png": "book-open.png",         # Open book with leaves
    "A46891FF0E1EE5E38B511DDD5A64D391.png": "book-open-2.png",       # Open book variant
    "5263c3653a822cf0281a740d60232153.png": "notebook.png",          # Notebook with bookmark
    "57FF039F5D040F5372C98A5352FBAC51.png": "checklist.png",         # Checklist with checkmarks
    "140F007C2666C14C7D6F2A05CBBB2012.png": "pencil.png",            # Green pencil
    "C205A8008ED26722558A36B0C2471384.png": "pencil-2.png",          # Pencil variant

    # Symbols
    "0FBC84DDBDA9F6CA67A73B9B99307243.png": "badge-star.png",        # Circle badge with star
    "29025C405A2C85BC6C1D2217D6B54162.png": "badge-star-2.png",      # Another badge variant
    "26B2458207C3CAAB4AF690998F034873.png": "star.png",              # Cute star character
    "6686B5F2E372464E1D56CA12E09830F6.png": "shield.png",            # Shield
    "AB4EB0E3985DF3C0DCA7E641BB75F585.png": "lightning.png",         # Lightning bolt
    "A14AD67E50D526B01E5F55E7809D07DC.png": "arrow-up.png",          # Upward growth arrow
    "DE9FDA101A697FFBB36E28891E26FD43.png": "bell.png",              # Bell
    "80AABC71318C4104794AB9098168DA7C.png": "cloud.png",             # Cloud

    # 3x3 grid sheet - skip for individual use
    "2CB346D28E32DC98ECA34A26035BE4C2.png": "whale-sheet.png",
}

# Target size for icons (they're displayed at 22-56px, so 128px is plenty)
TARGET_SIZE = 128

def process_icons():
    processed = []
    skipped = []

    for old_name, new_name in RENAME_MAP.items():
        old_path = os.path.join(ICONS_DIR, old_name)
        new_path = os.path.join(ICONS_DIR, new_name)

        if not os.path.exists(old_path):
            print(f"SKIP (not found): {old_name}")
            skipped.append(old_name)
            continue

        try:
            img = Image.open(old_path)

            # Convert to RGBA if not already
            if img.mode != "RGBA":
                img = img.convert("RGBA")

            # Resize to target size (keep aspect ratio, pad if needed)
            w, h = img.size
            if w > TARGET_SIZE or h > TARGET_SIZE:
                ratio = min(TARGET_SIZE / w, TARGET_SIZE / h)
                new_w = int(w * ratio)
                new_h = int(h * ratio)
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            # Save as optimized PNG
            img.save(new_path, "PNG", optimize=True)

            old_size = os.path.getsize(old_path)
            new_size = os.path.getsize(new_path)
            ratio = (1 - new_size / old_size) * 100

            print(f"OK: {old_name} -> {new_name}  {old_size//1024}KB -> {new_size//1024}KB ({ratio:.0f}% smaller)")
            processed.append(new_name)

            # Remove original file if different from new
            if old_path != new_path:
                os.remove(old_path)

        except Exception as e:
            print(f"ERROR: {old_name} -> {new_name}: {e}")
            skipped.append(old_name)

    # Clean up non-icon files (image*.png, paste-image*.png)
    for f in os.listdir(ICONS_DIR):
        if f.startswith("image") or f.startswith("paste-image"):
            os.remove(os.path.join(ICONS_DIR, f))
            print(f"CLEANUP: removed {f}")

    print(f"\nDone: {len(processed)} icons processed, {len(skipped)} skipped")
    return processed

if __name__ == "__main__":
    process_icons()
