# Arma canciones.json a partir del audio: dónde cae el primer tiempo (offset), y por cada semicorchea
# qué tan fuerte suena el golpe (fuerza, 0-9) y si es grave (l) o agudo (r).
# Necesita numpy y ffmpeg. Uso: python musica/analizar.py
# Cada canción es un loop exacto: el BPM sale de beats y del largo del archivo.
import json, subprocess, sys
from pathlib import Path
import numpy as np

SR, N, HOP = 44100, 1024, 128
DIR = Path(__file__).parent

def cargar(p):
    # ffmpeg descarta el relleno del encoder igual que Chrome y Firefox al decodificar
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)

def flujos(x):
    # flujo espectral (cuánto sube la energía de un cuadro al otro): total, graves y agudos
    n = (len(x) - N) // HOP
    fr = np.lib.stride_tricks.as_strided(x, (n, N), (x.strides[0] * HOP, x.strides[0]))
    S = np.log1p(100 * np.abs(np.fft.rfft(fr * np.hanning(N), axis=1)))
    d = np.maximum(0, np.diff(S, axis=0, prepend=S[:1]))
    hz = np.fft.rfftfreq(N, 1 / SR)
    def limpio(f):
        f = f - np.convolve(f, np.ones(64) / 64, 'same')
        return np.maximum(f, 0)
    return limpio(d.sum(1)), limpio(d[:, hz < 250].sum(1)), limpio(d[:, hz > 2000].sum(1))

def cuadro(t):
    # el cuadro centrado en el instante t
    return np.clip(np.round((np.asarray(t) * SR - N / 2) / HOP).astype(int), 0, None)

def pico(f, t, ancho=0.02):
    w = int(ancho * SR / HOP)
    i = cuadro(t)
    return np.array([f[max(0, j - w):j + w + 1].max() if j < len(f) else 0 for j in i])

def analizar(c):
    x = cargar(DIR / (c['id'] + '.mp3'))
    dur = len(x) / SR
    bpm = round(c['beats'] * 60 / dur, 3)
    sd = 60 / bpm / 4
    f, graves, agudos = flujos(x)
    pasos = np.arange(c['beats'] * 4) * sd
    # el desfase de la grilla de semicorcheas que más golpes agarra
    prueba = np.arange(-sd / 2, sd / 2, 0.0005)
    score = [f[np.minimum(cuadro(o + pasos), len(f) - 1)].mean() for o in prueba]
    offset = float(prueba[int(np.argmax(score))])
    t = offset + pasos
    fuerza = pico(f, t)
    # 0-9 por deciles: cada valor sale en la misma cantidad de semicorcheas
    rango = np.argsort(np.argsort(fuerza, kind='stable'), kind='stable')
    digitos = np.minimum(9, rango * 10 // len(rango))
    g, a = pico(graves, t) / (graves.mean() + 1e-9), pico(agudos, t) / (agudos.mean() + 1e-9)
    tono = g / (g + a + 1e-9)
    lado = np.where(tono >= np.median(tono[digitos >= 5]), 'l', 'r')
    # control: cuánto se corre cada golpe fuerte del pico real más cercano
    tt = (np.arange(len(f)) * HOP + N / 2) / SR
    err = []
    for tk in t[digitos >= 6]:
        m = (tt > tk - 0.06) & (tt < tk + 0.06)
        err.append((tt[np.argmax(f * m)] - tk) * 1000)
    print(f"{c['id']}: {bpm} BPM, offset {offset * 1000:.1f} ms, error mediano {np.median(err):.1f} ms, "
          f"{np.mean(np.abs(err) <= 10) * 100:.0f}% de golpes a menos de 10 ms", file=sys.stderr)
    return {**c, 'bpm': bpm, 'offset': round(offset, 4), 'dur': round(dur, 3),
            'fuerza': ''.join(map(str, digitos)), 'lado': ''.join(lado)}

if __name__ == '__main__':
    archivo = DIR / 'canciones.json'
    canciones = [analizar(c) for c in json.loads(archivo.read_text(encoding='utf-8'))]
    archivo.write_text(json.dumps(canciones, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
