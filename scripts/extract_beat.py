#!/usr/bin/env python3
"""
Beat (instrumental) extractor using Demucs.
Usage:  python3 scripts/extract_beat.py <audio_file> <output_dir>
Prints the path of the resulting no_vocals.mp3 to stdout on success.
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

    # Use --mp3 to avoid the torchcodec WAV save path (not installed).
    # Pipe stdout to DEVNULL (we don't need demucs's stdout).
    # Leave stderr=None so Demucs progress bars stream to Python's stderr,
    # which Node reads via child.stderr events for live progress forwarding.
    result = subprocess.run(
        [
            sys.executable, "-m", "demucs",
            "--two-stems", "vocals",
            "--mp3",
            "--mp3-bitrate", "320",
            "--jobs", "0",
            "-o", output_dir,
            input_file,
        ],
        stdout=subprocess.DEVNULL,  # discard demucs stdout (don't mix with our print)
        stderr=None,               # let stderr flow through so Node sees progress
    )

    if result.returncode != 0:
        sys.exit(result.returncode)

    # Demucs output: {output_dir}/htdemucs/{basename_no_ext}/no_vocals.mp3
    base = os.path.splitext(os.path.basename(input_file))[0]
    candidate = os.path.join(output_dir, "htdemucs", base, "no_vocals.mp3")
    if os.path.exists(candidate):
        print(candidate, flush=True)
        sys.exit(0)

    print(f"Expected output not found: {candidate}", file=sys.stderr)
    sys.exit(1)

if __name__ == "__main__":
    main()
