import os
import time
import logging
from typing import List, Dict, Any, Optional

import httpx

# Optional: for Bedrock AWS SDK
try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except Exception:
    boto3 = None
    BotoCoreError = Exception
    ClientError = Exception

logger = logging.getLogger(__name__)

# ── Simple in-memory cache ────────────────────────────────────────────────────
_model_cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
_CACHE_TTL = 300  # 5 minutes


def _cache_key(provider: str, extra: str = "") -> str:
    return f"{provider}:{extra}"


def _get_cached(key: str) -> Optional[List[Dict[str, Any]]]:
    entry = _model_cache.get(key)
    if entry and (time.time() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None


def _set_cached(key: str, models: List[Dict[str, Any]]):
    _model_cache[key] = (time.time(), models)


# ── Shared HTTP client (connection pooling) ───────────────────────────────────
_http_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(20.0),
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )
    return _http_client


class ProviderModelFetcher:
    """Utility class to fetch available models from various LLM providers.

    The methods expect authentication information in the `credentials` dict.
    For most providers a single `api_key` is enough. For AWS Bedrock the
    dict should contain ``aws_access_key_id``, ``aws_secret_access_key``,
    ``region_name`` and optionally ``aws_session_token``.
    """

    @staticmethod
    async def fetch_openai_models(api_key: str) -> List[Dict[str, Any]]:
        ck = _cache_key("openai", api_key[:8] if api_key else "")
        cached = _get_cached(ck)
        if cached is not None:
            return cached

        url = "https://api.openai.com/v1/models"
        headers = {"Authorization": f"Bearer {api_key}"}
        client = _get_client()
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        models = data.get("data", [])
        _set_cached(ck, models)
        return models

    @staticmethod
    async def fetch_anthropic_models(api_key: str) -> List[Dict[str, Any]]:
        ck = _cache_key("anthropic", api_key[:8] if api_key else "")
        cached = _get_cached(ck)
        if cached is not None:
            return cached

        url = "https://api.anthropic.com/v1/models"
        headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
        client = _get_client()
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        models = data.get("data", [])
        _set_cached(ck, models)
        return models

    @staticmethod
    async def fetch_gemini_models(api_key: str) -> List[Dict[str, Any]]:
        ck = _cache_key("gemini", api_key[:8] if api_key else "")
        cached = _get_cached(ck)
        if cached is not None:
            return cached

        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        client = _get_client()
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
        models = data.get("models", [])
        _set_cached(ck, models)
        return models

    @staticmethod
    async def fetch_ollama_models(base_url: str = "http://localhost:11434") -> List[Dict[str, Any]]:
        ck = _cache_key("ollama", base_url)
        cached = _get_cached(ck)
        if cached is not None:
            return cached

        url = f"{base_url.rstrip('/')}/api/tags"
        client = _get_client()
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
        models = data.get("models", [])
        _set_cached(ck, models)
        return models

    @staticmethod
    def fetch_bedrock_models(
        aws_access_key_id: str,
        aws_secret_access_key: str,
        region_name: str,
        aws_session_token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Synchronously fetch Bedrock model names using boto3.

        Returns a list of dicts with an 'id' key for UI compatibility.
        Uses the 'bedrock' service (not 'bedrock-runtime') which provides
        list_foundation_models.
        """
        ck = _cache_key("bedrock", f"{region_name}:{aws_access_key_id[:6]}")
        cached = _get_cached(ck)
        if cached is not None:
            return cached

        if boto3 is None:
            raise RuntimeError("boto3 is required for Bedrock model fetching but is not installed.")
        try:
            # Use 'bedrock' service (management API) — NOT 'bedrock-runtime' (inference API)
            client = boto3.client(
                "bedrock",
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                region_name=region_name,
                aws_session_token=aws_session_token,
            )
            models: List[Dict[str, Any]] = []
            # list_foundation_models does not paginate — it returns all at once
            response = client.list_foundation_models()
            for m in response.get("modelSummaries", []):
                # Filter out deprecated/legacy models
                lifecycle_status = m.get("modelLifecycle", {}).get("status", "ACTIVE")
                if lifecycle_status == "LEGACY":
                    continue
                
                # Filter out models that don't support ON_DEMAND inference (regular serverless use)
                inference_types = m.get("inferenceTypesSupported", [])
                if inference_types and "ON_DEMAND" not in inference_types:
                    continue

                models.append({
                    "id": m.get("modelId"),
                    "provider": m.get("providerName", ""),
                    "name": m.get("modelName", m.get("modelId", "")),
                })
            _set_cached(ck, models)
            return models
        except (BotoCoreError, ClientError) as e:
            logger.error(f"Bedrock model fetch failed: {e}")
            raise
