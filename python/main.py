import os

from flask import Flask
from flask import request
import json
import mhlw
import sync_patients

app = Flask(__name__)


@app.route("/")
def hello_world():
    name = os.environ.get("NAME", "World")
    return "Hello {}!".format(name)

@app.route('/patients/update')
def patient_update():
  prefecture = request.args.get('prefecture')
  count = request.args.get('count')
  date = request.args.get('date')
  source = request.args.get('source')
  deceased = request.args.get('deceased')
  if not prefecture or not count or not date:
    return json.dumps({'error': 'Required parameters prefecture=, count= and date= not found.'})

  print(locals())

  updatedRows = sync_patients.writePatients(prefecture, count, date, deceased, source)
  return json.dumps({'updateRows': updatedRows})

@app.route('/mhlw/reporturl')
def report_url():
  url = mhlw.getLatestCovidReport(mhlw.DEFAULT_MHLW_INDEX_URL)
  return json.dumps({'result': {
    'url': url
  }})

@app.route('/mhlw/today')
def report_today():
  result = mhlw.reportToday(True)
  return json.dumps({'result': result})

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
