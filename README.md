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

## Development Setup
```
cd python
python3 -m venv venv
. venv/bin/activate
pip3 install -r requirements.txt
pip3 install Flask
```

## Development

```
cd python
. venv/bin/activate

# Test Web Server
FLASK_ENV=development FLASK_APP=main.py flask run
# request: http://localhost:5000/mhlw/today

# Test Command Line
python3  mhlw.py --extractSummary --verbose

# Write to spreadsheet
python3  mhlw.py --extractSummary --verbose --writeSummary

# End venv
deactivate
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
