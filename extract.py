import fitz  # PyMuPDF
import sys

def extract_text(pdf_path, out_path):
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Saved {out_path}")
    except Exception as e:
        print(f"Error {pdf_path}: {e}")

extract_text(r"C:\Users\BNT\Documents\PROJET MSI\offre_technique_MSI_COMSTRAT.pdf", "spec1.txt")
extract_text(r"C:\Users\BNT\Documents\PROJET MSI\file-10766261-abee9f4e-a63b-4f0e-bca9-001189f1fb48.pdf", "spec2.txt")
