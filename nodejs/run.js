const { DateTime, Interval } = require("luxon");
const { program } = require("commander");
const fetch = require("make-fetch-happen");
const {
  extractAndWriteSummary,
  findAndWriteSummary,
  getAllArticles,
} = require("./nhk_spreadsheet.js");
const { sortedPrefectureCounts } = require("./nhk.js");
const {
  getLatestCovidReport,
  getSummaryTableFromReport,
} = require("./mhlw.js");
const credentials = require("./credentials.json");

const mhlw = (options) => {
  getLatestCovidReport(fetch).then((url) => {
    console.log(url);
    getSummaryTableFromReport(fetch, url, credentials);
  });
};

const nhk = (options) => {
  if (!options.date && !options.list && !(options.today || options.yesterday) && !options.url) {
    program.help();
    return;
  }

  if (options.today) {
    options.date = DateTime.utc().plus({ hours: 9 }).toISODate();
  }

  if (options.yesterday) {
    options.date = DateTime.utc()
      .plus({ hours: 9 })
      .minus({ days: 1 })
      .toISODate();
  }

  const outputResults = (result) => {
    if (options.rawValues) {
      const counts = result.counts;
      for (const value of Object.values(result.counts.prefectureCounts)) {
        console.log(value);
      }
      for (const value of [
        counts.portQuarantineCount,
        counts.critical,
        counts.deceased,
        counts.recoveredJapan,
        counts.recoveredTotal,
      ]) {
        console.log(value);
      }
    } else {
      console.log(result);
    }
  };

  if (options.list) {
    getAllArticles(20).then((articles) => {
      for (let article of articles) {
        let shouldShow = true;

        if (options.date) {
          if (article.date != options.date) {
            shouldShow = false;
          }
        }
        if (options.prefecture) {
          if (
            !article.prefecture ||
            article.prefecture.toLowerCase() != options.prefecture.toLowerCase()
          )
            shouldShow = false;
        }

        if (shouldShow) {
          console.log(article);
        }
      }
    });
  } else if (options.url) {
    extractAndWriteSummary(options.date, options.url, options.write).then(
      outputResults
    );
  } else {
    // 25 is the max.
    findAndWriteSummary(options.date, options.write, 25).then(outputResults);
  }
};

const main = async () => {
  program.version("0.0.1");
  program;

  program
    .command("mhlw")
    .option("--latest-report")
    .option("--summary-table")
    .action(mhlw);
  program
    .command("nhk")
    .option("-d, --date <date>", "Date in YYYY-MM-DD format")
    .option(
      "--url <url>",
      "URL of NHK Report (e.g. https://www3.nhk.or.jp/news/html/20201219/k10012773101000.html)"
    )
    .option("-w, --write", "Write to spreadsheet")
    .option("-l, --list", "List all articles")
    .option("-p, --prefecture <prefecture>", "Restrict to a single prefecture")
    .option("--raw-values", "Print out raw values", false)
    .option("--today", "Execute for today.")
    .option("--yesterday", "Execute for yesterday.")
    .action(nhk);

  program.parse(process.argv);
};

main();
