/* eslint-disable no-param-reassign */
/* eslint-disable eqeqeq */
/* eslint-disable no-await-in-loop */

// Script to extract aggregate values from NHK and write them into
// the Google Spreadsheet using the account that exists in
// credentials.json in the root directory of this checkout.
//
// These credentials are a service account that is generated using
// these instructions:
//
// https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication?id=service-account

const path = require("path");
const process = require("process");

const fetch = require("make-fetch-happen");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { DateTime, Interval } = require("luxon");
const {
  extractDailySummary,
  sortedPrefectureCounts,
  latestNhkArticles,
  prefecturesFromJa,
  parseJapaneseNumber,
} = require("./nhk");
const {
  patientId,
  columnPos,
  prefectureTabs,
} = require("./patient-sheet");

const SPREADSHEET_ID = "1vkw_Lku7F_F3F_iNmFFrDq9j7-tQ6EmZPOLpLt-s3TY";
const CREDENTIALS_PATH = path.join(__dirname, "./credentials.json");
const NHKNEWS_BASE_URL = "https://www3.nhk.or.jp";

// test sheet
// const SPREADSHEET_ID = '1hVMsINcHicoq-Ed68_puYlInLusnweniqG3As-lSF_o';

const toGoogleSheetDateValue = (dateString) => {
  const mysteriousDayOffset = 2; // dunno why 2 days are missing between 1900-1970
  const sheetsStartDate = DateTime.fromISO("1900-01-01");
  const newCellDate = DateTime.fromISO(dateString);
  const interval = Interval.fromDateTimes(sheetsStartDate, newCellDate);
  // console.log('Current Value', dateCell.formattedValue, dateCell.value)
  // console.log('Calculated Value', cellDate.toISODate())
  // console.log(interval.length('days') + 2)
  return mysteriousDayOffset + interval.length("days");
};

const insertColumn = async (sheet, columnIndex) => {
  // eslint-disable-next-line no-underscore-dangle
  await sheet._makeSingleUpdateRequest("insertRange",
    {
      range: {
        sheetId: sheet.sheetId,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1,
      },
      shiftDimension: "COLUMNS",
    });
};

const copyPasteColumn = async (sheet, fromColumnIndex, toColumnIndex) => {
  // eslint-disable-next-line no-underscore-dangle
  await sheet._makeSingleUpdateRequest("copyPaste",
    {
      source: {
        sheetId: sheet.sheetId,
        startColumnIndex: fromColumnIndex,
        endColumnIndex: fromColumnIndex + 1,
      },
      destination: {
        sheetId: sheet.sheetId,
        startColumnIndex: toColumnIndex,
        endColumnIndex: toColumnIndex + 1,
      },
      pasteType: "PASTE_NORMAL",
      pasteOrientation: "NORMAL",
    });
};

const googleCredentials = () => {
  if (process.env.GOOGLE_ACCOUNT_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_ACCOUNT_CREDENTIALS_JSON);
  }
  // eslint-disable-next-line import/no-dynamic-require,global-require
  return require(CREDENTIALS_PATH);
};

const updateOrAddRow = async (prefecture, date, sheet, loadedRows, inputData, isDeceased) => {
  let found = false;
  let updated = false;
  let added = false;
  let writeToRow = -1;
  const matchStatus = isDeceased ? "Deceased" : null;

  // Find the existing row from the loaded rows, if we find it
  // update the row count supplied and set "updated" flag.
  for (let row = sheet.rowCount - loadedRows; row < sheet.rowCount; row += 1) {
    const rowPrefecture = sheet.getCell(row, columnPos.prefecture);
    const rowDateAnnounced = sheet.getCell(row, columnPos.dateAnnounced);
    const rowStatus = sheet.getCell(row, columnPos.status);
    const rowCount = sheet.getCell(row, columnPos.count);
    const rowSource = sheet.getCell(row, columnPos.source);

    // console.log({
    //   prefecture: rowPrefecture.value,
    //   date: rowDateAnnounced.formattedValue,
    //   count: rowCount.value,
    //   source: rowSource.value,
    //   status: rowStatus.value,
    // });

    if (rowPrefecture.value == prefecture
      && rowDateAnnounced.formattedValue == date
      && rowStatus.value == matchStatus) {
      found = true;
      console.log(`Found row ${row} for ${prefecture}/${date}/${matchStatus}`);
      if (rowCount.value != inputData.count) {
        rowCount.value = parseInt(inputData.count, 10);
        updated = true;
      }
      if (inputData.source) {
        rowSource.value = inputData.source;
      }
      break;
    }
  }

  // If we could not find it, find an empty row or add a new row.
  // then write the values in to the row found.
  if (!found) {
    console.log(`Could not find row for ${prefecture}/${date}/${matchStatus}`);
    // Find the next row with no rowId.
    for (let row = sheet.rowCount - loadedRows; row < sheet.rowCount; row += 1) {
      const rowId = sheet.getCell(row, columnPos.id);
      if (!rowId.value) {
        writeToRow = row;
        console.log(`Found empty row ${row}`);
        break;
      }
    }

    if (writeToRow === -1) {
      // No rows to write to, append a new row.
      writeToRow = sheet.rowCount;
      const { gridProperties } = sheet;
      gridProperties.rowCount = sheet.rowCount + 1;
      await sheet.updateProperties({ gridProperties });
      // // Load the added row.
      await sheet.loadCells({ startRowIndex: sheet.rowCount - 1, endRowIndex: sheet.rowCount + 1 });
      console.log(`Adding new row ${writeToRow}`);
    }

    const row = writeToRow;
    sheet.getCell(row, columnPos.id).value = isDeceased ? "Existing" : patientId(prefecture, date);
    sheet.getCell(row, columnPos.prefecture).value = prefecture;
    // TODO: date values don't get written correctly,
    //       they get written out as strings rather than date format.
    sheet.getCell(row, columnPos.dateAdded).value = toGoogleSheetDateValue(date);
    sheet.getCell(row, columnPos.dateAnnounced).value = toGoogleSheetDateValue(date);
    sheet.getCell(row, columnPos.status).value = matchStatus;
    sheet.getCell(row, columnPos.count).value = parseInt(inputData.count, 10);
    sheet.getCell(row, columnPos.source).value = inputData.source;
    added = true;
  }

  // Commit changes to sheet if cells were updated or a new row was added.
  if (updated || added) {
    await sheet.saveUpdatedCells();
    console.log("Commiting changes.");
    return true;
  }

  return false;
};

const updatePatientData = async (date, prefectureCounts, shouldWrite) => {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(googleCredentials());
  await doc.loadInfo(); // loads document properties and worksheets

  const bufferSize = 100;

  const patientsSheet = doc.sheetsByTitle["Patient Data"];
  await patientsSheet.loadCells({ startRowIndex: patientsSheet.rowCount - bufferSize });

  const updatedRows = [];

  const updatedPrefectureSheets = [];
  for (const prefecture of Object.keys(prefectureCounts)) {
    const data = prefectureCounts[prefecture];
    console.log("Data for ", prefecture, data);
    let sheet = patientsSheet;
    if (prefectureTabs.includes(prefecture)) {
      console.log("Writing to sheet", prefecture);
      sheet = doc.sheetsByTitle[prefecture];
      await sheet.loadCells({ startRowIndex: sheet.rowCount - bufferSize });
      updatedPrefectureSheets.push(sheet);
    }

    if (data.deceased) {
      const didUpdate = await updateOrAddRow(prefecture, date, sheet, bufferSize, data.deceased, true);
      if (didUpdate) {
        updatedRows.push({ prefecture, deceased: data.deceased });
      }
    }
    if (data.confirmed) {
      const didUpdate = await updateOrAddRow(prefecture, date, sheet, bufferSize, data.confirmed, false);
      if (didUpdate) {
        updatedRows.push({ prefecture, confirmed: data.confirmed });
      }
    }
  }

  if (shouldWrite) {
    await patientsSheet.saveUpdatedCells();
    for (const sheet of updatedPrefectureSheets) {
      await sheet.saveUpdatedCells();
    }
    return { result: "updated", updatedRows };
  }
  return { result: "no change", updatedRows };
};

const writeNhkSummary = async (credentialsJson, dateString, url, prefectureCounts, otherCounts) => {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(credentialsJson);
  await doc.loadInfo(); // loads document properties and worksheets

  const nhkSheet = doc.sheetsByTitle.NHK;
  await nhkSheet.loadCells("H1:H59");
  await nhkSheet.loadCells("A2");

  let dateCell = nhkSheet.getCellByA1("H1");
  let linkCell = nhkSheet.getCellByA1("H2");

  const dateValue = toGoogleSheetDateValue(dateString);
  if (dateValue > dateCell.value) {
    // If the date to write it larger than the current value,
    // insert column and copy old values to the new column.
    await insertColumn(nhkSheet, 8);
    await copyPasteColumn(nhkSheet, 7, 8);
  }

  // Load cells again in case we inserted a new column.
  await nhkSheet.loadCells("H1:H59");
  dateCell = nhkSheet.getCellByA1("H1");
  linkCell = nhkSheet.getCellByA1("H2");

  if (dateCell.value != dateValue) {
    dateCell.value = dateValue;
  }

  const linkFormula = `=HYPERLINK("${url}", "Link")`;
  if (linkCell.formula != linkFormula) {
    linkCell.formula = linkFormula;
  }

  for (let i = 0; i < prefectureCounts.length; i += 1) {
    const cell = nhkSheet.getCell(3 + i, 7);
    if (cell.value != prefectureCounts[i]) {
      cell.value = prefectureCounts[i];
    }
  }

  for (let i = 0; i < otherCounts.length; i += 1) {
    const cell = nhkSheet.getCell(50 + i, 7);
    if (cell.value != otherCounts[i]) {
      cell.value = otherCounts[i];
    }
  }

  // Write the current date in to the A2 cell.
  const todayCell = nhkSheet.getCellByA1("A2");
  if (todayCell.value != dateValue) {
    todayCell.value = dateValue;
  }

  await nhkSheet.saveUpdatedCells();
  return "OK";
};

const extractAndWriteSummary = (date, url, shouldWrite) => extractDailySummary(url, fetch)
  .then(async (values) => {
    const prefectureCounts = sortedPrefectureCounts(values);
    const otherCounts = [
      values.portQuarantineCount,
      values.critical,
      values.deceased,
      values.recoveredJapan,
      values.recoveredTotal,
    ];

    // Abort if any of the numbers look weird
    let errors = "";
    for (const count of otherCounts) {
      if (!count) {
        errors = "otherCounts has 0s";
      }
    }
    if (prefectureCounts.length < 47) {
      errors = "prefectureCounts are less than 47";
    }
    for (const count of prefectureCounts) {
      if (!count) {
        errors = "prefectureCounts has 0s";
      }
    }

    let writeStatus = "";
    if (!errors && shouldWrite) {
      writeStatus = await writeNhkSummary(googleCredentials(), date, url, prefectureCounts, otherCounts);
    }

    return {
      date,
      counts: values,
      writeStatus,
      errors,
    };
  });

const getAllArticles = (pageCount = 7) => latestNhkArticles(fetch, pageCount).then((articles) => {
  const structuredReports = [];

  // headline patterns
  const confirmedPatientPatterns = [
    new RegExp("([0-9０-９]+)人感染確認", "iu"),
    new RegExp("([0-9０-９]+)人の感染確認", "iu"),
    new RegExp("感染確認([0-9０-９]+)人", "iu"),
  ];
  const deceasedPatientPatterns = [
    new RegExp("([0-9０-９]+)人の死亡確認"),
    new RegExp("([0-9０-９]+)人死亡"),
    new RegExp("([0-9０-９]+)人が死亡"),
  ];
  const prefecturePattern = new RegExp(`(${Object.keys(prefecturesFromJa).join("|")})`);

  for (const article of articles) {
    const date = DateTime.fromJSDate(new Date(article.pubDate)).toISODate();
    const url = NHKNEWS_BASE_URL + article.link;

    const prefectureMatch = article.title.match(prefecturePattern);
    if (prefectureMatch) {
      let confirmedMatch = null;
      for (const confirmedPattern of confirmedPatientPatterns) {
        if (article.title.match(confirmedPattern)) {
          // eslint-disable-next-line prefer-destructuring
          confirmedMatch = article.title.match(confirmedPattern)[1];
          break;
        }
      }
      let deathMatch = null;
      for (const deathPattern of deceasedPatientPatterns) {
        if (article.title.match(deathPattern)) {
          // eslint-disable-next-line prefer-destructuring
          deathMatch = article.title.match(deathPattern)[1];
          break;
        }
      }

      const report = {
        date,
        title: article.title,
        source: url,
        prefecture: prefecturesFromJa[prefectureMatch[1]],
      };
      if (confirmedMatch) {
        report.confirmed = parseJapaneseNumber(confirmedMatch);
      }
      if (deathMatch) {
        report.deaths = parseJapaneseNumber(deathMatch);
      }
      structuredReports.push(report);
    } else {
      structuredReports.push({
        date,
        title: article.title,
        source: url,
      });
    }
  }
  return structuredReports;
});

const findAndWriteSummary = (date, writeToSpreadsheet = false, pageCount = 5) => {
  const matchDate = DateTime.fromISO(date).toFormat("yyyyMMdd");
  return latestNhkArticles(fetch, pageCount).then((articles) => {
    let summaryArticleUrl = "";
    const summaryArticleTitlePattern = new RegExp("(【国内感染】|【国内】|全国で|全国の感染発表|国内感染確認|国内の新たな感染確認)");
    for (const article of articles) {
      if (article.link.match(`/${matchDate}/`) && article.title.match(summaryArticleTitlePattern)) {
        summaryArticleUrl = NHKNEWS_BASE_URL + article.link;
        break;
      }
    }

    if (summaryArticleUrl) {
      console.log(summaryArticleUrl);
      return extractAndWriteSummary(date, summaryArticleUrl, writeToSpreadsheet);
    }
    return { result: { error: "No summary article found" } };
  });
};

const updatesForPatientDataFromNhkArticles = async (date, prefecture) => {
  const articles = await getAllArticles(20)
    .then((result) => result
      .filter((article) => (article.date === date))
      .filter((article) => (!!article.prefecture))
      .filter((article) => (!prefecture || prefecture === article.prefecture)));

  articles.forEach((article) => {
    console.log(`${article.date} ${article.prefecture} ${article.title} ${article.confirmed} ${article.deaths}`);
  });

  const prefectureUpdates = {};
  articles.forEach((article) => {
    if (!article.prefecture) {
      return;
    }

    if (!prefectureUpdates[article.prefecture]) {
      prefectureUpdates[article.prefecture] = {};
    }

    // Use the article where the number is the highest confirmed case count.
    if (article.confirmed) {
      if (!prefectureUpdates[article.prefecture].confirmed || prefectureUpdates[article.prefecture].confirmed.count < article.confirmed) {
        prefectureUpdates[article.prefecture].confirmed = {
          count: article.confirmed,
          source: article.source,
          title: article.title,
        };
      }
    }

    // Use the article where the number is the highest death case count.
    if (article.deaths) {
      if (!prefectureUpdates[article.prefecture].deceased || prefectureUpdates[article.prefecture].deceased.count < article.deaths) {
        prefectureUpdates[article.prefecture].deceased = {
          count: article.deaths,
          source: article.source,
          title: article.title,
        };
      }
    }
  });
  return prefectureUpdates;
};

const verifyNhkNumbers = async () => {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(googleCredentials());
  await doc.loadInfo(); // loads document properties and worksheets

  const nhkSheet = doc.sheetsByTitle.NHK;
  await nhkSheet.loadCells("A1:I59");

  const today = DateTime.utc().plus({ hours: 9 }).toISODate();
  const results = { date: today };
  // Check if the latest column has today's summary
  const dateCell = nhkSheet.getCellByA1("H1");
  const dateValue = toGoogleSheetDateValue(today);
  results.hasLatestNhkSummary = (dateValue == dateCell.value);

  // Check what differences in numbers we have
  const hasPrefectureDifferences = [];
  for (let row = 3; row < 50; row += 1) {
    const ourValue = nhkSheet.getCell(row, 3).value;
    const nhkValue = nhkSheet.getCell(row, 4).value;
    const prefecture = nhkSheet.getCell(row, 5).value;
    if (ourValue != nhkValue) {
      hasPrefectureDifferences.push({ prefecture, ourValue, nhkValue });
    }
  }
  if (hasPrefectureDifferences) {
    results.hasPrefectureDifferences = hasPrefectureDifferences;
  }

  // Check Prefecture Data Sheet
  const prefectureDataSheet = doc.sheetsByTitle["Prefecture Data"];
  await prefectureDataSheet.loadCells("A1:O50");

  // Check if there are any negative active numbers
  const hasNegativeActive = [];
  for (let row = 2; row < 50; row += 1) {
    const activeValue = prefectureDataSheet.getCell(row, 12).value;
    if (activeValue < 0) {
      const prefecture = prefectureDataSheet.getCell(row, 1).value;
      hasNegativeActive.push({ prefecture, activeValue });
    }
  }
  if (hasNegativeActive.count) {
    results.hasNegativeActive = hasNegativeActive;
  }

  return results;
};

exports.extractAndWriteSummary = extractAndWriteSummary;
exports.getAllArticles = getAllArticles;
exports.findAndWriteSummary = findAndWriteSummary;
exports.updatePatientData = updatePatientData;
exports.updatesForPatientDataFromNhkArticles = updatesForPatientDataFromNhkArticles;
exports.verifyNhkNumbers = verifyNhkNumbers;
