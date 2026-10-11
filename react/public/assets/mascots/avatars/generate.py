#!/usr/bin/env python3
"""Generate the knit Hacky avatars: knit-{color}-{flair}.webp (384x384, transparent).

Starts from the knit Hacky cutout (../webp/hacky-knit.webp), then:
  1. hides its stitched cream eyes and mouth under navy knit texture,
  2. recolors the cape for each color id (luminance-preserving, so the knit shading stays),
  3. paints a glowing LED face for each flair (like the onboarding and chat clips),
  4. adds the brass antenna with its gold ball (the cutout has none),
  5. crops a head-and-shoulders bust and downsamples it to 384x384.

Needs numpy and ffmpeg built with libwebp (PIL is not used).

    python3 generate.py                # writes the 18 webp files next to this script
    python3 generate.py --sheets DIR   # also writes contact sheets (full size, 64 px, 40 px)
"""
import argparse
import math
import os
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "webp", "hacky-knit.webp")
W, H = 1236, 1272       # cutout size
PAD = 160               # transparent rows added above the cutout so the antenna fits
OUT = 384               # output size
QUALITY = 85

# App color ids (react/src/mascot-data.js) -> cape color. None keeps the knit orange.
COLORS = {
    "original": None,
    "berry": "#b35cd0",
    "mint": "#58bc94",
    "sunset": "#e0603f",
    "rose": "#e77bb6",
    "ice": "#85cfe4",
}
# Flair id -> (eyes, mouth) of the LED face.
FLAIRS = {
    "none": ("open", "smile"),
    "stars": ("happy", "big"),
    "hearts": ("heart", "smile"),
}
# Bust crop in cutout coordinates: square of side CROP_L centered on (CROP_CX, CROP_CY).
CROP_CX, CROP_CY, CROP_L = 625.0, 425.0, 880.0


# --- small numpy helpers ----------------------------------------------------------
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def box_blur(a, r):
    k = 2 * r + 1
    p = np.pad(a, r, mode="edge")
    c = p.cumsum(0)
    c = np.vstack([np.zeros((1, c.shape[1])), c])
    a = (c[k:] - c[:-k]) / k
    c = a.cumsum(1)
    c = np.hstack([np.zeros((c.shape[0], 1)), c])
    return (c[:, k:] - c[:, :-k]) / k


def blur(a, r):
    """Roughly gaussian blur (three box passes)."""
    return box_blur(box_blur(box_blur(a, r), r), r)


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def luma(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def ffmpeg(args, data=None):
    return subprocess.run(["ffmpeg", "-v", "error", "-y", *args], input=data,
                          capture_output=True, check=True).stdout


def decode_rgba(path, w, h):
    raw = ffmpeg(["-i", path, "-f", "rawvideo", "-pix_fmt", "rgba", "-"])
    return np.frombuffer(raw, np.uint8).reshape(h, w, 4).astype(np.float32) / 255


def resize_premul(prem, size):
    """Lanczos-resize a premultiplied float RGBA image with ffmpeg (16-bit)."""
    h, w = prem.shape[:2]
    data = (np.clip(prem, 0, 1) * 65535 + 0.5).astype("<u2").tobytes()
    raw = ffmpeg(["-f", "rawvideo", "-pix_fmt", "rgba64le", "-s", f"{w}x{h}", "-i", "-",
                  "-vf", f"scale={size}:{size}:flags=lanczos", "-f", "rawvideo",
                  "-pix_fmt", "rgba64le", "-"], data)
    out = np.frombuffer(raw, "<u2").reshape(size, size, 4).astype(np.float32) / 65535
    out = np.clip(out, 0, 1)
    out[..., :3] = np.minimum(out[..., :3], out[..., 3:4])
    return out


def unpremul(prem):
    a = prem[..., 3:4]
    rgb = np.where(a > 1e-4, prem[..., :3] / np.maximum(a, 1e-4), 0)
    return np.concatenate([np.clip(rgb, 0, 1), a], -1)


# --- source -----------------------------------------------------------------------
img = decode_rgba(SRC, W, H)
alpha = img[..., 3]
base_rgb = img[..., :3].copy()
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

# Hide the stitched cream eyes and mouth under navy knit texture.
texture = img[230:330, 590:715, :3]


def cover(rgb, cx, cy, rx, ry):
    x0, y0, w, h = int(cx - rx - 12), int(cy - ry - 12), int(2 * rx + 24), int(2 * ry + 24)
    reps = (math.ceil(h / 200) + 1, math.ceil(w / texture.shape[1]) + 1, 1)
    tile = np.tile(np.concatenate([texture, texture[::-1]], 0), reps)[:h, :w]
    ex = (xx[y0:y0 + h, x0:x0 + w] - cx) / (rx + 7)
    ey = (yy[y0:y0 + h, x0:x0 + w] - cy) / (ry + 7)
    k = (1 - smoothstep(0.9, 1.04, np.sqrt(ex * ex + ey * ey)))[..., None]
    rgb[y0:y0 + h, x0:x0 + w] = rgb[y0:y0 + h, x0:x0 + w] * (1 - k) + tile * k


for cx, cy, rx, ry in [(536, 390, 46, 63), (767, 339, 45, 62), (664, 428, 52, 30)]:
    cover(base_rgb, cx, cy, rx, ry)

# Masks by color: the navy screen (LED glow stays on it) and the orange cape.
r_, g_, b_ = img[..., 0], img[..., 1], img[..., 2]
mx = np.maximum(np.maximum(r_, g_), b_)
mn = np.minimum(np.minimum(r_, g_), b_)
sat = (mx - mn) / np.maximum(mx, 1e-6)
navy = ((b_ > r_ + 0.04) & (mx < 0.55) & (alpha > 0.5)).astype(np.float32)
screen = smoothstep(0.35, 0.6, blur(navy, 6)) * (yy < 600)
screen = np.clip(blur(screen, 3) * 1.05, 0, 1)

warm = ((r_ >= g_) & (g_ >= b_)).astype(np.float32)
hot = warm * smoothstep(0.45, 0.58, sat) * smoothstep(0.12, 0.25, mx)
# Cream stitches have saturated shadow gaps too, so keep only dense saturated regions.
# Density is sampled away from the silhouette (its fringe is warm and saturated on every
# part) and normalized by that interior, so the cape's own edges still count as cape.
interior = (blur((alpha > 0.5).astype(np.float32), 4) > 0.98).astype(np.float32)
density = blur(hot * interior, 6) / np.maximum(blur(interior, 6), 0.05)
cape_region = smoothstep(0.62, 0.82, density) * (yy > 570) * (yy < 1000)
cape_region = smoothstep(0.35, 0.65, blur(cape_region, 2))
near_cape = smoothstep(0.02, 0.25, blur(cape_region, 4))
# Inside the cape recolor everything; just around it (the shadowed creases against the
# body and arms) recolor only the saturated pixels, which leaves the cream alone.
cape = np.clip(np.maximum(smoothstep(0.85, 1.0, cape_region),
                          near_cape * smoothstep(0.42, 0.56, sat)), 0, 1)
cape_core = (cape > 0.95) & (alpha > 0.9)
# Reference tone: a bit above the median, since the eye reads a knit by its lit stitches.
CAPE_LUMA = float(np.percentile(luma(img[..., :3])[cape_core], 62))


def recolor_cape(rgb, target_hex):
    """Scale the target color by each pixel's brightness relative to the reference cape
    tone, so the knit shading carries over. Highlights that overflow fade toward white
    instead of clipping, and keep their hue."""
    if target_hex is None:
        return rgb
    t = hex_rgb(target_hex)
    v = t * (luma(rgb) / CAPE_LUMA)[..., None]
    peak = np.maximum(v.max(-1, keepdims=True), 1.0)
    excess = peak - 1.0
    shaded = v / peak
    shaded = shaded + (1 - shaded) * (excess / (1 + excess)) * 0.9
    k = cape[..., None]
    return rgb * (1 - k) + shaded * k


# --- LED face ---------------------------------------------------------------------
FX0, FY0, FX1, FY1 = 400, 200, 900, 560  # working box around the screen
TILT = math.radians(-12.4)                # the screen leans: the right eye sits higher
EYES = [(540.0, 386.0), (764.0, 337.0)]
MOUTH = (660.0, 450.0)
fyy, fxx = yy[FY0:FY1, FX0:FX1], xx[FY0:FY1, FX0:FX1]
LINE = 11.0                               # half stroke width of the LED lines


def local(cx, cy):
    c, s = math.cos(-TILT), math.sin(-TILT)
    dx, dy = fxx - cx, fyy - cy
    return dx * c - dy * s, dx * s + dy * c  # u along the screen, v down the screen


def ring(u, v, a, b, rad, half):
    qx, qy = np.abs(u) - (a - rad), np.abs(v) - (b - rad)
    out = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - rad
    return np.abs(out) - half


def curve(u, v, us, vs, half):
    d = np.full(u.shape, np.inf, np.float32)
    for x, y in zip(us, vs):
        d = np.minimum(d, np.hypot(u - x, v - y))
    return d - half


def heart(u, v, size):
    """Signed distance to a heart (Inigo Quilez's sdHeart), centered on the eye."""
    k = size / 1.21
    px, py = np.abs(u) / k, -v / k + 0.56
    upper = py + px > 1.0
    d1 = np.hypot(px - 0.25, py - 0.75) - math.sqrt(2) / 4
    t = 0.5 * np.maximum(px + py, 0)
    d2 = np.sqrt(np.minimum(px ** 2 + (py - 1) ** 2, (px - t) ** 2 + (py - t) ** 2)) * np.sign(px - py)
    return np.where(upper, d1, d2) * k


def face_sdf(eyes, mouth):
    """Returns (stroke distance, fill distance) for the face; fill is only for hearts."""
    ds, fill = [], np.full(fxx.shape, np.inf, np.float32)
    for cx, cy in EYES:
        u, v = local(cx, cy)
        if eyes == "open":
            ds.append(ring(u, v, 36, 41, 19, LINE))
        elif eyes == "happy":
            us = np.linspace(-38, 38, 64)
            ds.append(curve(u, v, us, 13 - 34 * (1 - (us / 38) ** 2), LINE))
        else:
            hd = heart(u, v + 2, 92)
            ds.append(np.abs(hd) - LINE)
            fill = np.minimum(fill, hd)
    u, v = local(*MOUTH)
    w, depth = (58, 40) if mouth == "big" else (46, 26)
    us = np.linspace(-w, w, 70)
    ds.append(curve(u, v, us, -14 + depth * (1 - (us / w) ** 2), LINE))
    return np.min(np.stack(ds), 0), fill


CORE = np.array([1.0, 0.82, 0.36], np.float32)
HOT = np.array([1.0, 0.96, 0.78], np.float32)
GLOW = np.array([1.0, 0.55, 0.12], np.float32)
FILL = np.array([0.95, 0.58, 0.16], np.float32)


def paint_face(rgb, eyes, mouth):
    d, fill = face_sdf(eyes, mouth)
    core = 1 - smoothstep(-0.8, 0.8, d)
    hot_ = 1 - smoothstep(-5.0, -2.5, d)
    inner = (1 - smoothstep(-0.8, 0.8, fill)) * (1 - core)  # heart interior: dim amber
    lit = np.maximum(core, inner * 0.5)
    glow = np.clip(blur(lit, 5) * 1.0 + blur(lit, 13) * 0.9, 0, 1)
    scr = screen[FY0:FY1, FX0:FX1, None]
    region = rgb[FY0:FY1, FX0:FX1]
    region = region + GLOW * (glow * 0.8 * (1 - lit))[..., None] * scr
    region = region * (1 - core[..., None]) + CORE * core[..., None]
    region = region * (1 - inner[..., None] * 0.6) + FILL * (inner[..., None] * 0.6)
    region = region * (1 - hot_[..., None] * 0.6) + HOT * (hot_[..., None] * 0.6)
    out = rgb.copy()
    out[FY0:FY1, FX0:FX1] = np.clip(region, 0, 1)
    return out


# --- antenna (drawn behind the head, on the padded canvas) ------------------------
def antenna_layer():
    Hc = H + PAD
    ay, ax = np.mgrid[0:Hc, 0:W].astype(np.float32)
    ay -= PAD  # cutout coordinates
    lean = math.radians(12.0)                       # perpendicular to the tilted head top
    ux, uy = -math.sin(lean), -math.cos(lean)       # up the antenna
    nx, ny = -uy, ux                                # across it (points right)
    bx = 600.0
    by = float(np.argmax(alpha[:, int(bx)] > 0.5)) + 18  # starts just inside the head
    stalk_len, ball_r = 60.0, 31.0
    t = (ax - bx) * ux + (ay - by) * uy
    n = (ax - bx) * nx + (ay - by) * ny
    light = np.array([-0.55, -0.6, 0.58])
    light /= np.linalg.norm(light)

    # Brass coil stalk: a cylinder whose radius swells at each turn.
    pitch = 13.0
    turn = np.abs(np.sin(math.pi * t / pitch))
    rad = 8.5 + 3.5 * turn
    inside = smoothstep(0.8, -0.8, np.abs(n) - rad) * smoothstep(-1, 1, t) * smoothstep(1, -1, t - stalk_len)
    q = np.clip(n / rad, -1, 1)
    z = np.sqrt(1 - q * q)
    tilt_ = (np.cos(math.pi * t / pitch) * np.sign(np.sin(math.pi * t / pitch))) * 0.5  # coil slope
    nxv = q * nx + tilt_ * ux * 0.6
    nyv = q * ny + tilt_ * uy * 0.6
    lam = np.clip(nxv * light[0] + nyv * light[1] + z * light[2], 0, 1)
    spec = lam ** 24
    groove = 0.55 + 0.45 * turn
    brass_dark = np.array([0.36, 0.24, 0.08])
    brass = np.array([0.80, 0.60, 0.26])
    col = brass_dark + (brass - brass_dark) * (lam * groove)[..., None] + 0.7 * spec[..., None]
    a_stalk = inside

    # Gold ball on top.
    cx, cy = bx + ux * (stalk_len + ball_r - 4), by + uy * (stalk_len + ball_r - 4)
    dx, dy = (ax - cx) / ball_r, (ay - cy) / ball_r
    rr = dx * dx + dy * dy
    a_ball = smoothstep(1.0 + 1.5 / ball_r, 1.0 - 1.5 / ball_r, np.sqrt(rr))
    zb = np.sqrt(np.clip(1 - rr, 0, 1))
    lb = np.clip(dx * light[0] + dy * light[1] + zb * light[2], 0, 1)
    hx, hy, hz = light[0], light[1], light[2] + 1
    hn = math.sqrt(hx * hx + hy * hy + hz * hz)
    sb = np.clip((dx * hx + dy * hy + zb * hz) / hn, 0, 1) ** 40
    rim = (1 - zb) ** 3
    gold_dark = np.array([0.45, 0.27, 0.05])
    gold = np.array([0.98, 0.74, 0.22])
    bcol = gold_dark + (gold - gold_dark) * lb[..., None] + 0.95 * sb[..., None] + 0.25 * rim[..., None] * gold
    rgb = col * (1 - a_ball[..., None]) + bcol * a_ball[..., None]
    a = np.clip(np.maximum(a_stalk, a_ball), 0, 1)
    return np.concatenate([np.clip(rgb, 0, 1) * a[..., None], a[..., None]], -1).astype(np.float32)


ANTENNA = antenna_layer()


# --- compose ----------------------------------------------------------------------
def render(color, flair):
    rgb = recolor_cape(base_rgb, COLORS[color])
    rgb = paint_face(rgb, *FLAIRS[flair])
    head = np.concatenate([rgb * alpha[..., None], alpha[..., None]], -1)
    canvas = ANTENNA.copy()
    canvas[PAD:] = head + canvas[PAD:] * (1 - alpha[..., None])
    half = CROP_L / 2
    x0, y0 = int(round(CROP_CX - half)), int(round(CROP_CY - half)) + PAD
    L = int(CROP_L)
    assert x0 >= 0 and y0 >= 0 and x0 + L <= W and y0 + L <= H + PAD
    return unpremul(resize_premul(canvas[y0:y0 + L, x0:x0 + L], OUT))


def encode_webp(rgba, path):
    data = (np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()
    ffmpeg(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{OUT}x{OUT}", "-i", "-",
            "-c:v", "libwebp", "-quality", str(QUALITY), "-compression_level", "6",
            "-pix_fmt", "yuva420p", "-frames:v", "1", path], data)


# --- contact sheets ---------------------------------------------------------------
def sheet(paths, size, bg_hex, out_path, circle):
    bg = hex_rgb(bg_hex)
    gap = max(8, size // 6)
    cell = size + 2 * gap
    yy_, xx_ = np.mgrid[0:size, 0:size].astype(np.float32)
    rad = np.hypot(xx_ - (size - 1) / 2, yy_ - (size - 1) / 2)
    mask = smoothstep(size / 2 + 0.5, size / 2 - 0.5, rad) if circle else np.ones((size, size), np.float32)
    frames = []
    for p in paths:
        rgba = decode_rgba(p, OUT, OUT)
        prem = np.concatenate([rgba[..., :3] * rgba[..., 3:4], rgba[..., 3:4]], -1)
        small = prem if size == OUT else resize_premul(prem, size)
        comp = small[..., :3] + bg * (1 - small[..., 3:4])
        if circle:  # avatar disc: a slightly lifted background so the circle shows
            disc = bg + (np.array([0.5, 0.5, 0.5]) - bg) * 0.12
            comp = small[..., :3] + disc * (1 - small[..., 3:4])
            comp = comp * mask[..., None] + bg * (1 - mask[..., None])
        frame = np.tile(bg, (cell, cell, 1))
        frame[gap:gap + size, gap:gap + size] = comp
        frames.append((np.clip(frame, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes())
    ffmpeg(["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{cell}x{cell}", "-i", "-",
            "-vf", f"tile={len(FLAIRS)}x{len(paths) // len(FLAIRS)}", "-frames:v", "1", out_path],
           b"".join(frames))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--sheets", help="also write contact sheets into this directory")
    ap.add_argument("--only", help="comma-separated color ids to render (default: all)")
    args = ap.parse_args()
    colors = args.only.split(",") if args.only else list(COLORS)
    paths = []
    for color in colors:
        for flair in FLAIRS:
            path = os.path.join(HERE, f"knit-{color}-{flair}.webp")
            encode_webp(render(color, flair), path)
            paths.append(path)
            print(f"{os.path.basename(path)}  {os.path.getsize(path) / 1024:.1f} KB")
    if args.sheets:
        os.makedirs(args.sheets, exist_ok=True)
        for name, bg in (("dark", "#1b1f27"), ("light", "#f5f6f8")):
            sheet(paths, OUT, bg, os.path.join(args.sheets, f"sheet-full-{name}.png"), False)
            sheet(paths, 64, bg, os.path.join(args.sheets, f"sheet-64-{name}.png"), True)
            sheet(paths, 40, bg, os.path.join(args.sheets, f"sheet-40-{name}.png"), True)
        print("sheets in", args.sheets)


if __name__ == "__main__":
    main()
