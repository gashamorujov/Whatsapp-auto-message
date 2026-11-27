#!/usr/bin/env python3
"""
Banner generator — Telegram üçün bot bannerı (1200x630).
Yenidən yaratmaq üçün:  python3 scripts/make_banner.py
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle
import numpy as np

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "banner.png")

NAVY_TOP = np.array([9, 33, 58], dtype=float) / 255
NAVY_BOT = np.array([16, 62, 102], dtype=float) / 255
ACCENT = "#E8B23A"
WHITE = "#FFFFFF"
MUTED = "#A9C4DC"

fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.axis("off")

# Qradiyent fon
grad = np.linspace(0, 1, H)[:, None]
bg = NAVY_TOP[None, None, :] * (1 - grad[:, :, None]) + NAVY_BOT[None, None, :] * grad[:, :, None]
bg = np.repeat(bg, W, axis=1)
ax.imshow(bg, extent=[0, W, 0, H], zorder=0, aspect="auto")

# Diagonal işıq zolağı
stripe = Rectangle((-260, -120), 420, 900, angle=18, color="#FFFFFF", alpha=0.035, zorder=1)
ax.add_patch(stripe)
stripe2 = Rectangle((620, -180), 260, 980, angle=18, color="#FFFFFF", alpha=0.028, zorder=1)
ax.add_patch(stripe2)

# Sol çubuq
ax.add_patch(Rectangle((72, 118), 7, 300, color=ACCENT, zorder=3))

# Başlıq
ax.text(104, 402, "İST SERVICES", color=WHITE, fontsize=46, fontweight="bold",
        family="DejaVu Sans", va="center", zorder=4)
ax.text(104, 352, "DƏNİZÇİLİK TƏLİM MƏRKƏZİ", color=ACCENT, fontsize=25, fontweight="bold",
        family="DejaVu Sans", va="center", zorder=4)

ax.text(104, 300, "WhatsApp avtomatik sorğu botu", color=MUTED, fontsize=19,
        family="DejaVu Sans", va="center", zorder=4)

# Xüsusiyyət kartları
chips = [
    ("Sertifikat yoxlaması", "Təhvil vəziyyəti"),
    ("Kurs qeydiyyatı", "Başlama tarixi"),
    ("Avtomatik cavab", "24/7 sorğu xidməti"),
]
x0, y0, cw, ch, gap = 104, 96, 310, 108, 22
for i, (title, sub) in enumerate(chips):
    x = x0 + i * (cw + gap)
    box = FancyBboxPatch((x, y0), cw, ch, boxstyle="round,pad=0,rounding_size=14",
                         linewidth=1.2, edgecolor="#3E6E9E", facecolor="#0E2A47",
                         alpha=0.92, zorder=3)
    ax.add_patch(box)
    ax.add_patch(Rectangle((x, y0 + ch - 4), cw, 4, color=ACCENT, alpha=0.85, zorder=4))
    ax.text(x + 22, y0 + 62, title, color=WHITE, fontsize=17, fontweight="bold",
            family="DejaVu Sans", va="center", zorder=5)
    ax.text(x + 22, y0 + 32, sub, color=MUTED, fontsize=13.5,
            family="DejaVu Sans", va="center", zorder=5)

# Alt yazı
ax.text(104, 44, "sertifikat · kurs · qeydiyyat", color="#7FA6C8", fontsize=13,
        family="DejaVu Sans", va="center", zorder=4)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
fig.savefig(OUT, dpi=100, facecolor=fig.get_facecolor())
print("Banner yaradıldı:", OUT)
