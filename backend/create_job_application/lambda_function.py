import json
import boto3
from datetime import date
from uuid import uuid4

table = boto3.resource("dynamodb").Table("JobApplications")


def respond(status_code, data):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(data)
    }


def lambda_handler(event, context):
    try:
        data = json.loads(event.get("body") or "{}")
    except (ValueError, TypeError):
        return respond(400, {"message": "Send valid JSON."})

    if not isinstance(data, dict):
        return respond(400, {"message": "Send a JSON object."})

    fields = ("company", "jobTitle", "dateApplied", "status")
    application = {}

    for field in fields:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            return respond(400, {"message": f"{field} is required."})
        application[field] = value.strip()

    allowed_statuses = ("Applied", "Interviewing", "Rejected", "Offer")
    if application["status"] not in allowed_statuses:
        return respond(400, {"message": "Choose a valid status."})

    try:
        application["dateApplied"] = date.fromisoformat(
            application["dateApplied"]
        ).isoformat()
    except ValueError:
        return respond(400, {"message": "Use YYYY-MM-DD for dateApplied."})

    application["applicationId"] = str(uuid4())

    table.put_item(
        Item=application,
        ConditionExpression="attribute_not_exists(applicationId)"
    )

    return respond(201, application)
