"""PSD parsing worker. POST /parse → ParsedPsd JSON + writes per-layer PNGs.

Spec from PRD §10a:
- Each layer PNG is exported at its *effects-inclusive* bounding box (whatever psd-tools
  composites for the layer, padded as needed).
- Coordinates are integer pixels at native PSD resolution.
- Layer ids are stable: l<index> in document order (depth-first, hidden layers counted
  so indices don't shift if visibility flips).
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
from pathlib import Path
from typing import Iterator

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import Layer, Group

app = FastAPI()


def _normalize_bm(bm: str | None) -> str:
    if not bm:
        return "normal"
    s = bm.lower()
    # psd-tools yields e.g. 'normal', 'multiply', 'screen', 'linear_dodge', 'soft_light'
    s = s.replace("_", "-")
    return s


def _walk(layers, depth: int = 0) -> Iterator[tuple[int, Layer | Group]]:
    """Depth-first walk of all layers (incl. groups, incl. hidden)."""
    for layer in layers:
        yield depth, layer
        if isinstance(layer, Group):
            yield from _walk(layer.descendants() if False else layer, depth + 1)  # type: ignore[arg-type]


def _flat_layers(psd: PSDImage) -> list[Layer]:
    out: list[Layer] = []
    def rec(node):
        for layer in node:
            if isinstance(layer, Group):
                rec(layer)
            else:
                out.append(layer)
    rec(psd)
    return out


@app.post("/parse")
async def parse(file: UploadFile = File(...), out_dir: str = Form(...)) -> JSONResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty file")

    psd = PSDImage.open(io.BytesIO(raw))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Flattened preview lives one directory up (alongside source.psd).
    flat_path = out.parent / "flattened.png"
    composite = psd.composite()
    if composite is not None:
        # Cap preview at 1024 wide for downstream prompts; keep aspect.
        comp = composite.convert("RGBA")
        if comp.width > 1024:
            ratio = 1024 / comp.width
            comp = comp.resize((1024, int(comp.height * ratio)))
        # Save full-res preview as flattened.png
        composite.convert("RGBA").save(flat_path, "PNG", optimize=True)

    layers_out: list[dict] = []
    flat = _flat_layers(psd)
    for idx, layer in enumerate(flat):
        lid = f"l{idx}"
        try:
            img = layer.composite()
        except Exception:
            img = None
        if img is None:
            # No raster output (empty layer, adjustment, etc.) — skip.
            continue

        # Effects-inclusive bbox from psd-tools layer.bbox.
        bbox = layer.bbox  # (left, top, right, bottom) in canvas coords
        if bbox is None or bbox == (0, 0, 0, 0):
            continue
        left, top, right, bottom = bbox
        w, h = right - left, bottom - top
        if w <= 0 or h <= 0:
            continue

        # Resize the composited image if it doesn't match bbox (defensive).
        if img.size != (w, h):
            img = img.resize((w, h))

        png_path = out / f"{lid}.png"
        img.convert("RGBA").save(png_path, "PNG", optimize=True)

        # Tight content bbox (opaque pixels) — optional.
        content_bbox = img.convert("RGBA").getbbox()
        cb = None
        if content_bbox is not None:
            cx, cy, cx2, cy2 = content_bbox
            cb = {"x": left + cx, "y": top + cy, "w": cx2 - cx, "h": cy2 - cy}

        kind = "raster"
        try:
            if layer.kind == "type":
                kind = "text"
            elif layer.kind == "smartobject":
                kind = "smartObject"
            elif layer.kind == "shape":
                kind = "shape"
        except Exception:
            pass

        layers_out.append({
            "lid": lid,
            "name": str(layer.name) if layer.name is not None else lid,
            "x": int(left),
            "y": int(top),
            "w": int(w),
            "h": int(h),
            "z": idx,  # painter order; bottom-most layer first in psd-tools
            "opacity": round((layer.opacity or 255) / 255.0, 4),
            "bm": _normalize_bm(getattr(layer.blend_mode, "name", None) or str(layer.blend_mode)),
            "pngPath": str(png_path),
            "kind": kind,
            "hidden": not bool(layer.visible),
            "contentBbox": cb,
        })

    parsed = {
        "hash": hashlib.sha256(raw).hexdigest(),
        "filename": file.filename or "untitled.psd",
        "width": int(psd.width),
        "height": int(psd.height),
        "flattenedPath": str(flat_path),
        "layers": layers_out,
    }
    return JSONResponse(parsed)


@app.get("/healthz")
async def healthz():
    return {"ok": True}
