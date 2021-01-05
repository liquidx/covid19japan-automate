const { DateTime, Interval } = require('luxon')
const { program } = require('commander')
const { extractAndWriteSummary, findAndWriteSummary, getAllArticles } = require('./nhk_spreadsheet.js')

const main = async () => {
  program.version('0.0.1')
  program
    .option('-d, --date <date>', 'Date in YYYY-MM-DD format')
    .option('--url <url>', 'URL of NHK Report (e.g. https://www3.nhk.or.jp/news/html/20201219/k10012773101000.html)')
    .option('-w, --write', 'Write to spreadsheet')
    .option('-l, --list', 'List all articles')
    .option('--today', 'Execute for today.')
    .option('--yesterday', 'Execute for yesterday.')
  program.parse(process.argv)

  if (!program.date  && !program.list && !(program.today || program.yesterday)) {
    program.help()
    return
  }

  if (program.today) {
    program.date = DateTime.utc().plus({hours: 9}).toISODate()
  }

  if (program.yesterday) {
    program.date = DateTime.utc().plus({hours: 9}).minus({days: 1}).toISODate()
  }

  if (program.list) {
    getAllArticles().then(articles => {
      for (let article of articles) {
        console.log(article)
      }
    })
  } else  if (!program.url) {
    findAndWriteSummary(program.date, program.write)
  } else {
    extractAndWriteSummary(program.date, program.url, program.write)
  }
}

main()

