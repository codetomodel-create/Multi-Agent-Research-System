"""Regression tests for secret scrubbing and provider model caching."""
import json

import pytest


def test_scrub_masks_top_level_and_nested_keys():
    from backend.observability import scrub_sensitive_data

    scrubbed = scrub_sensitive_data({
        "api_key": "sk-abcdefghijklmnopqrstuvwxyz012345",
        "nested": {"heavy_api_key": "AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI:us-east-1"},
        "aws_secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "password": "hunter2hunter2",
        "session_token": "FwoGZXIvYXdzEHUaDG9",
    })
    blob = json.dumps(scrubbed)
    assert "abcdefghijklmnopqrstuvwxyz" not in blob
    assert "wJalrXUtnFEMI/K7MDENG" not in blob
    assert "hunter2hunter2" not in blob
    assert "..." in scrubbed["api_key"]


def test_scrub_masks_inline_keys_in_free_text():
    from backend.observability import scrub_sensitive_data

    text = "traceback: auth failed for sk-abcdefghijklmnopqrstuvwxyz012345 at line 9"
    out = scrub_sensitive_data(text)
    assert "sk-abcdefghijklmnopqrstuvwxyz012345" not in out


def test_scrub_walks_lists():
    from backend.observability import scrub_sensitive_data

    out = scrub_sensitive_data([{"token": "abcdefghijklmnop"}, "plain"])
    assert out[0]["token"] != "abcdefghijklmnop"
    assert out[1] == "plain"


def test_mask_secret_handles_short_values():
    from backend.observability import mask_secret

    assert mask_secret("") == ""
    assert mask_secret("abc") == "****"
    assert mask_secret("a" * 9).startswith("aaaaaa")


def test_model_cache_keys_do_not_collide_on_shared_prefix():
    """Two different keys sharing a prefix must not share a cache entry."""
    from backend.model_fetcher import _credential_fingerprint

    a = "sk-proj-AAAAAAAAAAAAAAAAAAAA"
    b = "sk-proj-BBBBBBBBBBBBBBBBBBBB"
    assert a[:8] == b[:8]
    assert _credential_fingerprint(a) != _credential_fingerprint(b)


def test_model_cache_fingerprint_is_not_reversible():
    from backend.model_fetcher import _credential_fingerprint

    secret = "sk-supersecretkeyvalue123456"
    assert secret not in _credential_fingerprint(secret)
    assert _credential_fingerprint("") == "anon"


def test_model_cache_is_bounded():
    from backend import model_fetcher as mf

    mf._model_cache.clear()
    try:
        for i in range(mf._CACHE_MAX_ENTRIES + 20):
            mf._set_cached(f"provider:{i}", [{"id": str(i)}])
        assert len(mf._model_cache) <= mf._CACHE_MAX_ENTRIES
    finally:
        mf._model_cache.clear()


def test_boto3_is_installed_for_bedrock_provider():
    """AWS Bedrock is a user-selectable provider, so boto3 must be a real dep."""
    from backend import model_fetcher as mf

    assert mf.boto3 is not None, "boto3 missing: Bedrock model listing would fail"


@pytest.mark.parametrize("module", [
    "backend.main", "backend.agent_orchestrator",
    "backend.model_fetcher", "backend.observability", "backend.search_tool",
])
def test_modules_import_cleanly(module):
    __import__(module)
