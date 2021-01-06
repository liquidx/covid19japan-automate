const { DateTime, Interval } = require("luxon");

const {
  extractAndWriteSummary,
  findAndWriteSummary,
  getAllArticles,
} = require("./nhk_spreadsheet.js");

const addPatientsCommand = (article) => {
  let command = ''
  if (article.prefecture) {
    if (article.confirmed) {
      command += `python3 add_patients.py --date ${article.date} --source ${article.source} ${article.prefecture} ${article.confirmed}; `
    } 
    if (article.deaths) {
      command += `python3 add_patients.py --date ${article.date} --source ${article.source} ${article.prefecture} ${article.deaths} --deaths; `
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

    if (outputFormat == "html") {
      let htmlOutput = "";
      for (let article of articles) {
        let command = addPatientsCommand(article)
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
