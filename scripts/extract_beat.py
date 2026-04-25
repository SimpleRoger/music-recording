#!/usr/bin/env python3
"""
Beat (instrumental) extractor using Demucs.
Usage:  python3 scripts/extract_beat.py <audio_file> <output_dir>
Prints the path of the resulting no_vocals.wav to stdout on success.
"""
import sys
import os
import subprocess

def main():
    if len(sys.argv) < 3:
        print("Usage: extract_beat.py <audio_file> <output_dir>", file=sys.stderr)
        sys.exit(1)

    input_file = sys.argv[1]
    output_dir = sys.argv[2]

    if not os.path.exists(input_file):
        print(f"Input file not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    # Run demucs in two-stems mode (vocals vs. everything else).
    # "no_vocals" = drums + bass + other = instrumental.
    # --jobs 0  → use all available CPU cores
    result = subprocess.run(
        [
            sys.executable, "-m", "demucs",
            "--two-stems", "vocals",
            "--jobs", "0",
            "-o", output_dir,
            input_file,
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode)

    # Demucs output structure: {output_dir}/htdemucs/{basename_no_ext}/no_vocals.wav
    base = os.path.splitext(os.path.basename(input_file))[0]
    candidate = os.path.join(output_dir, "htdemucs", base, "no_vocals.wav")
    if os.path.exists(candidate):
        print(candidate)
        sys.exit(0)

    print(f"Expected output not found: {candidate}", file=sys.stderr)
    sys.exit(1)

if __name__ == "__main__":
    main()
