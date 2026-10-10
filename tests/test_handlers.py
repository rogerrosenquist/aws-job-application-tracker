"""Offline handler tests. AWS SDK modules and DynamoDB operations are test doubles."""

import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]


class FakeClientError(Exception):
    def __init__(self, code):
        self.response = {"Error": {"Code": code}}
        super().__init__(code)


def load_handler(folder):
    table = MagicMock()
    boto3 = ModuleType("boto3")
    boto3.resource = MagicMock()
    boto3.resource.return_value.Table.return_value = table
    botocore = ModuleType("botocore")
    exceptions = ModuleType("botocore.exceptions")
    exceptions.ClientError = FakeClientError
    botocore.exceptions = exceptions
    sdk_modules = {
        "boto3": boto3, "botocore": botocore,
        "botocore.exceptions": exceptions
    }
    spec = importlib.util.spec_from_file_location(
        folder, ROOT / "backend" / folder / "lambda_function.py"
    )
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, sdk_modules):
        spec.loader.exec_module(module)
    return module, table


class ListTests(unittest.TestCase):
    def test_list_reads_every_scan_page(self):
        module, table = load_handler("list_job_applications")
        key = {"applicationId": "one"}
        table.scan.side_effect = [
            {"Items": [{"applicationId": "one"}], "LastEvaluatedKey": key},
            {"Items": [{"applicationId": "two"}]}
        ]
        result = module.lambda_handler({}, None)
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(len(json.loads(result["body"])), 2)
        self.assertEqual(table.scan.call_count, 2)
        self.assertEqual(table.scan.call_args.kwargs["ExclusiveStartKey"], key)

    def test_empty_list(self):
        module, table = load_handler("list_job_applications")
        table.scan.return_value = {"Items": []}
        self.assertEqual(json.loads(module.lambda_handler({}, None)["body"]), [])


class CreateTests(unittest.TestCase):
    def setUp(self):
        self.module, self.table = load_handler("create_job_application")
        self.valid = {
            "company": "Example Company", "jobTitle": "Cloud Support Associate",
            "dateApplied": "2026-10-10", "status": "Applied"
        }

    def run_body(self, body):
        return self.module.lambda_handler({"body": json.dumps(body)}, None)

    def test_create_trims_fields_generates_id_and_prevents_overwrite(self):
        self.valid["company"] = "  Example Company  "
        result = self.run_body(self.valid)
        self.assertEqual(result["statusCode"], 201)
        item = json.loads(result["body"])
        self.assertEqual(item["company"], "Example Company")
        self.assertTrue(item["applicationId"])
        self.assertEqual(self.table.put_item.call_args.kwargs["Item"], item)
        self.assertEqual(self.table.put_item.call_args.kwargs["ConditionExpression"],
                         "attribute_not_exists(applicationId)")

    def test_invalid_json_never_writes(self):
        result = self.module.lambda_handler({"body": "{"}, None)
        self.assertEqual(result["statusCode"], 400)
        self.table.put_item.assert_not_called()

    def test_non_object_json_never_writes(self):
        for body in ([], "hello", None, 42):
            with self.subTest(body=body):
                self.assertEqual(self.run_body(body)["statusCode"], 400)
        self.table.put_item.assert_not_called()

    def test_required_fields_never_write_when_missing_blank_or_wrong_type(self):
        for field in self.valid:
            for value in (None, "  ", 123):
                with self.subTest(field=field, value=value):
                    payload = {**self.valid, field: value}
                    self.assertEqual(self.run_body(payload)["statusCode"], 400)
        self.table.put_item.assert_not_called()

    def test_invalid_status_never_writes(self):
        self.valid["status"] = "Unknown"
        self.assertEqual(self.run_body(self.valid)["statusCode"], 400)
        self.table.put_item.assert_not_called()

    def test_impossible_date_never_writes(self):
        self.valid["dateApplied"] = "2026-02-30"
        self.assertEqual(self.run_body(self.valid)["statusCode"], 400)
        self.table.put_item.assert_not_called()


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.module, self.table = load_handler("update_application_status")
        self.event = {"pathParameters": {"applicationId": "test-id"},
                      "body": '{"status":"Interviewing"}'}

    def test_update_returns_item_and_cannot_create_a_missing_item(self):
        item = {"applicationId": "test-id", "status": "Interviewing"}
        self.table.update_item.return_value = {"Attributes": item}
        result = self.module.lambda_handler(self.event, None)
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(json.loads(result["body"]), item)
        self.assertEqual(self.table.update_item.call_args.kwargs["ConditionExpression"],
                         "attribute_exists(applicationId)")

    def test_missing_id_never_updates(self):
        for params in (None, {}, {"applicationId": " "}, {"applicationId": 1}):
            with self.subTest(params=params):
                self.event["pathParameters"] = params
                self.assertEqual(self.module.lambda_handler(self.event, None)["statusCode"], 400)
        self.table.update_item.assert_not_called()

    def test_invalid_body_or_status_never_updates(self):
        for body in ("{", "[]", '{"status":"Unknown"}', '{"status":1}', "{}"):
            with self.subTest(body=body):
                self.event["body"] = body
                self.assertEqual(self.module.lambda_handler(self.event, None)["statusCode"], 400)
        self.table.update_item.assert_not_called()

    def test_missing_item_returns_404(self):
        self.table.update_item.side_effect = FakeClientError("ConditionalCheckFailedException")
        self.assertEqual(self.module.lambda_handler(self.event, None)["statusCode"], 404)


class DeleteTests(unittest.TestCase):
    def setUp(self):
        self.module, self.table = load_handler("delete_job_application")
        self.event = {"pathParameters": {"applicationId": "test-id"}}

    def test_delete_targets_exact_id_and_requires_existing_item(self):
        result = self.module.lambda_handler(self.event, None)
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(json.loads(result["body"])["applicationId"], "test-id")
        self.assertEqual(self.table.delete_item.call_args.kwargs["Key"], {"applicationId": "test-id"})
        self.assertEqual(self.table.delete_item.call_args.kwargs["ConditionExpression"],
                         "attribute_exists(applicationId)")

    def test_missing_id_never_deletes(self):
        for params in (None, {}, {"applicationId": " "}, {"applicationId": 1}):
            with self.subTest(params=params):
                self.event["pathParameters"] = params
                self.assertEqual(self.module.lambda_handler(self.event, None)["statusCode"], 400)
        self.table.delete_item.assert_not_called()

    def test_missing_item_returns_404(self):
        self.table.delete_item.side_effect = FakeClientError("ConditionalCheckFailedException")
        self.assertEqual(self.module.lambda_handler(self.event, None)["statusCode"], 404)

    def test_database_failure_is_not_reported_as_success(self):
        self.table.delete_item.side_effect = FakeClientError("AccessDeniedException")
        with self.assertRaises(FakeClientError):
            self.module.lambda_handler(self.event, None)


if __name__ == "__main__":
    unittest.main()
