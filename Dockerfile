# MePlan AI สำหรับ Hugging Face Spaces (Docker) หรือโฮสต์ใดก็ได้ที่รัน Docker
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# PyTorch รุ่น CPU (เล็กกว่ารุ่น GPU มาก) แล้วค่อยลงที่เหลือ
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY requirements-server.txt .
RUN pip install --no-cache-dir -r requirements-server.txt
# โหลดโมเดล OCR ไทย+อังกฤษไว้ตอน build จะได้ไม่ต้องรอตอนเปิดใช้
ENV HOME=/app/home EASYOCR_MODULE_PATH=/app/home/.EasyOCR
RUN mkdir -p /app/home
RUN python -c "import easyocr; easyocr.Reader(['th','en'], gpu=False, verbose=False)"
COPY . .
RUN cd demo_web && python build.py && mkdir -p /app/voice_logs && chmod -R 777 /app/voice_logs /app/home
ENV HOST=0.0.0.0 PORT=7860 KMP_DUPLICATE_LIB_OK=TRUE PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["python", "voice_server.py"]
