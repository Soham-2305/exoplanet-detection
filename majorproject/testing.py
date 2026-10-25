"""
ExoMine CLI runner (retained from testing.py).
Thin CLI wrapper around exomine_service.classify_tic.

    python testing.py 305424003
    python testing.py 305424003 261136679     (several stars)
    python testing.py                          (prompts for TIC id)
"""

import os
import re
import sys

# Ensure backend and model code directories are accessible
SHOWPRO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(SHOWPRO_DIR, "exomine", "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from exomine_service import classify_tic, CLASSES, PRETTY, NASA, OUT_DIR, ExoMineError


def run_cli_classify(tic: int, fap: bool = True, max_sectors: int = 3):
    try:
        def on_stage(stage_name, progress):
            if "Downloading" in stage_name or "Locating" in stage_name:
                print(f"[{int(progress*100)}%] {stage_name}...")

        res = classify_tic(tic, fap=fap, max_sectors=max_sectors, on_stage=on_stage)
    except ExoMineError as e:
        print(f"\nTIC {tic} ERROR: {e}")
        return
    except Exception as e:
        print(f"\nTIC {tic} Unexpected error: {e}")
        return

    row = res["signal"]
    star = res["star"]
    cat = res["catalogue"]

    print(f"\nTIC {tic}: {star['source']}")
    if cat:
        split_desc = "catalogue answer available"
        print(f"  this star is in the catalogue ({cat['uid']}) - {split_desc}.")
    else:
        print("  this star is not in the catalogue - no known answer to compare with.")

    print(
        f"  sectors used: {star.get('sectors')}  |  {star.get('measurements')} measurements  |  "
        f"Teff {star.get('teff')} K, R* {star.get('radius')} Rsun, Tmag {star.get('tmag')}"
    )

    print("\n" + "-" * 66)
    print(
        f"  period {row['period_d']:.5f} d | depth {row['depth_ppm']:.0f} ppm | duration {row['duration_h']:.2f} h"
    )
    rp_e = f"{row['rp_earth']:.1f}" if row.get("rp_earth") is not None else "nan"
    print(
        f"  size: Rp/R* = {row['rp_rs']:.3f}  ->  Rp = {rp_e} Earth radii | impact b = {row['b']:.2f}"
    )
    fap_str = ""
    if row.get("fap") is not None and row.get("sigma") is not None:
        fap_str = f", false-alarm probability {row['fap']:.1e} ({row['sigma']:.1f} sigma)"
    print(f"  strength: SNR {row['snr']:.1f}, SDE {row['sde']:.1f}{fap_str}")
    print(
        f"  checks: odd/even {row['odd_even_sigma']:.1f} sigma, secondary eclipse {row['secondary_sigma']:.1f} sigma, "
        f"centroid shift {row['centroid_sigma']:.1f} sigma (offset {row['source_offset_px']:.2f} px)"
    )
    print("  class probabilities:")
    for k in CLASSES:
        bar = "#" * int(round(row[f"p_{k}"] * 30))
        print(f"     {k:15s} {100 * row[f'p_{k}']:5.1f} %  {bar}")

    print(f"  ==> AstroDetect says: {res['verdict']}")
    if cat:
        same = "  [MATCH]" if cat["is_match"] else "  [differs]"
        print(f"  ==> NASA catalogue ({cat['uid']}, P = {cat['period']:.4f} d): {cat['label_name']}{same}")

    png_path = os.path.join(OUT_DIR, f"TIC{tic}.png")
    print(f"  plot: {png_path}")
    print(f"\n  done in {res['elapsed_seconds']:.0f} s")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    args = sys.argv[1:] or [input("TIC id: ")]
    for a in args:
        tic_clean = re.sub(r"\D", "", a)
        if tic_clean:
            run_cli_classify(int(tic_clean))
