PROJECT_ID=covid19-analysis
SERVICE_ID=covid19japan-auto

cp credentials.json mhlw
cd mhlw
gcloud builds submit \
  --project ${PROJECT_ID} \
  --tag gcr.io/${PROJECT_ID}/${SERVICE_ID}
