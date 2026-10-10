# Validation record

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
