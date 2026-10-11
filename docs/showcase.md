# Presenting this project

## Portfolio card

**Serverless Job Application Tracker**

Built and deployed a job application tracker on AWS with Cognito sign-in, a protected HTTP API, four Python Lambda functions, and DynamoDB persistence. Hosted the static frontend through CloudFront with a private S3 origin, and verified create, read, update, delete, and sign-out against the deployed services.

**Stack:** JavaScript, Python, S3, CloudFront, Cognito, API Gateway, Lambda, DynamoDB, IAM, CloudWatch.

Link the repository and https://d3vx7zv7kgrlly.cloudfront.net/. Label the hosted link "Live app — sign-in required" so visitors understand invited dashboard access.

## Resume bullet

- Built and deployed an AWS serverless job application tracker using Python Lambda, API Gateway, DynamoDB, and Cognito; hosted its frontend with CloudFront and private S3 access and implemented table-scoped IAM permissions for CRUD operations.

## Screenshots

The [current dashboard preview](images/dashboard-preview.jpg), embedded in the README, shows the refreshed frontend rendered locally with five fictional applications. It includes colored status totals, search, filtering, sorting, and Save/Delete controls. The preview fixture is outside the repository and is never deployed.

The [original dashboard screenshot](images/dashboard.png) was captured from the deployed tracker on October 10, 2026. It records the initial interface and four fictional applications.

A signed-out screenshot can also be added as `docs/images/signed-out.png`. Focus on the application. The Mermaid architecture diagram already renders in the GitHub README.

## Interview walkthrough

1. Explain the problem: keeping company, role, date, and application progress in one place.
2. Walk through Cognito sign-in, API JWT validation, Lambda, and DynamoDB.
3. Explain how CloudFront reads the frontend while S3 stays private.
4. Demonstrate CRUD with a fictional application.
5. Discuss tradeoffs: scans suit the small dataset; multi-user growth needs ownership and queries. Infrastructure as code and API scopes are planned improvements.

Describe it as a guided learning project while studying for Solutions Architect Associate. Be ready to explain and modify the code and AWS configuration yourself.
