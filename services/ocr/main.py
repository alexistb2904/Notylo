"""CPU-bounded OCR service for Notylo.

Text runs via native Tesseract. pix2tex is optional so that a service outage or
missing model never affects normal note taking.
"""
import asyncio
import io
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

import cv2
import numpy as np
import pytesseract
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image

app = FastAPI(title="Notylo OCR", version="0.1.0")
text_limit = asyncio.Semaphore(int(os.getenv("OCR_TEXT_WORKERS", "3")))
math_limit = asyncio.Semaphore(int(os.getenv("OCR_MATH_WORKERS", "1")))
executor = ThreadPoolExecutor(max_workers=max(1, int(os.getenv("OCR_TEXT_WORKERS", "3"))))

@app.get("/health")
async def health():
    return {"status": "ok", "text_workers": int(os.getenv("OCR_TEXT_WORKERS", "3")), "math_workers": int(os.getenv("OCR_MATH_WORKERS", "1"))}

@app.post("/ocr/text")
async def recognize_text(image: UploadFile = File(...), language: Literal["fra", "eng", "fra+eng"] = Form("fra+eng"), upscale: bool = Form(True)):
    payload = await image.read()
    decoded = decode_image(payload, upscale)
    async with text_limit:
        data = await asyncio.get_running_loop().run_in_executor(executor, lambda: pytesseract.image_to_data(decoded, lang=language, output_type=pytesseract.Output.DICT))
    blocks = []
    for index, word in enumerate(data["text"]):
        if word.strip(): blocks.append({"text": word, "confidence": max(0, float(data["conf"][index])) / 100, "x": data["left"][index], "y": data["top"][index], "width": data["width"][index], "height": data["height"][index]})
    text = " ".join(block["text"] for block in blocks)
    confidence = sum(block["confidence"] for block in blocks) / len(blocks) if blocks else 0
    return {"text": text, "confidence": confidence, "blocks": blocks}

@app.post("/ocr/math")
async def recognize_math(image: UploadFile = File(...)):
    payload = await image.read()
    async with math_limit:
        try:
            latex = await asyncio.get_running_loop().run_in_executor(None, run_pix2tex, payload)
        except ModuleNotFoundError:
            raise HTTPException(status_code=503, detail="Le moteur pix2tex n’est pas installé sur ce serveur.")
        except Exception as error:
            raise HTTPException(status_code=422, detail=f"L’équation n’a pas pu être reconnue : {error}")
    return {"latex": latex, "confidence": None}

def decode_image(payload: bytes, upscale: bool) -> np.ndarray:
    image = Image.open(io.BytesIO(payload)).convert("RGB")
    array = np.array(image)
    gray = cv2.cvtColor(array, cv2.COLOR_RGB2GRAY)
    if upscale and max(gray.shape) < 1800: gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 9)

def run_pix2tex(payload: bytes) -> str:
    from pix2tex.cli import LatexOCR
    model = LatexOCR()
    return model(Image.open(io.BytesIO(payload)).convert("RGB"))
