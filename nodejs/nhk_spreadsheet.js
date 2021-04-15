// Script to extract aggregate values from NHK and write them into 
// the Google Spreadsheet using the account that exists in
// credentials.json in the root directory of this checkout.
//
// These credentials are a service account that is generated using
// these instructions:
//
// https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication?id=service-account

const path = require('path')
const process = require('process')

const fetch = require('node-fetch')
const { GoogleSpreadsheet } = require('google-spreadsheet')
const { DateTime, Interval } = require('luxon')
const { extractDailySummary, sortedPrefectureCounts, latestNhkArticles, prefecturesFromJa } = require('./nhk.js')

const SPREADSHEET_ID = '1vkw_Lku7F_F3F_iNmFFrDq9j7-tQ6EmZPOLpLt-s3TY';
const CREDENTIALS_PATH =  path.join(__dirname, './credentials.json');
const NHKNEWS_BASE_URL = 'https://www3.nhk.or.jp';

// test sheet
//const SPREADSHEET_ID = '1hVMsINcHicoq-Ed68_puYlInLusnweniqG3As-lSF_o';

const insertColumn = async (sheet, columnIndex) => {
  await sheet._makeSingleUpdateRequest('insertRange', 
  {
    range: {
      sheetId: sheet.sheetId, 
      startColumnIndex: columnIndex, 
      endColumnIndex: columnIndex + 1
    },
    shiftDimension: 'COLUMNS'
  })
}

const copyPasteColumn = async(sheet, fromColumnIndex, toColumnIndex) => {
  await sheet._makeSingleUpdateRequest('copyPaste', 
  {
    source: {
      sheetId: sheet.sheetId, 
      startColumnIndex: fromColumnIndex, 
      endColumnIndex: fromColumnIndex + 1
    },
    destination: {
      sheetId: sheet.sheetId, 
      startColumnIndex: toColumnIndex, 
      endColumnIndex: toColumnIndex + 1      
    },
    pasteType: 'PASTE_NORMAL',
    pasteOrientation: 'NORMAL'
  })  
}

const googleCredentials = () => {
  if (process.env.GOOGLE_ACCOUNT_CREDENTIALS_JSON)  {
    return JSON.parse(process.env.GOOGLE_ACCOUNT_CREDENTIALS_JSON)
  } else {
    return require(CREDENTIALS_PATH)
  }
}

const writeNhkSummary = async (credentialsJson, dateString, url, prefectureCounts, otherCounts) => {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID)
  await doc.useServiceAccountAuth(credentialsJson)
  await doc.loadInfo(); // loads document properties and worksheets

  const nhkSheet = doc.sheetsByTitle['NHK']
  await nhkSheet.loadCells('H1:H59')
  await nhkSheet.loadCells('A2')

  let dateCell = nhkSheet.getCellByA1('H1')
  let linkCell = nhkSheet.getCellByA1('H2')

  const mysteriousDayOffset = 2 // dunno why 2 days are missing between 1900-1970
  let sheetsStartDate = DateTime.fromISO('1900-01-01')
  let newCellDate = DateTime.fromISO(dateString)
  let interval = Interval.fromDateTimes(sheetsStartDate, newCellDate)
  // console.log('Current Value', dateCell.formattedValue, dateCell.value)
  // console.log('Calculated Value', cellDate.toISODate())
  // console.log(interval.length('days') + 2)
  let dateValue = mysteriousDayOffset + interval.length('days')
  if (dateValue > dateCell.value) {
    // If the date to write it larger than the current value,
    // insert column and copy old values to the new column.
    await insertColumn(nhkSheet, 8)
    await copyPasteColumn(nhkSheet, 7, 8)
  }

  // Load cells again in case we inserted a new column.
  await nhkSheet.loadCells('H1:H59')
  dateCell = nhkSheet.getCellByA1('H1')
  linkCell = nhkSheet.getCellByA1('H2')

  if (dateCell.value != dateValue) {
    dateCell.value = dateValue
  }

  let linkFormula = `=HYPERLINK("${url}", "Link")`
  if (linkCell.formula != linkFormula) {
    linkCell.formula = linkFormula
  }

  for (let i = 0; i < prefectureCounts.length; i++) {
    let cell = nhkSheet.getCell(3 + i, 7)
    if (cell.value != prefectureCounts[i]) {
      cell.value = prefectureCounts[i]
    }
  }
  
  for (let i = 0; i < otherCounts.length; i++) {
    let cell = nhkSheet.getCell(50 + i, 7)
    if (cell.value != otherCounts[i]) {
      cell.value = otherCounts[i]
    }
  }

  // Write the current date in to the A2 cell.
  todayCell = nhkSheet.getCellByA1('A2')
  if (todayCell.value != dateValue) {
    todayCell.value = dateValue
  }

  await nhkSheet.saveUpdatedCells()
  return 'OK'
}

const extractAndWriteSummary = (date, url, shouldWrite) => {
  return extractDailySummary(url, fetch)
    .then(async values => {
      let prefectureCounts = sortedPrefectureCounts(values)
      let otherCounts = [
        values.portQuarantineCount,
        values.critical,
        values.deceased,
        values.recoveredJapan,
        values.recoveredTotal
      ]

      // Abort if any of the numbers look weird
      let errors = ''
      for (let count of otherCounts) {
        if (!count) {
          errors = 'otherCounts has 0s'
        }
      }
      if (prefectureCounts.length < 47) {
        errors ='prefectureCounts are less than 47'
      }
      for (let count of prefectureCounts) {
        if (!count) {
          errors = 'prefectureCounts has 0s'
        }
      }

      let writeStatus = ''
      if (!errors && shouldWrite) {
        writeStatus = await writeNhkSummary(googleCredentials(), date, url, prefectureCounts, otherCounts)
      }

      return {
        date,
        counts: values,
        writeStatus,
        errors,
      }
    })
}

const getAllArticles = (pageCount = 7) => {
  return latestNhkArticles(fetch, pageCount).then(articles => {
    let structuredReports = []

    // headline patterns
    const confirmedPatientPatterns = [
      new RegExp('([\\d]+)人感染確認', 'iu'),
      new RegExp('([\\d]+)人の感染確認', 'iu'),
      new RegExp('感染確認([\\d]+)人', 'iu'),
    ]
    const deceasedPatientPatterns = [
      new RegExp('([\\d]+)人の死亡確認'),
      new RegExp('([\\d]+)人死亡'),
      new RegExp('([\\d]+)人が死亡'),
    ]
    const prefecturePattern = new RegExp('(' + Object.keys(prefecturesFromJa).join('|') + ')')

    for (let article of articles) {
      let date = DateTime.fromJSDate(new Date(article.pubDate)).toISODate()
      let url = NHKNEWS_BASE_URL + article.link

      let prefectureMatch = article.title.match(prefecturePattern)
      if (prefectureMatch) {
        let confirmedMatch = null
        for (let confirmedPattern of confirmedPatientPatterns) {
          if (article.title.match(confirmedPattern)) {
            confirmedMatch = article.title.match(confirmedPattern)[1]
            break
          }
        }
        let deathMatch = null
        for (let deathPattern of deceasedPatientPatterns) {
          if (article.title.match(deathPattern)) {
            deathMatch = article.title.match(deathPattern)[1]
            break
          }
        }

        let report = {
          date: date,
          title: article.title,
          source: url,
          prefecture: prefecturesFromJa[prefectureMatch[1]],
        }
        if (confirmedMatch) {
          report['confirmed'] = confirmedMatch
        }
        if (deathMatch) {
          report['deaths'] = deathMatch
        }
        structuredReports.push(report)
      } else {
        structuredReports.push({
          date: date,
          title: article.title,
          source: url
        })
      }
    } 
    return structuredReports
  })
}

const findAndWriteSummary = (date, writeToSpreadsheet=false, pageCount=5) => {
  let matchDate = DateTime.fromISO(date).toFormat('yyyyMMdd')
  return latestNhkArticles(fetch, pageCount).then(articles => {
    let summaryArticleUrl = ''
    const summaryArticleTitlePattern = new RegExp('(【国内感染】|【国内】)')
    for (let article of articles) {
      if (article.link.match('/' + matchDate + '/') && article.title.match(summaryArticleTitlePattern)) { 
        summaryArticleUrl = NHKNEWS_BASE_URL + article.link
        break
      }
    }

    if (summaryArticleUrl) {
      console.log(summaryArticleUrl)
      return extractAndWriteSummary(date, summaryArticleUrl, writeToSpreadsheet)
    } else {
      return {result: {error: 'No summary article found'}}
    }
  })
}

exports.extractAndWriteSummary = extractAndWriteSummary
exports.getAllArticles = getAllArticles
exports.findAndWriteSummary = findAndWriteSummary