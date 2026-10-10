import json
import boto3

table = boto3.resource("dynamodb").Table("JobApplications")


def lambda_handler(event, context):
    response = table.scan()
    applications = response["Items"]

    while response.get("LastEvaluatedKey"):
        response = table.scan(
            ExclusiveStartKey=response["LastEvaluatedKey"]
        )
        applications.extend(response["Items"])

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(applications)
    }
