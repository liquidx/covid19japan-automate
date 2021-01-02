import os

from flask import Flask
import mhlw

app = Flask(__name__)


@app.route("/")
def hello_world():
    name = os.environ.get("NAME", "World")
    return "Hello {}!".format(name)

@app.route('/reporturl')
def report_url():
  url = mhlw.getLatestCovidReport(mhlw.DEFAULT_MHLW_INDEX_URL)
  return 'Report URL: {}'.format(url)

@app.route('/mhlw/today')
def report_today():
  return mhlw.reportToday(True)

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
