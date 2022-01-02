// Implementation of the proxy method
const fetch = require("make-fetch-happen");

exports.fetch = (request, response) => {
  const { url } = request.query;
  if (!url) {
    response.status(500);
    return;
  }

  fetch(url)
    .then((proxyResponse) => {
      response.status(proxyResponse.status);
      response.set("Access-Control-Allow-Origin", "*");
      const contentType = proxyResponse.headers.get("Content-Type");
      if (contentType) {
        response.set("Content-Type", contentType);
      }
      return proxyResponse.arrayBuffer();
    })
    .then((arrayBuffer) => {
      response.send(new Buffer(new Uint8Array(arrayBuffer)));
    })
    .catch((err) => {
      response.status(500);
      console.log(err);
    });
};
