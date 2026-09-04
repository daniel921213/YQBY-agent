from app.services.analyst_service import _friendly_anthropic_error


class BadRequestError(Exception):
    pass


class AuthenticationError(Exception):
    pass


class RateLimitError(Exception):
    pass


class APIConnectionError(Exception):
    pass


def test_low_credit_error_has_actionable_message() -> None:
    error = BadRequestError("Your credit balance is too low to access the Anthropic API.")

    message = _friendly_anthropic_error(error)

    assert "額度不足" in message
    assert "API Credits" in message
    assert "BadRequestError" not in message


def test_provider_errors_are_translated_without_internal_details() -> None:
    cases = [
        (AuthenticationError("invalid x-api-key: secret"), "API Key"),
        (RateLimitError("rate limit exceeded"), "稍後再試"),
        (APIConnectionError("connection failed"), "無法連線"),
        (BadRequestError("request_id=req_private"), "無法處理"),
        (RuntimeError("request_id=req_private"), "服務暫時異常"),
    ]

    for error, expected in cases:
        message = _friendly_anthropic_error(error)
        assert expected in message
        assert "req_private" not in message
