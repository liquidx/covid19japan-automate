const { DateTime, Interval } = require("luxon");

const {
  extractAndWriteSummary,
  findAndWriteSummary,
  getAllArticles,
} = require("./nhk_spreadsheet.js");

const countWithActionUrl = (article, confirmedOrDeath) => {
  let encodedUrl = encodeURIComponent(article.source)
  if (confirmedOrDeath == 'confirmed') {
    if (article.confirmed) {
      return `<a target="_blank" href="https://covid19japan-auto.liquidx.net/patients/update?source=${encodedUrl}&prefecture=${article.prefecture}&date=${article.date}&count=${article.confirmed}">${article.confirmed}</a>`
    } else {
      return ''
    }
  } else if (confirmedOrDeath == 'deaths') {
    if (article.deaths) {
      return `<a target="_blank"  href="https://covid19japan-auto.liquidx.net/patients/update?source=${encodedUrl}&prefecture=${article.prefecture}&date=${article.date}&count=${article.deaths}&deceased=true">${article.deaths}</a>`
    } else {
      return ''
    }
  }
}

const addPatientsCommand = (article) => {
  let command = ''
  if (article.prefecture) {
    if (article.confirmed) {
      command += `python3 sync_patients.py --date ${article.date} --source ${article.source} ${article.prefecture} ${article.confirmed}; `
    } 
    if (article.deaths) {
      command += `python3 sync_patients.py --date ${article.date} --source ${article.source} ${article.prefecture} ${article.deaths} --deaths; `
    }
  }
  return command
}

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
  getAllArticles().then((articles) => {
    let outputFormat = "json";
    if (req.query.output) {
      outputFormat = req.query.output;
    }

    let rpc = true
    if (req.query.command) {
      rpc = false
    }

    if (outputFormat == "html") {
      let htmlOutput = "";
      for (let article of articles) {
        let confirmed =  countWithActionUrl(article, 'confirmed')
        let deaths =  countWithActionUrl(article, 'deaths')
        htmlOutput += `<tr>
         <td>${article.date}</td>
         <td>${article.prefecture || ''}</td>
         <td>${confirmed}</td>
         <td>${deaths}</td>
         <td><a href="${article.source}">${article.title}</a></td>
         </tr>`;
      }
      res.send(
        `<html>
         <head><style>th { text-align: left; background: #ddd; } td { padding: 2px; border-bottom: 1px solid #ddd; }</style></head>
         <body style="font-family: sans-serif;">
         <table>
          <tr><th>Date</th><th>Prefecture</th><th>Confirmed</th><th>Deaths</th><th>Source</th></tr>
         ${htmlOutput}
         </table>
         </body>
         </html>`
      );
    } else {
      res.send(JSON.stringify(articles));
    }
  });
};
