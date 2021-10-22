const PREFECTURE_PREFIX = {
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

const patientId = (prefecture, date) => {
  const prefix = PREFECTURE_PREFIX[prefecture];
  const dateString = date.replace(/-/g, '');
  return `${prefix}${dateString}`
}

const prefectureTabs = ['Aichi', 'Chiba', 'Fukuoka', 'Osaka', 'Hokkaido', 'Kanagawa', 'Saitama', 'Tokyo'];

const columnNames = {
  id: 'Patient Number',
  dateAnnounced: 'Date Announced',
  dateAdded: 'Date Added',
  prefecture: 'Detected Prefecture',
  status: 'Status',
  count: 'Count',
  source: 'Source(s)',
}

const columnPos = {
  id: 0,
  dateAnnounced: 3,
  dateAdded: 4,

  prefecture: 9,
  status: 10,
  count: 11,
  source: 13
}

module.exports = {
  columnNames,
  columnPos,
  patientId,
  prefectureTabs,
}
