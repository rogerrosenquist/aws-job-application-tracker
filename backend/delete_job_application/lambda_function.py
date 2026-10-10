import json
import boto3
from botocore.exceptions import ClientError

table = boto3.resource("dynamodb").Table("JobApplications")


def respond(status_code, data):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(data)
    }


def lambda_handler(event, context):
    application_id = (event.get("pathParameters") or {}).get(
        "applicationId"
    )

    if not isinstance(application_id, str) or not application_id.strip():
        return respond(400, {"message": "applicationId is required."})

    application_id = application_id.strip()

    try:
        table.delete_item(
            Key={"applicationId": application_id},
            ConditionExpression="attribute_exists(applicationId)"
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(404, {"message": "Application not found."})
        raise

    return respond(200, {
        "message": "Application deleted.",
        "applicationId": application_id
    })
