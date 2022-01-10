#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Extracts data from MHLW COVID PDFs, images and reports, and optionally writes
them to the Google Spreadsheet.

Install:
pip3 install -r requirements.txt
brew install tesseract # for mac


Run:
python3 extract.py --extractSummary --writeOutput

Hacks:
- In order to parse the image table on the COVID report, we hard code the
  the location of the cells we want. If the format of the table changes, or even
  the screenshot size changes, it may fail.
- Camelot works fine on the MHLW per-prefecture recovery PDFs, but we only
  look at the first 47 rows (of the prefectures) and assume that the order is
  in the prefecture order, which is the same as the spreadsheet. If any of them
  change, this will break.


Credentials use a service account credentials that are created using
these instructions and places in credentials.json:

https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication?id=service-account
"""

import sys
import re
import urllib.request
import urllib.parse
import tempfile
import argparse
import pprint

import camelot
import pandas as pd
from bs4 import BeautifulSoup

from PIL import Image
import pytesseract

from googleapiclient.discovery import build
from google.oauth2 import service_account
from google.auth.transport.requests import Request

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SPREADSHEET_ID = '1vkw_Lku7F_F3F_iNmFFrDq9j7-tQ6EmZPOLpLt-s3TY'
DEFAULT_MHLW_INDEX_URL = 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/topics_shingata_09444.html'
# 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000121431_00204.html'


def absoluteUrl(referer, path):
    if path.startswith('data:'):
        return path
    if path.startswith('http'):
        return path
    baseurl = urllib.parse.urlparse(referer)
    return urllib.parse.urlunparse((baseurl.scheme, baseurl.netloc, path, '', '', ''))


def getLatestCovidReport(indexUrl):
    """ 
    Returns the URL for the latest COVID report on MHLW.

    @param indexUrl: URL of the index page of all reports.
    @returns None if no report found, URL of the first report if found.
    """
    covidReportName = '新型コロナウイルス感染症の現在の状況'
    covidReportPattern = re.compile(covidReportName)
    contents = urllib.request.urlopen(indexUrl).read()
    soup = BeautifulSoup(contents, features="html.parser")
    links = soup.find_all('a')
    for link in links:
        if link and link.text and covidReportPattern.search(link.text):
            if link['href'].startswith('http'):
                return link['href']
            else:
                return absoluteUrl(indexUrl, link['href'])
    return None


def getSummaryTable(soup):
    content = soup.find('div', class_='l-contentBody')
    images = content.find_all('img')
    for image in images:
        if image and image['src']:
            return image['src']
    return None


def getReportFromUrl(reportUrl):
    contents = urllib.request.urlopen(reportUrl).read()
    return BeautifulSoup(contents, features="html.parser")


def getReportDate(soup):
    time = soup.find('time')
    if time:
        return time['datetime']
    return None


def getPdfData(soup):
    prefectureRecoveryName1 = '別紙１'
    prefectureRecoveryName2 = '各都道府県の検査陽性者の状況'
    images = soup.find_all('img')
    links = soup.find_all('a')
    pdfLink = None
    for link in links:
        if link and link.text and (link.text.startswith(prefectureRecoveryName1) or link.text.startswith(prefectureRecoveryName2)):
            pdfLink = link['href']
            if not pdfLink.startswith('https://'):
                pdfLink = 'https://www.mhlw.go.jp' + pdfLink

    if pdfLink:
        pdfData = urllib.request.urlopen(pdfLink).read()
        return pdfData

    return None


def extractCasesRecoveryNumbers(pdfPath, verbose=False):
    tables = camelot.read_pdf(
        pdfPath, flavor='stream', pages='1')

    # Find the position of the recovery column
    recovery_col = 7
    recovery_title_row = 1
    for index, cell in tables[0].df.loc[recovery_title_row].items():
        if re.match('退院', cell):
            recovery_col = index
            print('found recovery col at %d: %s' % (index, cell))
            break

    # Find the position of the first data row (Hokkaido)
    first_row = 6
    if tables[0].df.loc[first_row][0] != '北海道':
        first_row = 7
        if tables[0].df.loc[first_row][0] != '北海道':
            print('Unable to find first row.')
            print(tables[0].df.to_string())
            return []

    summary = tables[0].df.loc[first_row:, [0, 2, recovery_col]]

    if verbose:
        print(tables[0].df.to_string())

    prefectureValues = []
    for index, row in summary.iterrows():

        prefecture = row[0]
        prefecture = re.sub('※[0-9]', '', prefecture)
        prefecture = re.sub('\s', '', prefecture)

        cases = row[2]
        cases = re.sub('※[0-9] ', '', cases)
        cases = re.sub('[^0-9]+', '', cases)

        recovery = row[recovery_col]
        recovery = re.sub('※[0-9] ', '', recovery)
        recovery = re.sub('[^0-9]+', '', recovery)

        if verbose:
            print('%s: Recovery: %s Cases: %s' % (prefecture, recovery, cases))
        prefectureValues.append((prefecture, recovery, cases))

    # Strip last two rows
    prefectureValues = prefectureValues[:-2]

    return prefectureValues


def extractImageAreas(image, normalizedSize):
    # All values are relative to normalizedSize (661, 181)
    rowHeight = 18
    doubleRowHeight = 36
    secondRowY = 86
    lastRowY = 145
    pcrColumnX = 70
    pcrColumnWidth = 88
    criticalColumnX = 320
    criticalColumnWidth = 76
    recoveryColumnX = 400
    recoveryColumnWidth = 100
    deathsColumnX = 510
    deathsColumnWidth = 68

    pcrRect = (
        pcrColumnX,
        lastRowY,
        pcrColumnX + pcrColumnWidth,
        lastRowY + rowHeight)
    criticalRect = (
        criticalColumnX,
        lastRowY,
        criticalColumnX + criticalColumnWidth,
        lastRowY + rowHeight)
    criticalRectTall = (
        criticalColumnX,
        lastRowY,
        criticalColumnX + criticalColumnWidth,
        lastRowY + doubleRowHeight)
    portRecoveriesRect = (
        recoveryColumnX,
        secondRowY,
        recoveryColumnX + recoveryColumnWidth,
        secondRowY + rowHeight)
    portRecoveriesRect2 = (
        recoveryColumnX,
        secondRowY,
        recoveryColumnX + recoveryColumnWidth,
        secondRowY + doubleRowHeight)
    recoveriesRect = (
        recoveryColumnX,
        lastRowY,
        recoveryColumnX + recoveryColumnWidth,
        lastRowY + rowHeight)
    deathsRect = (
        deathsColumnX,
        lastRowY,
        deathsColumnX + deathsColumnWidth,
        lastRowY + rowHeight)

    return {
        'pcr': [image.crop(pcrRect)],
        'critical': [image.crop(criticalRect), image.crop(criticalRectTall)],
        'recoveries': [image.crop(recoveriesRect)],
        'portRecoveries': [image.crop(portRecoveriesRect), image.crop(portRecoveriesRect2)],
        'deaths': [image.crop(deathsRect)]
    }


def extractDailySummary(imageUrl, outputImages):
    imageData = urllib.request.urlopen(imageUrl)
    image = Image.open(imageData).convert(mode='RGBA')
    image.save('original.png')
    white = Image.new('RGBA', image.size, color='#ffffff')
    # white.save('white.png')
    mergedImage = Image.alpha_composite(white, image)
    # mergedImage.save('merged.png')
    normalizedSize = (661, 181)
    mergedImage = mergedImage.resize(normalizedSize)
    mergedImage = mergedImage.convert(mode='L')
    subImages = extractImageAreas(mergedImage, normalizedSize)
    values = {}
    for key in subImages:
        for i in range(len(subImages[key])):
            subImage = subImages[key][i]
            if outputImages:
                subImage.save('%s%d.png' % (key, i))

            # tesseract has trouble with 5 and $, so let it recognize both.
            text = pytesseract.image_to_string(
                subImage, config='--psm 6 -c tessedit_char_whitelist=$0123456789,')
            print('Text for %s %d: %s' % (key, i, text.strip()))
            try:
                numberMatch = re.search('([0-9,\$]+)', text)
                if numberMatch:
                    # sanitize the numbers by removing , and replace $ with 5.
                    num = int(numberMatch.group(1).replace(
                        ',', '').replace('$', '5'))
                    values[key] = num
                    break
                else:
                    print('Could not find number in %s %d: %s' %
                          (key, i, text))
            except ValueError as e:
                print(e)

        # print('%s %d' % (key, num))
    return values


def writeSumByDay(sheet, valueDate, values):
    result = sheet.values().get(spreadsheetId=SPREADSHEET_ID,
                                range="'Sum By Day'!A2:G").execute()
    if not result:
        print('Error: No results')
        return False

    currentValues = result.get('values', [])
    lastRow = currentValues[-1].copy()
    if lastRow[0] == valueDate:
        print('Value for today %s already exists.' % valueDate)
        return False

    for v in (values['recoveries'], values['deaths'], values['critical'], values['pcr']):
        if not v or v == 0:
            raise ValueError('Not all values for Sum By Day exists')

    todaysRow = [valueDate, '', values['recoveries'],
                 values['deaths'], values['critical'], values['pcr']]
    rowBody = {
        'values': [todaysRow]
    }

    return sheet.values().append(
        spreadsheetId=SPREADSHEET_ID,
        range="'Sum By Day'",
        valueInputOption='USER_ENTERED',
        body=rowBody).execute()


def writePrefectureData(sheet, values, verbose=False):
    # Check the values
    if 'prefectureCasesRecoveries' not in values:
        raise ValueError('prefectureCasesRecoveries values are unavailable')
    if len(values['prefectureCasesRecoveries']) < 47:
        raise ValueError('prefectureCasesRecoveries are incomplete')
    if 'portRecoveries' not in values or values['portRecoveries'] < 1:
        raise ValueError('portRecoveries are unavailable')

    if verbose:
        result = sheet.values().get(spreadsheetId=SPREADSHEET_ID,
                                    range="'Prefecture Data'!E3:E50").execute()
        print(result)

    results = []

    todaysRecoveries = []
    for v in values['prefectureCasesRecoveries']:
        todaysRecoveries.append([v[1]])
    todaysRecoveries.append([values['portRecoveries']])
    result = sheet.values().update(
        spreadsheetId=SPREADSHEET_ID,
        range="'Prefecture Data'!E3:E50",
        valueInputOption='USER_ENTERED',
        body={'values': todaysRecoveries}).execute()
    results.append(result)

    # Write cases
    todaysCases = []
    for v in values['prefectureCasesRecoveries']:
        todaysCases.append([v[2]])
    todaysCases.append([values['portRecoveries']])
    result = sheet.values().update(
        spreadsheetId=SPREADSHEET_ID,
        range="'Prefecture Data'!I3:I50",
        valueInputOption='USER_ENTERED',
        body={'values': todaysCases}).execute()
    results.append(result)
    return results


def writeRecoveries(sheet, valueDate, values):
    # Check the values
    if 'prefectureCasesRecoveries' not in values:
        raise ValueError('prefectureCasesRecoveries values are unavailable')
    if len(values['prefectureCasesRecoveries']) < 47:
        raise ValueError('prefectureCasesRecoveries are incomplete')
    if 'portRecoveries' not in values or values['portRecoveries'] < 1:
        raise ValueError('portRecoveries are unavailable')

    # check if the values have already been written.
    result = sheet.values().get(spreadsheetId=SPREADSHEET_ID,
                                range="'Recoveries'!C1:C1").execute()
    currentValues = result.get('values', [])
    if currentValues[0][0] == valueDate:
        print('Todays values already written in to Recoveries')
        return False

    # Construct the values for the column.
    todaysRecoveryValues = [[valueDate]]
    for v in values['prefectureCasesRecoveries']:
        todaysRecoveryValues.append([v[1]])
    todaysRecoveryValues.append([values['portRecoveries']])
    # last value is always 8 recoveries for "Unspecified"
    todaysRecoveryValues.append([8])

    # Get the Sheet ID for the recoveries
    sheetsResult = sheet.get(spreadsheetId=SPREADSHEET_ID,
                             fields='sheets.properties').execute()
    recoveriesSheetId = 0
    for sheetProperty in sheetsResult['sheets']:
        if sheetProperty['properties']['title'] == 'Recoveries':
            recoveriesSheetId = sheetProperty['properties']['sheetId']
            break

    if not recoveriesSheetId:
        raise ValueError('Unable to find sheetId for Recoveries tab')

    # Insert column into the Recoveries Sheet.
    requests = []
    requests.append({
        'insertDimension': {
            'range': {
                'sheetId': recoveriesSheetId,
                'dimension': 'COLUMNS',
                'startIndex': 2,
                'endIndex': 3
            },
            'inheritFromBefore': True
        }
    })
    result = sheet.batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={'requests': requests}).execute()
    print(result)

    # Append values into the sheet.
    return sheet.values().update(
        spreadsheetId=SPREADSHEET_ID,
        range="'Recoveries'!C1:C50",
        valueInputOption='USER_ENTERED',
        body={'values': todaysRecoveryValues}).execute()


def writeValues(valueDate, values):
    creds = service_account.Credentials.from_service_account_file(
        './credentials.json', scopes=SCOPES
    )
    service = build('sheets', 'v4', credentials=creds)
    sheet = service.spreadsheets()

    print('Writing to Sum By Day Sheet')
    result = writeSumByDay(sheet, valueDate, values)
    print(result)

    if 'prefectureCasesRecoveries' in values:
        print('Writing to Prefecture Data Sheet')
        result = writePrefectureData(sheet, values)
        print(result)

        print('Writing to Recoveries Sheet')
        result = writeRecoveries(sheet, valueDate, values)

    return result


def reportToday(writeToSpreadsheet=False):
    reportUrl = getLatestCovidReport(DEFAULT_MHLW_INDEX_URL)
    if not reportUrl:
        return 'Failed to get report URL'

    summaryValues = {}
    print(reportUrl)
    reportSoup = getReportFromUrl(reportUrl)
    reportDate = getReportDate(reportSoup)
    summaryTableUrl = absoluteUrl(reportUrl, getSummaryTable(reportSoup))
    reportPdfData = getPdfData(reportSoup)
    print(reportDate)

    if reportPdfData:
        with tempfile.NamedTemporaryFile(suffix='.pdf') as temp:
            temp.write(reportPdfData)
            casesRecoveries = extractCasesRecoveryNumbers(temp.name)
            summaryValues['prefectureCasesRecoveries'] = casesRecoveries

    if summaryTableUrl:
        values = extractDailySummary(summaryTableUrl, False)
        summaryValues.update(values)

    writeStatus = 'Not written'
    if writeToSpreadsheet:
        writeStatus = writeValues(reportDate, summaryValues)

    return 'Date: {}\nURL: {}\nWriteStatus: {}\n{}'.format(reportDate, reportUrl, writeStatus, summaryValues)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--reportUrl')
    parser.add_argument('--indexUrl', default=DEFAULT_MHLW_INDEX_URL)
    parser.add_argument('--disableExtractRecoveries', action='store_true')
    parser.add_argument('--extractSummary', action='store_true')
    parser.add_argument('--outputText', action="store_true")
    parser.add_argument('--outputImages', action="store_true")
    parser.add_argument('--writeResults', action='store_true')
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args()

    reportUrl = None
    if args.reportUrl:
        reportUrl = args.reportUrl
    else:
        reportUrl = getLatestCovidReport(args.indexUrl)

    reportDate = None
    reportPdfData = None
    summaryTableUrl = None
    summaryValues = {}

    if reportUrl:
        print(reportUrl)
        reportSoup = getReportFromUrl(reportUrl)
        reportDate = getReportDate(reportSoup)
        summaryTableUrl = absoluteUrl(reportUrl, getSummaryTable(reportSoup))
        reportPdfData = getPdfData(reportSoup)
        print(reportDate)

    if not args.disableExtractRecoveries:
        if reportPdfData:
            with tempfile.NamedTemporaryFile(suffix='.pdf') as temp:
                temp.write(reportPdfData)
                casesRecoveries = extractCasesRecoveryNumbers(
                    temp.name, args.verbose)
                summaryValues['prefectureCasesRecoveries'] = casesRecoveries

    if args.extractSummary and summaryTableUrl:
        values = extractDailySummary(summaryTableUrl, args.outputImages)
        summaryValues.update(values)

    if args.outputText and summaryValues:
        if 'prefectureCasesRecoveries' in summaryValues:
            [print(v[1]) for v in summaryValues['prefectureCasesRecoveries']]
        print(summaryValues['portRecoveries'])
        print('---')
        print('recoveries,deaths,critical,tested')
        print('%(recoveries)d\t%(deaths)d\t%(critical)d\t%(pcr)d' % summaryValues)

    if args.writeResults:
        pprint.pprint(summaryValues)
        writeValues(reportDate, summaryValues)
