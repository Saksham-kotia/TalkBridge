FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app/

CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "talkbridge.asgi:application"]