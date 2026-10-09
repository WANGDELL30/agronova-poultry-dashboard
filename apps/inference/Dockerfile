FROM python:3.12-slim
# Real mode needs a CUDA-capable host; build with --build-arg INSTALL_REAL=1 (see README).
ARG INSTALL_REAL=0
WORKDIR /srv
COPY requirements.txt requirements-real.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_REAL" = "1" ]; then pip install --no-cache-dir -r requirements-real.txt; fi
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
