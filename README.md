Automation tools for automatically extracting and updating the COVID19Japan site.

These use Google Cloud Functions and Google Cloud Build and Google Cloud Run to extract data
from various data sources and write them into the spreadsheet.

Scripts to pull from MHLW are in the `python/` Cloud Run instance.
Scripts to pull from NHK are in the `nodejs/` Cloud Function functions.
Scripts to write to the spreadsheet are present in both.

# Cloud Run Service

Docker image for deploying covid19japan automation scripts to a Google Cloud Run instance.
We use Cloud Run and Cloud Build because these python tools need some extra dependencies
that cannot be accessed in the Python Cloud Functions. (tesseract-ocr)

## Development
```
cd python
python3 -m venv venv
. venv/bin/activate
pip3 install -r requirements.txt
pip3 install Flask
FLASK_APP=main.py flask run
```

## Deployment
```
./build.sh
./deploy.sh
```

# Cloud Functions

These are nodejs functions that don't need any additional dependencies and can run
in Cloud Functions.

## Development
```
cd nodejs; npm run debug-summary
cd nodejs; npm run debug-articles
```

## Deployment
```
cd nodejs; npm run deploy-summary; npm run deploy-articles
```

# Auth
`credentials.json` need to be created (see mhlw.py on how to create it. It also needs to be copied into both `python/` and `nodejs/`
