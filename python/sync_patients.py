#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Adds patients to the COVID19Japan spreadsheet.

Credentials use a service account credentials that are created using
these instructions and places in credentials.json:

https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication?id=service-account
"""

import sys
import re
import argparse
import pprint
import datetime
import urllib.parse

from googleapiclient.discovery import build
from google.oauth2 import service_account
from google.auth.transport.requests import Request

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SPREADSHEET_ID = '1vkw_Lku7F_F3F_iNmFFrDq9j7-tQ6EmZPOLpLt-s3TY'

PREFECTURE_PREFIX = {
  "Aichi": "AC",
  "Akita": "AK",
  "Aomori": "AM",
  "Chiba": "CHB",
  "Ehime": "EH",
  "Fukui": "FKI",
  "Fukuoka": "FK",
  "Fukushima": "FKS",
  "Gifu": "GF",
  "Gunma": "GM",
  "Hiroshima": "HRS",
  "Hokkaido": "HKD",
  "Hyogo": "HY",
  "Ibaraki": "IB",
  "Ishikawa": "ISK",
  "Iwate": "IW",
  "Kagawa": "KGW",
  "Kagoshima": "KGS",
  "Kanagawa": "KNG",
  "Kochi": "KC",
  "Kumamoto": "KM",
  "Kyoto": "KYT",
  "Mie": "ME",
  "Miyagi": "MYG",
  "Miyazaki": "MYZ",
  "Nagano": "NGN",
  "Nagasaki": "NGS",
  "Nara": "NR",
  "Niigata": "NGT",
  "Oita": "OIT",
  "Okayama": "OKY",
  "Okinawa": "OKN",
  "Osaka": "OSK",
  "Saga": "SG",
  "Saitama": "STM",
  "Shiga": "SHG",
  "Shimane": "SM",
  "Shizuoka": "SZ",
  "Tochigi": "TCG",
  "Tokushima": "TKS",
  "Tokyo": "TOK",
  "Tottori": "TTR",
  "Toyama": "TY",
  "Wakayama": "WKY",
  "Yamagata": "YGT",
  "Yamaguchi": "YGC",
  "Yamanashi": "YNS",
  "Port Quarantine": "PRT"
}

def getRecentPatientRows(sheet, tabProperties):
  rowsToFetch = 100
  totalRows = tabProperties['gridProperties']['rowCount']

  getFromRow = totalRows - rowsToFetch

  rows = sheet.values().get(spreadsheetId=SPREADSHEET_ID, 
      range="'%s'!A%d:L" % (tabProperties['title'], getFromRow)).execute()

  return {'startRow': getFromRow, 'rows': rows['values']}

def updatePatientCountForDate(sheet, tabProperties, prefecture, date, cases, deceased, source):
  """
  Updates the patient count in the sheet. If the row for that prefecture on the same date
  already exists but the count different, the count number will be modified.

  If the row doesn't exist, then will be appended.

  This assumes the row is using the countFormat.
  """
  result = getRecentPatientRows(sheet, tabProperties)

  # Find existing row that we already added.
  PATIENT_ID_COL = 0
  DATE_COL = 3
  PREFECTURE_COL = 9
  STATUS_COL = 10
  COUNT_COL = 11
  COUNT_COL_A1 = 'L'
  foundRow = False
  for i in range(0, len(result['rows'])):
    rowNumber = result['startRow'] + i
    row = result['rows'][i]
    if row[DATE_COL] == date and row[PREFECTURE_COL] == prefecture:
      isDeceased = row[STATUS_COL] == 'Deceased'
      if deceased and isDeceased:
        foundRow = True
      if not deceased and row[STATUS_COL] == '':
        foundRow = True
      
    if foundRow:
      count = deceased if deceased else count
      if int(row[COUNT_COL]) == count:
        print('Found row but the count was identical: %s %s' % (prefecture, row[COUNT_COL]))
        return
      else:
        # update the count with the new number
        rangeString= "'%s'!%s%d:%s%d" % (tabProperties['title'], COUNT_COL_A1, rowNumber, COUNT_COL_A1, rowNumber)
        print(rangeString)
        result = sheet.values().update(
          spreadsheetId=SPREADSHEET_ID, 
          range=rangeString,
          valueInputOption='USER_ENTERED',
          body = {'values': [[count]]}).execute()
        return result

  # if we get here, we didn't find the row, so we'll have to append a row.
  patientNumberPrefix, lastPatientNumber = PREFECTURE_PREFIX[prefecture], int(date.replace('-', ''))
  return appendRows(sheet, tabProperties, prefecture, date, 
      cases = cases,
      deceased = deceased, 
      source = source, 
      patientNumberPrefix = patientNumberPrefix, 
      lastPatientNumber = lastPatientNumber,
      useCountColumn = True)

def getPatientNumberColumn(sheet, tabProperties):
  patientNumbers = sheet.values().get(spreadsheetId=SPREADSHEET_ID, 
      range="'%s'!A:A" % (tabProperties['title'])).execute()

  patientNumbers = [row[0] for row in patientNumbers['values'] if row[0] != 'Existing']
  lastPatientNumber = patientNumbers[-1]

  isAlphaNumericPattern = re.match('([^\d]+)([0-9]+)', lastPatientNumber)
  if isAlphaNumericPattern:
    return (isAlphaNumericPattern.group(1), int(isAlphaNumericPattern.group(2)))
  return ('', int(lastPatientNumber))

def appendRows(sheet, tabProperties, prefecture, date, cases=0, deceased=0, source='', patientNumberPrefix='', lastPatientNumber=0, useCountColumn=False):
  patientNumber = lastPatientNumber
  rows = []
  deceasedValue =  'Deceased' if deceased else ''

  if useCountColumn:
    rows.append([
        'Existing' if deceased else '%s%d' % (patientNumberPrefix, patientNumber),
        '',
        '',
        date,
        date,
        '',  # age
        '',  # gender
        '',  # city
        '',  # detectedCity
        prefecture,
        'Deceased' if deceased else '',
        deceased if deceased else cases,
        '',
        source
    ])
  else:
    rowCount = deceased if deceased else cases
    for i in range(rowCount):
      patientNumber += 1
      rows.append([
        'Existing' if deceased else '%s%d' % (patientNumberPrefix, patientNumber),
        '',
        '',
        date,
        date,
        '',  # age
        '',  # gender
        '',  # city
        '',  # detectedCity
        prefecture,
        'Deceased' if deceased else '',
        '',
        '',
        source
      ])
    pprint.pprint(rows)

  return sheet.values().append(
    spreadsheetId=SPREADSHEET_ID, 
    range="'%s'!A:E" % (tabProperties['title']),
    valueInputOption='USER_ENTERED',
    insertDataOption='INSERT_ROWS',
    includeValuesInResponse=True,
    responseValueRenderOption='FORMATTED_VALUE',
    body={'majorDimension': 'ROWS', 'values': rows}).execute()

def getTabForPrefecture(prefecture):
  """
  Returns the correct tab name given the prefecture.
  """
  if prefecture in ('Aichi', 'Chiba', 'Fukuoka', 'Hokkaido', 'Kanagawa', 'Osaka', 'Saitama', 'Tokyo'):
    return prefecture
  return 'Patient Data'

def writePatients(prefecture, date, cases, deceased, source, useCountColumn=True, update=True):  
  """
  Writes the patient count information into the spreadsheet.
  """
  tabName = getTabForPrefecture(prefecture)


  creds = service_account.Credentials.from_service_account_file(
    './credentials.json', scopes=SCOPES
  )
  service = build('sheets', 'v4', credentials=creds)
  sheet = service.spreadsheets()

  sheetsResult = sheet.get(spreadsheetId=SPREADSHEET_ID, fields='sheets.properties').execute()
  tabProperties = {}
  for sheetProperty in sheetsResult['sheets']:
    if sheetProperty['properties']['title'] == tabName:
      tabProperties = sheetProperty['properties']
      break

  if not tabProperties:
    print('Unable to find tab: %s' % tabName)
    return 0

  if update:
    result = updatePatientCountForDate(sheet, tabProperties, prefecture, date, cases, deceased, source)
    if result and 'updates' in result:
      return result['updates']['updatedRows']
    elif result:
      return result['updatedRows']
    return 0
  else:
    if useCountColumn:
      patientNumberPrefix, lastPatientNumber = PREFECTURE_PREFIX[prefecture], int(date.replace('-', ''))
    else:
      patientNumberPrefix, lastPatientNumber = getPatientNumberColumn(sheet, tabProperties)

    result = appendRows(sheet, tabProperties, prefecture, date, 
      cases = cases,
      deceased = deceased, 
      source = source, 
      patientNumberPrefix = patientNumberPrefix, 
      lastPatientNumber = lastPatientNumber,
      useCountColumn = useCountColumn)
    if result:
      return result['updates']['updatedRows']
    return 0


if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('prefecture')
  parser.add_argument('--cases', type=int, default=0)
  parser.add_argument('--update', action='store_true', default=True)
  parser.add_argument('--deaths', type=int, default=0)
  parser.add_argument('--date', default=datetime.datetime.now().strftime('%Y-%m-%d'))
  parser.add_argument('--source', default='')
  parser.add_argument('--use-count-column', action=argparse.BooleanOptionalAction, default=True)
  args = parser.parse_args()

  if args.source:
    url = urllib.parse.urlsplit(args.source)
    args.source = urllib.parse.urlunsplit((url.scheme, url.netloc, url.path, None, None))

  rowsUpdated = writePatients(args.prefecture, args.date, int(args.cases), int(args.deaths), args.source, args.use_count_column, update=args.update)
  print('Updates %d rows.' % rowsUpdated)
