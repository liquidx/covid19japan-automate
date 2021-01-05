const { DateTime, Interval } = require('luxon')

const { extractAndWriteSummary, findAndWriteSummary, getAllArticles } = require('./nhk_spreadsheet.js')

exports.nhkSummary = (req, res) => {
  let date = DateTime.utc().plus({hours: 9}).toISODate()
  if (req.query.yesterday) {
    date = DateTime.utc().plus({hours: 9}).minus({days: 1}).toISODate()
  }  

  let writeToSpreadsheet = false
  if (req.query.write) {
    writeToSpreadsheet = true
  }

  findAndWriteSummary(date, writeToSpreadsheet).then(result => {
    res.send(JSON.stringify(result))
  })
}

exports.nhkArticles = (req, res) => {
  getAllArticles().then(articles => {
    res.send(JSON.stringify(articles))
  })
}