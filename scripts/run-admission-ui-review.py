"""Admission Chromium using the same verified disposable harness as bilateral."""
import os,runpy
os.environ['PSICOPANEL_REVIEW_KIND']='admission'
runpy.run_path('scripts/run-bilateral-ui-review.py',run_name='__main__')
