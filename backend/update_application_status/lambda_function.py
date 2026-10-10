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

    try:
        data = json.loads(event.get("body") or "{}")
    except (ValueError, TypeError):
        return respond(400, {"message": "Send valid JSON."})

    if not isinstance(data, dict):
        return respond(400, {"message": "Send a JSON object."})

    status = data.get("status")
    allowed_statuses = ("Applied", "Interviewing", "Rejected", "Offer")

    if not isinstance(status, str) or status.strip() not in allowed_statuses:
        return respond(400, {"message": "Choose a valid status."})

    try:
        result = table.update_item(
            Key={"applicationId": application_id.strip()},
            UpdateExpression="SET #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": status.strip()},
            ConditionExpression="attribute_exists(applicationId)",
            ReturnValues="ALL_NEW"
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(404, {"message": "Application not found."})
        raise

    return respond(200, result["Attributes"])
