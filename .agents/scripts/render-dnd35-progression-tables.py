from __future__ import annotations

import re
import sys
from pathlib import Path

import fitz


TARGETS = {
    "bard": "tabella34bardo",
    "cleric": "tabella36chierico",
    "druid": "tabella38druido",
    "wizard": "tabella311mago",
    "paladin": "tabella314paladino",
    "ranger": "tabella315ranger",
    "sorcerer": "tabella317stregone",
}


def normalized(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: render-dnd35-progression-tables.py <pdf>")

    pdf_path = Path(sys.argv[1])
    output_dir = Path(".agents/outputs/dnd35-progression-pages")
    output_dir.mkdir(parents=True, exist_ok=True)

    document = fitz.open(pdf_path)
    rendered: set[str] = set()
    for page in document:
        text = normalized(page.get_text())
        for class_name, marker in TARGETS.items():
            if (
                class_name in rendered
                or marker not in text
                or "incantesimialgiorno" not in text
            ):
                continue
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
            output_path = output_dir / f"{class_name}.png"
            pixmap.save(output_path)
            rendered.add(class_name)
            print(f"{class_name}: PDF page {page.number + 1} -> {output_path}")

    missing = sorted(set(TARGETS) - rendered)
    if missing:
        raise SystemExit(f"Table title not found for: {', '.join(missing)}")


if __name__ == "__main__":
    main()
