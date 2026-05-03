#!/usr/bin/env python3
"""
Detect the musical key of a YouTube video's audio using chromagram + Krumhansl-Schmuckler.
Usage: python3 detect_key.py <videoId> <ytdlp_bin> [extra yt-dlp args...]
Prints a JSON object: {"note": "C", "mode": "Major"}
"""
import sys, json, subprocess, tempfile, os, math, wave, struct

NOTE_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# Krumhansl-Schmuckler key profiles
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def pearson(a, b):
    n = len(a)
    ma = sum(a) / n
    mb = sum(b) / n
    num = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
    da = math.sqrt(sum((x - ma) ** 2 for x in a))
    db = math.sqrt(sum((x - mb) ** 2 for x in b))
    if da * db == 0:
        return 0.0
    return num / (da * db)


def ks_detect(chroma):
    best_r = -2.0
    best_note = "C"
    best_mode = "Major"
    for shift in range(12):
        rotated = chroma[shift:] + chroma[:shift]
        r_maj = pearson(rotated, MAJOR_PROFILE)
        if r_maj > best_r:
            best_r, best_note, best_mode = r_maj, NOTE_ROOTS[shift], "Major"
        r_min = pearson(rotated, MINOR_PROFILE)
        if r_min > best_r:
            best_r, best_note, best_mode = r_min, NOTE_ROOTS[shift], "Minor"
    return best_note, best_mode


def compute_chroma_numpy(samples, sr, frame_size=8192, hop=4096):
    import numpy as np
    chroma = [0.0] * 12
    hann = np.hanning(frame_size)
    data = np.array(samples, dtype=np.float32)
    n = len(data)
    frame_count = 0
    for start in range(0, n - frame_size, hop):
        frame = data[start:start + frame_size] * hann
        fft_mag = np.abs(np.fft.rfft(frame))
        freqs = np.fft.rfftfreq(frame_size, d=1.0 / sr)
        # Only include piano-range frequencies
        mask = (freqs >= 27.5) & (freqs <= 4186.0) & (freqs > 0)
        valid_freqs = freqs[mask]
        valid_mag = fft_mag[mask]
        midi_vals = 69.0 + 12.0 * np.log2(valid_freqs / 440.0)
        pcs = np.round(midi_vals).astype(int) % 12
        for pc, mag in zip(pcs, valid_mag):
            chroma[pc] += float(mag)
        frame_count += 1
    total = sum(chroma)
    if total > 0:
        chroma = [c / total for c in chroma]
    return chroma


def compute_chroma_pure(samples, sr, frame_size=4096, hop=2048):
    """Pure Python fallback (slow but no numpy required)."""
    chroma = [0.0] * 12
    n = len(samples)
    for start in range(0, n - frame_size, hop):
        frame = [samples[i] * (0.5 - 0.5 * math.cos(2 * math.pi * i / (frame_size - 1)))
                 for i in range(frame_size)]
        N = frame_size
        for k in range(1, N // 2):
            freq = k * sr / N
            if 27.5 <= freq <= 4186.0:
                midi = 69 + 12 * math.log2(freq / 440.0)
                pc = int(round(midi)) % 12
                re = sum(frame[j] * math.cos(2 * math.pi * k * j / N) for j in range(N))
                im = -sum(frame[j] * math.sin(2 * math.pi * k * j / N) for j in range(N))
                chroma[pc] += math.sqrt(re * re + im * im)
    total = sum(chroma)
    if total > 0:
        chroma = [c / total for c in chroma]
    return chroma


def read_wav_mono(path):
    with wave.open(path, "rb") as wf:
        n_ch = wf.getnchannels()
        sw = wf.getsampwidth()
        sr = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
    total_samples = n_frames * n_ch
    if sw == 2:
        samples = list(struct.unpack(f"<{total_samples}h", raw))
        samples = [s / 32768.0 for s in samples]
    elif sw == 4:
        samples = list(struct.unpack(f"<{total_samples}i", raw))
        samples = [s / 2147483648.0 for s in samples]
    else:
        samples = [b / 128.0 - 1.0 for b in raw]
    if n_ch > 1:
        mono = [sum(samples[i::n_ch]) / n_ch for i in range(n_frames)]
    else:
        mono = samples
    return mono, sr


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: detect_key.py <videoId> <ytdlp_bin> [extra_args...]"}))
        sys.exit(1)

    video_id = sys.argv[1]
    ytdlp_bin = sys.argv[2]
    extra_args = sys.argv[3:]

    url = f"https://www.youtube.com/watch?v={video_id}"

    with tempfile.TemporaryDirectory() as tmpdir:
        out_template = os.path.join(tmpdir, "audio.%(ext)s")
        cmd = [
            ytdlp_bin,
            "-x", "--audio-format", "wav",
            "--postprocessor-args", "ffmpeg:-t 45",
            "-o", out_template,
            *extra_args,
            url,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=100)
        except subprocess.TimeoutExpired:
            print(json.dumps({"error": "yt-dlp timed out"}))
            sys.exit(1)

        wav_files = [f for f in os.listdir(tmpdir) if f.endswith(".wav")]
        if not wav_files:
            err = result.stderr.decode(errors="replace")[-200:]
            print(json.dumps({"error": f"No audio produced: {err}"}))
            sys.exit(1)

        wav_path = os.path.join(tmpdir, wav_files[0])
        try:
            mono, sr = read_wav_mono(wav_path)
        except Exception as e:
            print(json.dumps({"error": f"WAV read failed: {e}"}))
            sys.exit(1)

        # Compute chromagram
        try:
            import numpy as _np  # noqa: F401
            chroma = compute_chroma_numpy(mono, sr)
        except ImportError:
            chroma = compute_chroma_pure(mono, sr)

        note, mode = ks_detect(chroma)
        print(json.dumps({"note": note, "mode": mode}))


if __name__ == "__main__":
    main()
