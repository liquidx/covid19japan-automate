const cheerio = require("cheerio");
const _ = require("lodash");

const urlWithProxy = (url) => {
  return url;
};

const prefectureLookup = _.fromPairs(
  _.map(
    [
      "愛知	Aichi",
      "秋田	Akita",
      "青森	Aomori",
      "千葉	Chiba",
      "愛媛	Ehime",
      "福井	Fukui",
      "福岡	Fukuoka",
      "福島	Fukushima",
      "岐阜	Gifu",
      "群馬	Gunma",
      "広島	Hiroshima",
      "北海道	Hokkaido",
      "兵庫	Hyogo",
      "茨城	Ibaraki",
      "石川	Ishikawa",
      "岩手	Iwate",
      "香川	Kagawa",
      "鹿児島	Kagoshima",
      "神奈川	Kanagawa",
      "高知	Kochi",
      "熊本	Kumamoto",
      "京都	Kyoto",
      "三重	Mie",
      "宮城	Miyagi",
      "宮崎	Miyazaki",
      "長野	Nagano",
      "長崎	Nagasaki",
      "奈良	Nara",
      "新潟	Niigata",
      "大分	Oita",
      "岡山	Okayama",
      "沖縄	Okinawa",
      "大阪	Osaka",
      "佐賀	Saga",
      "埼玉	Saitama",
      "滋賀	Shiga",
      "島根	Shimane",
      "静岡	Shizuoka",
      "栃木	Tochigi",
      "徳島	Tokushima",
      "東京都	Tokyo",
      "鳥取	Tottori",
      "富山	Toyama",
      "和歌山	Wakayama",
      "山形	Yamagata",
      "山口	Yamaguchi",
      "山梨	Yamanashi",
    ],
    (v) => {
      return v.split("\t");
    }
  )
);

const normalizeFixedWidthNumbers = (v) => {
  return v
    .replace(/０/g, "0")
    .replace(/１/g, "1")
    .replace(/２/g, "2")
    .replace(/３/g, "3")
    .replace(/４/g, "4")
    .replace(/５/g, "5")
    .replace(/６/g, "6")
    .replace(/７/g, "7")
    .replace(/８/g, "8")
    .replace(/９/g, "9");
};

const parseJapaneseNumber = (v) => {
  let num = normalizeFixedWidthNumbers(v);
  const tenThousandPattern = new RegExp("([0-9]+)万([0-9]+)", "iu");
  const tenThousandMatch = num.match(tenThousandPattern);
  if (tenThousandMatch) {
    return (
      parseInt(tenThousandMatch[1]) * 10000 + parseInt(tenThousandMatch[2])
    );
  }
  return parseInt(num);
};

const extractDailySummary = (url, fetchImpl, useProxy) => {
  if (useProxy) {
    url = urlWithProxy(url);
  }
  if (!fetchImpl) {
    fetchImpl = window.fetch;
  }
  return fetchImpl(url)
    .then((response) => response.text())
    .then((text) => {
      let values = {
        prefectureCounts: {},
      };
      let dom = cheerio.load(text);
      let contents = dom("section.content--detail-main").text();

      for (let prefectureName of Object.keys(prefectureLookup)) {
        const prefecturePattern = new RegExp(
          prefectureName + "は[※]?([0-9０-９万]+)人",
          "igu"
        );
        let prefectureMatches = contents.matchAll(prefecturePattern);
        if (prefectureMatches) {
          for (const prefectureMatch of prefectureMatches) {
            values.prefectureCounts[prefectureName] = parseJapaneseNumber(
              prefectureMatch[1]
            );
          }
        }
      }

      const portAndQuartantine = new RegExp(
        "空港の検疫で.*?([0-9０-９万]+)人",
        "iu"
      );
      let portMatch = contents.match(portAndQuartantine);
      if (portMatch) {
        values.portQuarantineCount = parseJapaneseNumber(portMatch[1]);
      }

      const totalPatients = new RegExp(
        "日本で感染が確認された人は.*?([0-9０-９万]+)人",
        "iu"
      );
      let totalMatch = contents.match(totalPatients);
      if (totalMatch) {
        values.totalCount = parseJapaneseNumber(totalMatch[1]);
      }

      const deathsPattern = new RegExp(
        "亡くなった人は.*国内で感染した人が([0-9０-９万]+)人",
        "iu"
      );
      let deathsMatch = contents.match(deathsPattern);
      if (deathsMatch) {
        values.deceased = parseJapaneseNumber(deathsMatch[1]);
      }

      const criticalPatientsPattern = new RegExp(
        "重症者は.*?([0-9０-９万]+)人",
        "iu"
      );
      let criticalMatch = contents.match(criticalPatientsPattern);
      if (criticalMatch) {
        values.critical = parseJapaneseNumber(criticalMatch[1]);
      }

      const recoveredJapanPattern = new RegExp(
        "症状が改善して退院した.*国内で感染した人が([0-9０-９万]+)人",
        "iu"
      );
      let recoveredJapan = contents.match(recoveredJapanPattern);
      if (recoveredJapan) {
        values.recoveredJapan = parseJapaneseNumber(recoveredJapan[1]);
      }

      const recoveredTotalPattern = new RegExp(
        "症状が改善して退院した.*クルーズ船の乗客・乗員が([0-9０-９万]+)人.*合わせて([0-9０-９万]+)",
        "iu"
      );
      let recoveredTotal = contents.match(recoveredTotalPattern);
      if (recoveredTotal) {
        values.recoveredTotal = parseJapaneseNumber(recoveredTotal[2]);
      }
      return values;
    });
};

const prefectureCountsInEnglish = (result) => {
  const prefectureCountsInEn = _.mapKeys(result.prefectureCounts, (v, k) => {
    return prefectureLookup[k];
  });
  const translatedResults = Object.assign({}, result);
  translatedResults.prefectureCounts = prefectureCountsInEn;
  return translatedResults;
};

const sortedPrefectureCounts = (values) => {
  let englishPrefectureCounts = prefectureCountsInEnglish(values);
  let counts = [];
  for (let prefectureName of _.sortBy(_.values(prefectureLookup))) {
    let count = englishPrefectureCounts["prefectureCounts"][prefectureName];
    if (!count) {
      count = 0;
    }
    counts.push(count);
  }
  return counts;
};

const latestNhkArticles = async (fetchImpl, numberOfPages) => {
  if (!numberOfPages) {
    numberOfPages = 5;
  }

  const articlesUrl = (pageNumber) => {
    return `https://www3.nhk.or.jp/news/json16/word/0000969_00${pageNumber}.json`;
  };

  if (!fetchImpl) {
    fetchImpl = window.fetch;
  }

  let articles = [];
  for (let page = 1; page <= numberOfPages; page++) {
    let url = articlesUrl(page);
    await fetchImpl(url)
      .then((response) => response.json())
      .then((response) => {
        const channel = response["channel"];
        const items = channel["item"];
        articles = articles.concat(items);
      });
  }

  return articles;
};

exports.extractDailySummary = extractDailySummary;
exports.sortedPrefectureCounts = sortedPrefectureCounts;
exports.prefectureLookup = prefectureLookup;
exports.prefectureCountsInEnglish = prefectureCountsInEnglish;
exports.latestNhkArticles = latestNhkArticles;
