FROM python:3.13-slim
WORKDIR /app
COPY . /app
ENV PORT=8080 HOST=0.0.0.0 PYTHONDONTWRITEBYTECODE=1
RUN useradd --create-home portfolio && chown -R portfolio:portfolio /app
USER portfolio
EXPOSE 8080
CMD ["python", "tools/server.py"]
