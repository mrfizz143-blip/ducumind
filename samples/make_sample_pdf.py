"""Generate a small real PDF for testing (no external deps)."""

import sys
from pathlib import Path

LINES = [
    "European Capitals — Geography Notes",
    "",
    "The capital of France is Paris, situated on the River Seine.",
    "Paris is the largest city in France.",
    "The capital of Germany is Berlin.",
    "The capital of Italy is Rome.",
    "The capital of Spain is Madrid.",
    "The capital of the United Kingdom is London.",
    "Each of these capitals is the seat of national government.",
    "Paris serves as the capital of France and the political heart of Europe.",
]


def escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf(lines: list[str]) -> bytes:
    content = "BT /F1 13 Tf 56 730 Td 16 TL\n"
    for line in lines:
        if line:
            content += f"({escape(line)}) Tj T*\n"
        else:
            content += "T*\n"
    content += "ET"

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream".encode(),
    ]

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode()
        out += body
        out += b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    )
    return bytes(out)


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "sample.pdf")
    target.write_bytes(build_pdf(LINES))
    print(f"wrote {target} ({target.stat().st_size} bytes)")