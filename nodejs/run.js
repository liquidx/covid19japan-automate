const { DateTime, Interval } = require("luxon");
const { program } = require("commander");
const {
  extractAndWriteSummary,
  findAndWriteSummary,
  getAllArticles,
} = require("./nhk_spreadsheet.js");
const { sortedPrefectureCounts } = require("./nhk.js");

const main = async () => {
  program.version("0.0.1");
  program
    .option("-d, --date <date>", "Date in YYYY-MM-DD format")
    .option(
      "--url <url>",
      "URL of NHK Report (e.g. https://www3.nhk.or.jp/news/html/20201219/k10012773101000.html)"
    )
    .option("-w, --write", "Write to spreadsheet")
    .option("-l, --list", "List all articles")
    .option('-p, --prefecture <prefecture>', 'Restrict to a single prefecture')
    .option('--raw-values', 'Print out raw values', false)
    .option("--today", "Execute for today.")
    .option("--yesterday", "Execute for yesterday.");
  program.parse(process.argv);

  if (!program.date && !program.list && !(program.today || program.yesterday)) {
    program.help();
    return;
  }

  if (program.today) {
    program.date = DateTime.utc().plus({ hours: 9 }).toISODate();
  }

  if (program.yesterday) {
    program.date = DateTime.utc()
      .plus({ hours: 9 })
      .minus({ days: 1 })
      .toISODate();
  }

  const outputResults = (result) => {
    if (program.rawValues) {
      const counts = result.counts
      for (const value of Object.values(result.counts.prefectureCounts)) {
        console.log(value)
      }
      for (const value of [
        counts.portQuarantineCount,
        counts.critical,
        counts.deceased,
        counts.recoveredJapan,
        counts.recoveredTotal,
      ]) {
        console.log(value)
      };
    } else {
      console.log(result)
    }
  }

  if (program.list) {
    getAllArticles(20).then((articles) => {
      for (let article of articles) {
        let shouldShow = true

        if (program.date) {
          if (article.date != program.date) {
            shouldShow = false
          }
        }
        if (program.prefecture) {
          if (!article.prefecture || article.prefecture.toLowerCase() != program.prefecture.toLowerCase())
            shouldShow = false
        }

        if (shouldShow) {
          console.log(article);
        }
      }
    });
  } else if (program.url) {
    extractAndWriteSummary(program.date, program.url, program.write).then(outputResults)
  } else {
    // 25 is the max.
    findAndWriteSummary(program.date, program.write, 25).then(outputResults)
  }
};

main();
