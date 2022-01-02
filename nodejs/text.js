const textForWriteResult = (result) => {
  let textDescription = `[${result.result}]:\n`;
  for (const row of result.updatedRows) {
    const { prefecture } = row;
    if (row.confirmed) {
      textDescription += `${prefecture} ${row.confirmed.count} cases. ${row.confirmed.title}\n`;
    }

    if (row.deceased) {
      textDescription += `${prefecture} ${row.deceased.count} deaths. ${row.deceased.title}\n`;
    }
  }
  return textDescription;
};

module.exports = {
  textForWriteResult,
};
