#!/usr/bin/env python3
"""Trace the supplied SciMemo wordmark into editable, image-free SVG paths.

Run from any directory with Python, Pillow, NumPy, and OpenCV installed. The
output preserves the 1254 x 1254 reference coordinates. Source edge noise is
removed before measuring the half-opacity contour and fitting cubic Beziers.
Holes remain oppositely wound subpaths, so SVG's default nonzero fill works.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


SOURCE = Path(__file__).resolve().parents[1] / "references" / "SciMemo Mascot Logo Presentation.png"
OUTPUT = Path(__file__).with_name("wordmark-paths.json")
EDGE_BLUR_PX = 1.05
CONTOUR_SAMPLE_PX = 0.5
CONTOUR_SMOOTH_PX = 0.55
FIT_ERROR_PX = 0.65


def normalize(v: np.ndarray) -> np.ndarray:
    length = np.linalg.norm(v)
    return v / length if length > 1e-12 else v


def bezier(curve: np.ndarray, t: np.ndarray) -> np.ndarray:
    t = np.asarray(t)[..., None]
    return ((1 - t) ** 3 * curve[0] + 3 * (1 - t) ** 2 * t * curve[1]
            + 3 * (1 - t) * t ** 2 * curve[2] + t ** 3 * curve[3])


def generate(points: np.ndarray, u: np.ndarray, left: np.ndarray, right: np.ndarray) -> np.ndarray:
    u1 = 1 - u
    a1 = left[None, :] * (3 * u1 * u1 * u)[:, None]
    a2 = right[None, :] * (3 * u1 * u * u)[:, None]
    base = (points[0][None, :] * (u1 ** 3 + 3 * u1 * u1 * u)[:, None]
            + points[-1][None, :] * (3 * u1 * u * u + u ** 3)[:, None])
    delta = points - base
    matrix = np.array([[np.sum(a1 * a1), np.sum(a1 * a2)],
                       [np.sum(a1 * a2), np.sum(a2 * a2)]])
    vector = np.array([np.sum(a1 * delta), np.sum(a2 * delta)])
    try:
        alpha = np.linalg.solve(matrix, vector)
    except np.linalg.LinAlgError:
        alpha = np.zeros(2)
    distance = np.linalg.norm(points[-1] - points[0])
    if min(alpha) < distance * 1e-6 or max(alpha) > distance * 3:
        alpha[:] = distance / 3
    return np.array([points[0], points[0] + left * alpha[0],
                     points[-1] + right * alpha[1], points[-1]])


def reparameterize(curve: np.ndarray, points: np.ndarray, u: np.ndarray) -> np.ndarray:
    """Refine curve parameters without changing the contour's point order."""
    first = 3 * np.diff(curve, axis=0)
    second = 2 * np.diff(first, axis=0)
    t = u[:, None]
    derivative = (1 - t) ** 2 * first[0] + 2 * (1 - t) * t * first[1] + t ** 2 * first[2]
    derivative2 = (1 - t) * second[0] + t * second[1]
    delta = bezier(curve, u) - points
    numerator = np.sum(delta * derivative, axis=1)
    denominator = np.sum(derivative * derivative + delta * derivative2, axis=1)
    refined = u - np.divide(numerator, denominator, out=np.zeros_like(u),
                            where=np.abs(denominator) > 1e-12)
    refined = np.clip(refined, 0, 1)
    if np.any(np.diff(refined) < 0):
        return u
    return refined


def fit(points: np.ndarray, left: np.ndarray, right: np.ndarray,
        error: float, depth: int = 0) -> list[np.ndarray]:
    if len(points) == 2:
        distance = np.linalg.norm(points[1] - points[0]) / 3
        return [np.array([points[0], points[0] + left * distance,
                          points[1] + right * distance, points[1]])]
    distances = np.linalg.norm(np.diff(points, axis=0), axis=1)
    u = np.concatenate(([0], np.cumsum(distances)))
    if u[-1] == 0:
        return []
    u /= u[-1]
    curve = generate(points, u, left, right)
    errors = np.sum((bezier(curve, u) - points) ** 2, axis=1)
    split = int(np.argmax(errors))
    if errors[split] <= error ** 2 or depth > 32:
        return [curve]
    # Chord-length parameters are only an initial guess on a broad curve.
    # Refinement lets one smooth cubic replace many short fit fragments.
    if errors[split] <= (error * 6) ** 2:
        for _ in range(5):
            u = reparameterize(curve, points, u)
            curve = generate(points, u, left, right)
            errors = np.sum((bezier(curve, u) - points) ** 2, axis=1)
            split = int(np.argmax(errors))
            if errors[split] <= error ** 2:
                return [curve]
    split = max(1, min(len(points) - 2, split))
    tangent = normalize(points[split - 1] - points[split + 1])
    return (fit(points[:split + 1], left, tangent, error, depth + 1)
            + fit(points[split:], -tangent, right, error, depth + 1))


def fit_closed_contour(points: np.ndarray) -> list[np.ndarray]:
    """Keep measured long straight strokes straight, with tangent joins."""
    simplified = cv2.approxPolyDP(points.astype(np.float32), 0.18, True)[:, 0, :]
    indices = [int(np.argmin(np.sum((points - point) ** 2, axis=1)))
               for point in simplified]
    lines = []
    for start, end in zip(indices, indices[1:] + indices[:1]):
        if np.linalg.norm(points[end] - points[start]) >= 18:
            lines.append((start, end))
    if lines:
        # Rotate the cyclic sequence to the first long line so every gap can
        # be fitted with the exact outgoing and incoming line directions.
        origin = lines[0][0]
        points = np.roll(points, -origin, axis=0)
        lines = sorted(((start - origin) % len(points), (end - origin) % len(points))
                       for start, end in lines)
        extended = np.vstack((points, points, points[0]))
        curves = []
        for index, (start, end) in enumerate(lines):
            end = end if end > start else end + len(points)
            start_point, end_point = extended[start], extended[end]
            direction = normalize(end_point - start_point)
            step = (end_point - start_point) / 3
            curves.append(np.array([start_point, start_point + step,
                                    start_point + step * 2, end_point]))
            next_start, next_end = lines[(index + 1) % len(lines)]
            if next_start <= start:
                next_start += len(points)
                next_end += len(points)
            if next_end <= next_start:
                next_end += len(points)
            if next_start > end:
                incoming = normalize(extended[next_end] - extended[next_start])
                curves.extend(fit(extended[end:next_start + 1], direction,
                                  -incoming, FIT_ERROR_PX))
        return curves
    # Round contours share tangents across both halves and the closed seam.
    first = int(np.argmin(points[:, 0]))
    points = np.roll(points, -first, axis=0)
    split = int(np.argmax(np.sum((points - points[0]) ** 2, axis=1)))
    tangent0 = normalize(points[2] - points[-2])
    tangent1 = normalize(points[(split + 2) % len(points)] - points[split - 2])
    return (fit(points[:split + 1], tangent0, -tangent1, FIT_ERROR_PX)
            + fit(np.vstack((points[split:], points[0])), tangent1, -tangent0, FIT_ERROR_PX))


def contour_path(contour: np.ndarray, scale: int, offset: tuple[int, int]) -> str:
    points = contour[:, 0, :].astype(float) / scale + np.array(offset)
    if len(points) < 3:
        return ""
    # Sample by arc length before smoothing so horizontal and diagonal edges
    # receive the same treatment. Dense samples also constrain long stems and
    # crossbars between their ends, preventing cubic overshoot into letter gaps.
    closed = np.vstack((points, points[0]))
    lengths = np.concatenate(([0], np.cumsum(np.linalg.norm(np.diff(closed, axis=0), axis=1))))
    samples = np.linspace(0, lengths[-1], max(8, int(np.ceil(lengths[-1] / CONTOUR_SAMPLE_PX))), endpoint=False)
    points = np.column_stack([np.interp(samples, lengths, closed[:, axis]) for axis in range(2)])
    sigma = CONTOUR_SMOOTH_PX / (lengths[-1] / len(samples))
    radius = int(np.ceil(sigma * 3))
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    points = sum(np.roll(points, shift, axis=0) * weight
                 for shift, weight in zip(range(-radius, radius + 1), kernel))
    curves = fit_closed_contour(points)
    fmt = lambda p: f"{p[0]:.2f},{p[1]:.2f}"
    result = ["M" + fmt(curves[0][0])]
    for curve in curves:
        result.append("C" + " ".join(fmt(p) for p in curve[1:]))
    return " ".join(result) + " Z"


def trace_region(im: np.ndarray, bounds: tuple[int, int, int, int],
                 foreground: tuple[int, int, int], name: str, fill: str) -> dict:
    x0, y0, x1, y1 = bounds
    crop = im[y0:y1, x0:x1].astype(np.float32)
    # Project the observed pixel against white and the representative fill.
    # The 0.5 threshold traces the anti-aliased half-opacity boundary.
    direction = 254.0 - np.asarray(foreground, dtype=np.float32)
    alpha = np.sum((254.0 - crop) * direction, axis=2) / np.sum(direction * direction)
    alpha = np.clip(alpha, 0, 1)
    alpha = cv2.GaussianBlur(alpha, (0, 0), EDGE_BLUR_PX, borderType=cv2.BORDER_REPLICATE)
    scale = 4
    alpha = cv2.resize(alpha, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    mask = (alpha >= 0.5).astype(np.uint8) * 255
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
    paths = []
    for contour in contours:
        if cv2.contourArea(contour) / scale ** 2 < 2.0:
            continue
        path = contour_path(contour, scale, (x0 - 0.375, y0 - 0.375))
        if path:
            paths.append(path)
    if not paths:
        raise RuntimeError(f"No contours found for {name}")
    return {"name": name, "d": " ".join(paths), "fill": fill}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    im = np.asarray(Image.open(args.reference).convert("RGB"))
    regions = [
        ("wordmark-S", (100, 802, 214, 952), (3, 35, 78), "#03234E"),
        ("wordmark-c", (210, 840, 307, 952), (3, 35, 78), "#03234E"),
        ("wordmark-i", (308, 847, 348, 950), (3, 35, 78), "#03234E"),
        ("wordmark-M", (354, 805, 500, 952), (4, 131, 235), "#0483EB"),
        ("wordmark-e", (500, 843, 601, 952), (4, 131, 235), "#0483EB"),
        ("wordmark-m", (600, 843, 739, 952), (4, 131, 235), "#0483EB"),
        ("wordmark-o", (738, 843, 847, 952), (4, 131, 235), "#0483EB"),
        ("wordmark-gold-dot", (302, 803, 349, 849), (252, 178, 48), "#FCB230"),
        ("chinese-yan", (360, 963, 472, 1068), (3, 35, 78), "#03234E"),
        ("chinese-jian", (478, 961, 584, 1068), (3, 35, 78), "#03234E"),
        ("divider-left", (227, 1006, 338, 1025), (144, 169, 198), "#90A9C6"),
        ("divider-right", (607, 1006, 720, 1025), (144, 169, 198), "#90A9C6"),
    ]
    output = [trace_region(im, bounds, foreground, name, fill)
              for name, bounds, foreground, fill in regions]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(output)} compound vector paths to {args.output}")
    for item in output:
        print(f"  {item['name']}: {item['d'].count('C')} cubic segments, {item['d'].count('M')} subpaths")


if __name__ == "__main__":
    main()
