#!/usr/bin/env python3
"""Test click track for SPEC_V9_MUSIC 1 and 4 (not game music; never put the output in v5/assets/music).

One click on every beat: the first beat of each bar is high (1760Hz), the others low (880Hz).
The loop is --bars bars of 4/4. --pad bars of the same clicks are added before and after it,
like the recorded tracks (SPEC_V9_MUSIC 1), so the loop starts (beat 0) at pad*4*60/bpm seconds.

  python3 tools/make_click_track.py --bpm 150 --bars 8 --out /tmp/click150.wav
  python3 tools/make_click_track.py --bpm 150 --out /tmp/click150.mp3   # mp3 / m4a need ffmpeg
Prints a ledger entry in the data/music.json form (the file name under assets/music/; the test file itself stays where --out put it).
"""
import argparse, json, math, os, struct, subprocess, sys, tempfile, wave

def render(bpm, bars, pad, rate):
    beat = 60.0 / bpm
    beats = (bars + 2 * pad) * 4
    n = int(round(beats * beat * rate))
    out = [0.0] * n
    click = int(0.02 * rate)
    for k in range(beats):
        start = int(round(k * beat * rate))
        freq = 1760.0 if k % 4 == 0 else 880.0
        for i in range(click):
            if start + i >= n: break
            env = 1.0 - i / click
            out[start + i] = 0.8 * env * math.sin(2 * math.pi * freq * i / rate)
    return out

def write_wav(path, samples, rate):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32767)) for s in samples))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, required=True)
    ap.add_argument('--bars', type=int, default=8)
    ap.add_argument('--pad', type=int, default=1)
    ap.add_argument('--rate', type=int, default=44100)
    ap.add_argument('--out', required=True, help='.wav, .mp3 or .m4a')
    a = ap.parse_args()
    if a.bpm <= 0 or a.bars < 1 or a.pad < 0: sys.exit('bpm > 0, bars >= 1, pad >= 0')
    real = os.path.realpath(os.path.dirname(os.path.abspath(a.out))).replace(os.sep, '/').lower() + '/'
    if '/v5/assets/music/' in real: sys.exit('test files do not go in v5/assets/music')
    samples = render(a.bpm, a.bars, a.pad, a.rate)
    ext = os.path.splitext(a.out)[1].lower()
    if ext == '.wav':
        write_wav(a.out, samples, a.rate)
    else:
        codec = {'.mp3': ['-c:a', 'libmp3lame', '-b:a', '192k'], '.m4a': ['-c:a', 'aac', '-b:a', '192k']}.get(ext)
        if not codec: sys.exit('use .wav, .mp3 or .m4a')
        with tempfile.TemporaryDirectory() as d:
            tmp = os.path.join(d, 'click.wav'); write_wav(tmp, samples, a.rate)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp] + codec + [a.out], check=True)
    beat = 60.0 / a.bpm
    start = a.pad * 4 * beat
    bpm = int(a.bpm) if a.bpm == int(a.bpm) else a.bpm
    print(json.dumps({'file': 'assets/music/' + os.path.basename(a.out), 'bpm': bpm, 'loopStart': round(start, 6),
                      'loopEnd': round(start + a.bars * 4 * beat, 6), 'gain': 0.8, 'once': False}))

if __name__ == '__main__':
    main()
