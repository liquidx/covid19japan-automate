const { DateTime } = require("luxon");

const {
  updatePatientData,
  findAndWriteSummary,
  getAllArticles,
} = require("./nhk_spreadsheet");

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

exports.updatePatientData = async (req, res) => {
  if (req.method !== "POST") {
    res.status(500).send("Expecting POST method");
  }

  let date = DateTime.utc().plus({ hours: 9 }).toISODate();
  if (req.query.yesterday) {
    date = DateTime.utc().plus({ hours: 9 }).minus({ days: 1 }).toISODate();
  } else if (req.query.date) {
    date = req.query.date;
  }

  // express automatically parses JSON bodies.
  const prefecturePatientCounts = req.body;
  if (!prefecturePatientCounts) {
    res.status(500).send("Expecting JSON body");
  }

  let write = false;
  if (req.query.write) {
    write = true;
  }

  const result = await updatePatientData(date, prefecturePatientCounts, write);
  res.status(200).send(`${result}`);
};

exports.nhkSummary = (req, res) => {
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
    res.send(JSON.stringify(result));
  });
};

exports.nhkArticles = (req, res) => {
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
