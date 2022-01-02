const { DateTime } = require("luxon");
const functions = require("firebase-functions");

const {
  updatePatientData,
  findAndWriteSummary,
  updatesForPatientDataFromNhkArticles,
  getAllArticles,
} = require("./nhk_spreadsheet");
const { notify } = require("./notify");
const { textForWriteResult } = require("./text");
const proxy = require("./proxy.js");

const lightTask = {
  timeoutSeconds: 540,
  memory: "256MB",
};

const standardTask = {
  timeoutSeconds: 540,
  memory: "1GB",
};

const heavyTask = {
  timeoutSeconds: 540,
  memory: "4GB",
};

exports.proxy = functions.region("us-central1").runWith(standardTask).https.onRequest((req, res) => {
  proxy.fetch(req, res);
});

const actionUrl = (prefecture, date, source, confirmed, deaths) => {
  if (confirmed) {
    return `https://covid19japan-auto.liquidx.net/patients/update?source=${source}&prefecture=${prefecture}&date=${date}&cases=${confirmed}`;
  }
  if (deaths) {
    return `https://covid19japan-auto.liquidx.net/patients/update?source=${source}&prefecture=${prefecture}&date=${date}&deceased=${deaths}`;
  }
  return `https://covid19japan-auto.liquidx.net/patients/update?source=${source}&prefecture=${prefecture}&date=${date}`;
};

const countWithActionUrl = (article, confirmedOrDeath) => {
  const encodedUrl = encodeURIComponent(article.source);
  if (confirmedOrDeath === "confirmed") {
    if (article.confirmed) {
      const url = actionUrl(article.prefecture, article.date, encodedUrl, article.confirmed);
      return `<a target="_blank" href="${url}">${article.confirmed}</a>`;
    }
    if (article.prefecture) {
      const url = actionUrl(article.prefecture, article.date, encodedUrl);
      return `<a target="_blank"  href="${url}">?</a>`;
    }
    return "";
  } if (confirmedOrDeath === "deaths") {
    if (article.deaths) {
      const url = actionUrl(article.prefecture, article.date, encodedUrl, 0, article.deaths);
      return `<a target="_blank"  href="${url}">${article.deaths}</a>`;
    }
    if (article.prefecture) {
      const url = actionUrl(article.prefecture, article.date, encodedUrl);
      return `<a target="_blank"  href="${url}">?</a>`;
    }
    return "";
  }
  return "";
};

const doNhkArticlesUpdate = async (req, res) => {
  let date = DateTime.utc().plus({ hours: 9 }).toISODate();
  if (req.query.yesterday) {
    date = DateTime.utc().plus({ hours: 9 }).minus({ days: 1 }).toISODate();
  } else if (req.query.date) {
    date = req.query.date;
  }

  const shouldWrite = !!req.query.write;

  const patientDataUpdates = await updatesForPatientDataFromNhkArticles(date);
  if (shouldWrite) {
    const writeResult = await updatePatientData(date, patientDataUpdates, shouldWrite);
    res.status(200).send(`OK ${JSON.stringify(writeResult)}`);

    await notify(`Patient Data Updated: ${textForWriteResult(writeResult)}`);
    return writeResult;
  }
  return res.status(200).send(JSON.stringify(patientDataUpdates, null, "  "));
};

exports.nhkArticlesUpdate = functions.region("us-central1").runWith(standardTask).https.onRequest(doNhkArticlesUpdate);

const doNhkSummary = (req, res) => {
  let date = DateTime.utc().plus({ hours: 9 }).toISODate();
  if (req.query.yesterday) {
    date = DateTime.utc().plus({ hours: 9 }).minus({ days: 1 }).toISODate();
  } else if (req.query.date) {
    date = req.query.date;
  }

  let writeToSpreadsheet = false;
  if (req.query.write) {
    writeToSpreadsheet = true;
  }

  findAndWriteSummary(date, writeToSpreadsheet).then((result) => {
    notify(`NHK Summary written for ${JSON.stringify(result, null, 2)}`);
    res.send(JSON.stringify(result, null, 2));
  });
};
exports.nhkSummary = functions.region("us-central1").runWith(standardTask).https.onRequest(doNhkSummary);

const doNhkArticles = (req, res) => {
  getAllArticles(20).then((articles) => {
    let outputFormat = "json";
    if (req.query.output) {
      outputFormat = req.query.output;
    }

    if (outputFormat === "html") {
      let htmlOutput = "";
      for (const article of articles) {
        const confirmed = countWithActionUrl(article, "confirmed");
        const deaths = countWithActionUrl(article, "deaths");
        htmlOutput += `<tr>
         <td>${article.date}</td>
         <td>${article.prefecture || ""}</td>
         <td>${confirmed}</td>
         <td>${deaths}</td>
         <td><a href="${article.source}">${article.title}</a></td>
         </tr>`;
      }
      res.send(
        `<html>
         <head>
          <style>
          th { text-align: left; background: #ddd; } 
          td { padding: 2px; border-bottom: 1px solid #ddd; }
          </style>
         </head>
         <body style="font-family: sans-serif;">
         <table>
          <tr><th>Date</th><th>Prefecture</th><th>Confirmed</th><th>Deaths</th><th>Source</th></tr>
         ${htmlOutput}
         </table>
         </body>
         </html>`,
      );
    } else {
      res.send(JSON.stringify(articles));
    }
  });
};
exports.nhkArticles = functions.region("us-central1").runWith(standardTask).https.onRequest(doNhkArticles);
