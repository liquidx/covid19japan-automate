const fs = require("fs");
const axios = require("axios");
const { DateTime } = require("luxon");
const { program } = require("commander");
const fetch = require("make-fetch-happen");
const {
  extractAndWriteSummary,
  findAndWriteSummary,
  updatesForPatientDataFromNhkArticles,
  getAllArticles,
  updatePatientData,
  verifyNhkNumbers,
} = require("./nhk_spreadsheet");
const {
  getLatestCovidReport,
  getLatestPortCovidReport,
  getSummaryTableFromReport,
  getPortCaseCount,
} = require("./mhlw");
const credentials = require("./credentials.json");

const mhlw = () => {
  getLatestCovidReport(fetch).then((url) => {
    console.log(url);
    getSummaryTableFromReport(fetch, url, credentials);
  });
};

const mhlwPortCases = (options) => {
  getLatestPortCovidReport(fetch).then(async (url) => {
    const result = await getPortCaseCount(fetch, url);
    console.log(result);

    if (result.count) {
      const updates = {
        "Port Quarantine": {
          confirmed: {
            count: result.count,
            source: url,
          },
        },
      };
      if (options.write) {
        const writeResult = await updatePatientData(result.date, updates, true);
        console.log(writeResult);
      }
    }
  });
};

const getDateFromOptions = (options) => {
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
  return date;
};

const nhkBatch = async (options) => {
  if (!(options.date || options.today || options.yesterday)) {
    program.help();
    return;
  }

  const date = getDateFromOptions(options);
  const patientDataUpdates = await updatesForPatientDataFromNhkArticles(date, options.prefecture);
  console.log(patientDataUpdates);

  if (options.output) {
    fs.writeFileSync(options.output, JSON.stringify(patientDataUpdates, null, "  "));
  }
  if (options.write) {
    const writeResult = await updatePatientData(date, patientDataUpdates, true);
    console.log(writeResult);
  }
};

const nhk = (options) => {
  if (!options.date && !options.list && !(options.today || options.yesterday) && !options.url) {
    program.help();
    return;
  }

  const date = getDateFromOptions(options);

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

const main = async () => {
  program.version("0.0.1");

  program
    .command("mhlw-summary")
    .action(mhlw);

  program
    .command("mhlw-port")
    .option("-w, --write", "Write to spreadsheet")
    .action(mhlwPortCases);

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
    .action(nhk);

  program
    .command("nhk-batch")
    .description("Get all articles for a day and write rows to the spreadsheet")
    .option("-d, --date <date>", "Date in YYYY-MM-DD format")
    .option("--today", "Execute for today.")
    .option("--yesterday", "Execute for yesterday.")
    .option("--output <filename>", "Output updates to file")
    .option("-p, --prefecture <prefecture>", "Only write prefecture")
    .option("-w, --write", "Write to spreadsheet")
    .action(nhkBatch);

  program
    .command("verify-sheet")
    .description("Verify data in the sheet")
    .option("-d, --date <date>", "Date in YYYY-MM-DD format")
    .action(async (options) => {
      const result = await verifyNhkNumbers();
      console.log(result);
    });

  program.parse(process.argv);
};

main();
