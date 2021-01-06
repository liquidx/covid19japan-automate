const { DateTime, Interval } = require("luxon");

const {
  extractAndWriteSummary,
  findAndWriteSummary,
  getAllArticles,
} = require("./nhk_spreadsheet.js");

const addPatientsCommand = (article, rpc) => {
  let command = ''
  if (article.prefecture) {
    if (article.confirmed) {
      if (rpc) {
        let encodedUrl = encodeURIComponent(article.source)
        command += `<a href="https://covid19japan-auto.liquidx.net/patients/update?prefecture=${article.prefecture}&date=${article.date}&count=${article.confirmed}&source=${encodedUrl}">Update New Cases</a>`
      } else {
        command += `python3 sync_patients.py --date ${article.date} --source ${article.source} ${article.prefecture} ${article.confirmed}; `
      }
    } 
    if (article.deaths) {
      if (rpc) {
        let encodedUrl = encodeURIComponent(article.source)
        command += `<br><a href="https://covid19japan-auto.liquidx.net/patients/update?prefecture=${article.prefecture}&date=${article.date}&count=${article.deaths}&source=${encodedUrl}&deceased=true">Update Deceased</a>`
      } else {
        command += `python3 sync_patients.py --date ${article.date} --source ${article.source} ${article.prefecture} ${article.deaths} --deaths; `
      }
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
        let command = addPatientsCommand(article, rpc)
        htmlOutput += `<tr>
         <td${article.date}</td>
         <td>${article.prefecture || ''}</td>
         <td>${article.confirmed || 0}</td>
         <td>${article.deaths || 0}</td>
         <td><a href="${article.source}">${article.title}</a></td>
         <td>${command}</td>
         </tr>`;
      }
      res.send(
        `<html><body style="font-family: sans-serif;"><table>
        <tr><th>Date</th><th>Prefecture</th><th>Confirmed</th><th>Deaths</th></tr>
        ${htmlOutput}</table></body</html>`
      );
    } else {
      res.send(JSON.stringify(articles));
    }
  });
};
