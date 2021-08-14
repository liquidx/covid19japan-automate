const fs = require("fs");
const { DateTime } = require("luxon");
const { program } = require("commander");
const fetch = require("make-fetch-happen");
const {
  extractAndWriteSummary,
  findAndWriteSummary,
  getAllArticles,
  updatePatientData,
} = require("./nhk_spreadsheet");
const {
  getLatestCovidReport,
  getSummaryTableFromReport,
} = require("./mhlw");
const credentials = require("./credentials.json");

const mhlw = () => {
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

  let { date } = options;
  if (options.today) {
    date = DateTime.utc().plus({ hours: 9 }).toISODate();
  }

  if (options.yesterday) {
    date = DateTime.utc()
      .plus({ hours: 9 })
      .minus({ days: 1 })
      .toISODate();
  }

  const outputResults = (result) => {
    if (options.rawValues) {
      const { counts } = result;
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
      console.log(options.date);
      const filteredArticles = articles
        .filter((article) => (!date || article.date === date))
        .filter((article) => (
          !options.prefecture
          || !article.prefecture
          || article.prefecture.toLowerCase() === options.prefecture.toLowerCase()));

      filteredArticles.forEach((article) => {
        console.log(`${article.date} ${article.prefecture} ${article.title} ${article.confirmed} ${article.deaths}`);
      });

      if (options.output) {
        const prefectureUpdates = {};
        filteredArticles.forEach((article) => {
          if (!article.prefecture) {
            return;
          }
          prefectureUpdates[article.prefecture] = {};
          if (article.confirmed) {
            prefectureUpdates[article.prefecture].confirmed = {
              count: article.confirmed,
              source: article.source,
            };
          }
          if (article.deaths) {
            prefectureUpdates[article.prefecture].deceased = {
              count: article.deaths,
              source: article.source,
            };
          }
        });

        fs.writeFileSync(options.output, JSON.stringify(prefectureUpdates, null, "  "));
      }
      console.log(filteredArticles.length);
    });
  } else if (options.url) {
    extractAndWriteSummary(date, options.url, options.write).then(
      outputResults,
    );
  } else {
    // 25 is the max.
    findAndWriteSummary(date, options.write, 25).then(outputResults);
  }
};

const updateCounts = async (options) => {
  let input = {
    Tokyo: {
      deceased: {
        count: 6,
      },
    },
  };
  if (options.input) {
    input = JSON.parse(fs.readFileSync(options.input));
  }
  return updatePatientData(options.date, input, options.write);
};

const main = async () => {
  program.version("0.0.1");

  program
    .command("mhlw")
    .action(mhlw);
  program
    .command("nhk")
    .option("-d, --date <date>", "Date in YYYY-MM-DD format")
    .option(
      "--url <url>",
      "URL of NHK Report (e.g. https://www3.nhk.or.jp/news/html/20201219/k10012773101000.html)",
    )
    .option("-w, --write", "Write to spreadsheet")
    .option("-l, --list", "List all articles")
    .option("-p, --prefecture <prefecture>", "Restrict to a single prefecture")
    .option("--raw-values", "Print out raw values", false)
    .option("--today", "Execute for today.")
    .option("--yesterday", "Execute for yesterday.")
    .option("--output <filename>", "Output to file")
    .action(nhk);

  program
    .command("counts")
    .option("-i, --input <file>", "Input JSON file with per-prefecture updates")
    .option("-d, --date <date>", "Date in YYYY-MM-DD format")
    .option("-w, --write", "Write to spreadsheet")
    .action(updateCounts);

  program.parse(process.argv);
};

main();
