const cheerio = require("cheerio");
const _ = require("lodash");
const { URL } = require('url');
const ImageDataURI = require('image-data-uri')
const vision = require("@google-cloud/vision");

const DEFAULT_MHLW_INDEX_URL = 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/topics_shingata_09444.html'

const getLatestCovidReport = async (fetch, indexUrl) => {
  const covidReportName = "新型コロナウイルス感染症の現在の状況";
  if (!indexUrl) {
    indexUrl = DEFAULT_MHLW_INDEX_URL
  }

  return fetch(indexUrl)
    .then((response) => response.text())
    .then((html) => {
      const $ = cheerio.load(html)
      const reports = $('a').filter((i, e) => {
        return $(e).text().match(covidReportName)
      })

      const latestReport = reports.first()
      const href = latestReport.attr('href')
      if (href.startsWith('https://')) {
        return href
      } else {
        const outputUrl = new URL(indexUrl);
        outputUrl.pathname = href
        return outputUrl.href
      }
    });
};

const textDetectionForImage = (credentials, imageBase64) => {
  const client = new vision.ImageAnnotatorClient({ credentials });
  const request = {
    image: {
      content: imageBase64,
    },
    features: [
      { type: "DOCUMENT_TEXT_DETECTION" },
      //      {type: 'TEXT_DETECTION'}
    ],
    image_context: {
      language_hints: ["ja"],
      text_detection_params: {},
    },
  };
  return client
    .batchAnnotateImages({ requests: [request] })
    .then((responses) => {
      if (!responses || !responses.length) {
        return;
      }
      return responses[0];
    });
}

const getSummaryTableFromReport = async (fetch, reportUrl, credentials) => {
  fetch(reportUrl).then(response => response.text()).then(async html => {
    const $ = cheerio.load(html);
    const date = $('time').first().attr('datetime')
    const tableImage = $('img').filter((i, e) => {
      const src = $(e).attr('src')
      if (src && src.startsWith('data')) {
        return true
      }
      return false;
    }).first()

    // tableImage is a data-url
    const img = ImageDataURI.decode(tableImage.attr('src'))
    const response = await textDetectionForImage(credentials, img.dataBase64)
    const annotation = response.responses[0].fullTextAnnotation.pages[0]
    
    return { annotation, date }
  })
}

exports.getLatestCovidReport = getLatestCovidReport
exports.getSummaryTableFromReport = getSummaryTableFromReport