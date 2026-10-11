# Validation record

## GitHub Actions

The [first published workflow run](https://github.com/rogerrosenquist/aws-job-application-tracker/actions/runs/38092366213) completed successfully on October 10, 2026, for commit `8115561`. It ran the JavaScript syntax check, 16 offline Python tests, and 8 offline JavaScript tests on Ubuntu with Python 3.14 and Node.js 24.

## Deployed checks

These checks were manually performed by Roger against the running AWS deployment:

| Check | Observed result |
|---|---|
| Initial Lambda list/create/update tests | Expected 200/201 responses |
| Unauthenticated GET after attaching JWT auth | Unauthorized |
| Delete Lambda with nonexistent ID | 404 Application not found |
| Hosted sign-in | Returned to CloudFront and displayed applications |
| Stop local PowerShell server | Hosted tracker continued working |
| Create Hosted Test | Persisted after refresh and appeared in DynamoDB |
| Update to Interviewing | Updated in the webpage and DynamoDB |
| Delete Hosted Test | Removed from the webpage and DynamoDB |
| Hosted sign-out after correcting its allowed URL | Returned to the tracker with Sign in and hidden applications |

## Offline checks

Run the commands in the README. Python tests use SDK/DynamoDB doubles; JavaScript tests use a small DOM and mocked responses. No AWS credentials are needed.

The checks cover scan pagination, create validation, conditional update/delete behavior, missing records, PKCE challenges, callback state mismatch, deletion cancellation, failed-request recovery, and API 401 handling.

Offline checks do not verify deployed IAM or Cognito/API/CloudFront configuration. Manual deployed checks provide evidence for the observed integration behavior. Load testing, user-isolation testing, and a comprehensive security review have not been performed.

## Frontend refresh — October 10, 2026

The refreshed frontend passed the JavaScript syntax check, 16 Python tests, and 16 JavaScript tests locally. The new browser behavior checks cover combined search/status filters, sorting without mutating source data, global status totals, saving/deleting under a filter, retaining unsaved choices after a failed save, and ignoring a late refresh after sign-out.

Browser checks used a separate offline fixture with fictional applications, outside the repository. At 1440px the dashboard showed a table; at 390px and 320px it showed application cards without horizontal overflow. Search, clicking a status total, changing/saving a status, and adding an application were exercised through the UI. Adding reset the form's status and color to Applied. No console errors were observed in this preview.

The three production frontend files were uploaded to the existing private S3 bucket, and CloudFront invalidation was requested for `/`, `/index.html`, `/app.js`, and `/styles.css`. No backend handlers, authorization settings, or DynamoDB records were changed by this deployment. The fictional preview fixture was not uploaded. Hosted authenticated CRUD should be checked with Roger's account; the offline checks do not replace that integration check.
