PROJECT_ID=covid19-analysis
SERVICE_ID=covid19japan-auto

cd python
gcloud run deploy  \
  --project ${PROJECT_ID} \
  --region asia-northeast1 \
  --image gcr.io/${PROJECT_ID}/${SERVICE_ID} \
  --platform managed \
  --allow-unauthenticated \
  ${SERVICE_ID} 
