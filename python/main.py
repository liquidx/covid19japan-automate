import os

from flask import Flask
from flask import request
from flask import render_template
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
  cases = request.args.get('cases')
  date = request.args.get('date')
  source = request.args.get('source')
  deceased = request.args.get('deceased')
  if not prefecture or not date:
    return json.dumps({'error': 'Required parameters prefecture= and date= not found.'})

  if not cases and not deceased:
    # Need to prompt for the number.
    return render_template('patient_update.html', prefecture=prefecture, date=date, source=source, cases=cases, deceased=deceased)

  print(locals())
  if cases:
    cases = int(cases)
  if deceased:
    deceased = int(deceased)

  updatedRows = sync_patients.writePatients(prefecture, date, cases, deceased, source)
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
