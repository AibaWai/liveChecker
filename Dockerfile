FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY ig_live_checker.py .

CMD ["python", "ig_live_checker.py"]
