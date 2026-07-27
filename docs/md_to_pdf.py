import re
import sys
from fpdf import FPDF

SRC = r"C:\Projects\ruteo\docs\funcionalidades-ruteo.md"
OUT = r"C:\Projects\ruteo\docs\funcionalidades-ruteo.pdf"

FONT_REG = r"C:\Windows\Fonts\arial.ttf"
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"


def clean(text):
    # arrows -> ascii
    return text.replace("\u2192", "->").replace("\u2011", "-")


class PDF(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-12)
        self.set_font("arial", "", 8)
        self.set_text_color(150)
        self.cell(0, 8, f"Ruteo - Funcionalidades   |   Pagina {self.page_no()}",
                 align="C")
        self.set_text_color(0)


def render():
    pdf = PDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font("arial", "", FONT_REG)
    pdf.add_font("arial", "B", FONT_BOLD)
    pdf.add_font("mono", "", FONT_MONO)
    pdf.add_page()

    with open(SRC, encoding="utf-8") as f:
        lines = f.read().splitlines()

    in_code = False
    for raw in lines:
        line = clean(raw.rstrip())

        if line.strip().startswith("```"):
            in_code = not in_code
            if in_code:
                pdf.ln(1)
            continue

        if in_code:
            pdf.set_x(pdf.l_margin)
            pdf.set_font("mono", "", 8.5)
            pdf.set_fill_color(244, 244, 244)
            pdf.multi_cell(0, 4.6, "  " + line, fill=True)
            continue

        if line == "---":
            pdf.ln(2)
            y = pdf.get_y()
            pdf.set_draw_color(200)
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(3)
            continue

        if not line.strip():
            pdf.ln(2.5)
            continue

        # Headings
        m = re.match(r"^(#{1,3})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            text = m.group(2)
            sizes = {1: 17, 2: 13.5, 3: 11.5}
            pdf.ln(2)
            pdf.set_font("arial", "B", sizes[level])
            if level == 1:
                pdf.set_text_color(20, 60, 120)
            elif level == 2:
                pdf.set_text_color(30, 90, 150)
            else:
                pdf.set_text_color(60)
            pdf.multi_cell(0, 7, text)
            pdf.set_text_color(0)
            pdf.ln(1)
            continue

        # Bullet / numbered list
        bullet = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if bullet:
            indent = len(bullet.group(1))
            body = bullet.group(3)
            pdf.set_x(pdf.l_margin + 4 + indent)
            pdf.set_font("arial", "", 10)
            pdf.cell(4, 5, "-")
            write_inline(pdf, body, 10)
            pdf.ln(5)
            continue

        # Normal paragraph
        pdf.set_x(pdf.l_margin)
        write_inline(pdf, line, 10)
        pdf.ln(5.5)

    pdf.output(OUT)
    print("PDF generado:", OUT)


def write_inline(pdf, text, size):
    # split on **bold**  and `code`
    parts = re.split(r"(\*\*.*?\*\*|`.*?`)", text)
    for part in parts:
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            pdf.set_font("arial", "B", size)
            pdf.write(5, part[2:-2])
        elif part.startswith("`") and part.endswith("`"):
            pdf.set_font("mono", "", size - 1)
            pdf.write(5, part[1:-1])
        else:
            pdf.set_font("arial", "", size)
            pdf.write(5, part)


if __name__ == "__main__":
    render()
