# Deployment guide

This records the AWS console setup for the first version. Application source is included; infrastructure automation is planned.

## DynamoDB and Lambda

In `us-east-1`, create `JobApplications` with partition key `applicationId` (String), no sort key, and on-demand capacity.

Create four Python 3.14 functions using x86_64. Copy each folder's source into `lambda_function.py`, use handler `lambda_function.lambda_handler`, and deploy.

| Function | Source folder | Table action |
|---|---|---|
| `ListJobApplications` | `backend/list_job_applications` | `dynamodb:Scan` |
| `CreateJobApplication` | `backend/create_job_application` | `dynamodb:PutItem` |
| `UpdateApplicationStatus` | `backend/update_application_status` | `dynamodb:UpdateItem` |
| `DeleteJobApplication` | `backend/delete_job_application` | `dynamodb:DeleteItem` |

Each function has its own execution role, basic Lambda logging permissions, and an inline policy for only its table action. For the delete role:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "dynamodb:DeleteItem",
    "Resource": "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/JobApplications"
  }]
}
```

Replace `YOUR_ACCOUNT_ID` with the deploying account ID. When attaching integrations, allow API Gateway to invoke each Lambda function through its resource-based permission. The SDK is supplied by the Lambda Python runtime; offline tests substitute SDK modules.

## Cognito

Create a pool with email sign-in, public self-registration disabled, and a public SPA client without a client secret. Create an invited user, then change the temporary password at first sign-in.

Configure a Cognito domain and managed login, authorization code grant only, and scopes `openid` and `email`. Register the localhost and hosted root URLs in BOTH the callback and sign-out lists, including trailing slashes.

Current public configuration:

| Setting | Value |
|---|---|
| Pool | `us-east-1_zYUDJ8p61` |
| Client | `nof28hof68de2097keb0j8dft` |
| Domain | `https://us-east-1zyudj8p61.auth.us-east-1.amazoncognito.com` |
| Local callback/sign-out URL | `http://localhost:8000/` |
| Hosted callback/sign-out URL | `https://d3vx7zv7kgrlly.cloudfront.net/` |

## HTTP API

Create `JobApplicationTrackerAPI` with the four routes in the README and matching Lambda integrations. The current setup uses `$default` stage and auto-deploy.

Create JWT authorizer `TrackerSignIn`, with identity source `$request.header.Authorization`, issuer `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_zYUDJ8p61`, and audience `nof28hof68de2097keb0j8dft`. Attach it to all four routes. Route scopes are empty in this first version.

| CORS setting | Values |
|---|---|
| Origins | `http://localhost:8000`, `https://d3vx7zv7kgrlly.cloudfront.net` |
| Methods | GET, POST, PATCH, DELETE, OPTIONS |
| Headers | authorization, content-type |

Origins have no trailing slash. The invoke URL is `https://im7xfyckjk.execute-api.us-east-1.amazonaws.com`. Recreating the project requires your own API/pool/client values.

## Frontend hosting

Create a general-purpose S3 bucket with ACLs disabled, Block all public access enabled, and SSE-S3 encryption. The current bucket is `roger-job-tracker-web-20261010` in `us-east-1`, with versioning disabled.

Upload only `index.html`, `styles.css`, and `app.js` to the bucket root. Create a CloudFront distribution with the Free plan, a single website/app, the S3 origin, recommended origin settings, and private bucket access enabled. The console can create OAC and update the bucket policy. Keep the plan's included security protections. Set the default root object to `index.html`.

Use HTTPS. If HTTP is also served, configure the viewer protocol policy to Redirect HTTP to HTTPS. The current address is `https://d3vx7zv7kgrlly.cloudfront.net/`.

Update `app.js` for your API, Cognito domain/client, and hosted callback. Keep its values consistent with Cognito's callback/sign-out lists and API CORS. Documentation, backend source, and tests stay in GitHub; S3 gets the three frontend files.

To update an existing frontend file, upload its replacement under the same name, create a CloudFront invalidation for the changed path (for example `/app.js`), wait for Completed, and reload the HTTPS page.

## Troubleshooting

| Symptom | Check |
|---|---|
| Sign-in callback error | Exact callback, client ID, code grant, and Cognito domain |
| Sign-out shows Invalid request | Allowed sign-out URL, HTTPS, trailing slash |
| Browser cannot reach API | CORS origin, methods, and headers |
| API Unauthorized | JWT attachment, issuer/audience, current access token |
| Frontend AccessDenied | Root object, S3 object names, OAC, bucket policy, completed deployment |
| Old behavior after upload | Bucket-root replacement, completed invalidation, browser refresh |

## Costs and cleanup

Keep budget alerts active and review actual usage. CloudFront's selected plan does not make every AWS service free, and budgets alert rather than stop spending.

When retiring the project, review its CloudFront distribution and associated plan/resources, S3 bucket, API, Lambda functions/roles, Cognito resources, DynamoDB table, and unused logs. Export records you want to retain before deleting the table.
