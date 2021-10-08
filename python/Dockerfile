# Use the official lightweight Python image.
# https://hub.docker.com/_/python
FROM python:3.9

# Install extra dependencies
RUN apt-get update -y
RUN apt-get install -y python3-pip python-dev build-essential
RUN apt update && apt install -y libsm6 libxext6 libgl1
# Install custom tesseract-ocr 4.1.1 (instead of 4.0 in buster)
RUN apt-get install -y software-properties-common apt-transport-https
RUN add-apt-repository -y 'deb [trusted=yes] https://notesalexp.org/tesseract-ocr/buster/ buster main'
RUN apt-get update -y --allow-unauthenticated  -oAcquire::AllowInsecureRepositories=true
RUN apt-get install -y --allow-unauthenticated  notesalexp-keyring -oAcquire::AllowInsecureRepositories=true
RUN apt-get update -y --allow-unauthenticated 
RUN apt-get install -y --allow-unauthenticated  tesseract-ocr 

# Allow statements and log messages to immediately appear in the Knative logs
ENV PYTHONUNBUFFERED True

# Copy local code to the container image.
ENV APP_HOME /app
WORKDIR $APP_HOME
COPY . ./

RUN pip install pillow
RUN pip install pytesseract
RUN pip install opencv-contrib-python
RUN pip install -r requirements.txt

# Install production dependencies.
RUN pip install Flask gunicorn

# Run the web service on container startup. Here we use the gunicorn
# webserver, with one worker process and 8 threads.
# For environments with multiple CPU cores, increase the number of workers
# to be equal to the cores available.
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
