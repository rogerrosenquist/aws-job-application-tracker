# Architecture decisions

## Request flow

1. The browser downloads HTML, CSS, and JavaScript through CloudFront, which reads the private S3 origin with origin access control (OAC).
2. Sign in creates a random state and PKCE verifier. Cognito authenticates the invited user and returns an authorization code to an allowed callback.
3. The frontend verifies state, exchanges the code with the verifier, and keeps the access token in memory.
4. API requests carry the access token in the Authorization header. API Gateway validates the JWT and invokes the route's Lambda integration.
5. Lambda uses its execution role for the allowed DynamoDB operation. The frontend renders the JSON response with text content.

## Design choices

| Decision | Reason | Tradeoff |
|---|---|---|
| S3 and CloudFront | HTTPS frontend with a private origin | Updating unchanged file names requires cache invalidation |
| Cognito managed login | Delegate password entry and sessions to AWS | Callback and sign-out URLs must match the frontend |
| HTTP API with JWT authorizer | Validate tokens before invoking Lambda | Route scopes and per-user ownership are future work |
| One Lambda per operation | Keep table permissions and code focused | More resources than one combined handler |
| DynamoDB on-demand | Avoid managing provisioned capacity | Full-table scans become inefficient as data grows |
| UUID primary keys | Give each application a separate ID | Listing requires a scan with this key design |
| Tokens in memory | Avoid storing access tokens across reloads | Reloading or expiry requires sign-in again |

## Security boundaries

S3 origin access is granted to CloudFront through a bucket policy. API authorization uses JWT validation; CORS does not replace authentication. The CloudFront WAF protects the distribution's static frontend path. Browser API requests go directly to the API Gateway domain.

This version is invite-only and used by one owner. The table has no ownership field and the handlers do not filter by Cognito subject. Inviting another user would give them access to the same records. Sign-out clears the local token and ends the managed-login session; it does not instantly invalidate a separately copied JWT at API Gateway.

## Planned improvements

- Describe resources with AWS SAM/CloudFormation and automate deployment.
- Before adding users, use each owner's Cognito `sub` in the key design, enforce ownership in every handler, and replace scans with queries.
- Configure API route scopes and verify token-type acceptance explicitly.
- Add error/latency alarms and define log retention.
- Add filtering and notes, plus input-length and strict date-format limits.

## References

- [CloudFront OAC and private S3](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [API Gateway JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [Cognito authorization endpoint and PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)
