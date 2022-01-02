const textForWriteResult = (result) => {
  let textDescription = `[${result.result}]:\n`;
  for (const prefecture of Object.keys(result.prefectureCounts)) {
    const counts = result.prefectureCounts[prefecture];
    if (counts.confirmed) {
      textDescription += `${prefecture} ${counts.confirmed.count} cases.\n`;
    }

    if (counts.deceased) {
      textDescription += `${prefecture} ${counts.confirmed.count} deaths.\n`;
    }
  }
  return textDescription;
};

module.exports = {
  textForWriteResult,
};
