const TG = require("telegram-bot-api");

const { API_TOKEN } = require("./credentials-telegram.json");

const notify = async (message) => {
  const chatId = -1001755252419; // Channel ID for liquidx-chan

  const api = new TG({ token: API_TOKEN });
  return api.sendMessage({
    chat_id: chatId,
    text: message,
  });
};

const getChatId = () => {
  const api = new TG({ token: API_TOKEN });

  // Need to listen for events
  const mp = new TG.GetUpdateMessageProvider();
  api.setMessageProvider(mp);

  api.start().then(() => {});

  api.on("update", (update) => {
    console.log(update);
    api.stop();
  });
};

module.exports = {
  notify,
  getChatId,
};
