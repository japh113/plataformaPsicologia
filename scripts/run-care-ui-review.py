"""Run the unified care Chromium scenarios in an owned disposable sandbox."""
import os, runpy
os.environ['PSICOPANEL_REVIEW_KIND'] = 'care'
runpy.run_path('scripts/run-bilateral-ui-review.py', run_name='__main__')
