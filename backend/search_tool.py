import logging
import os

from duckduckgo_search import DDGS

logger = logging.getLogger(__name__)

_TRUTHY = {"1", "true", "yes", "on"}


def _mock_results(query: str, max_results: int) -> str:
    """Deterministic stand-in so MOCK_LLM runs never touch the network."""
    return "\n\n".join(
        f"{i}. **Fixture source {i} for {query}**\n"
        f"   URL: https://example.invalid/fixture/{i}\n"
        f"   Snippet: Deterministic offline snippet {i} describing {query}."
        for i in range(1, max_results + 1)
    )


def web_search(query: str, max_results: int = 5) -> str:
    """Performs a web search using DuckDuckGo and returns formatted results.

    Args:
        query: The search query string.
        max_results: The maximum number of search results to return.
    """
    if os.getenv("MOCK_LLM", "").strip().lower() in _TRUTHY:
        logger.info(f"MOCK_LLM active — returning fixture results for: '{query}'")
        return _mock_results(query, max_results)

    logger.info(f"Searching web for query: '{query}'")
    try:
        ddgs = DDGS()
        results = ddgs.text(query, max_results=max_results)
        if not results:
            return f"No results found for search query: '{query}'."

        formatted_results = []
        for i, res in enumerate(results, 1):
            title = res.get('title', 'No Title')
            url = res.get('href', 'No URL')
            snippet = res.get('body', 'No Snippet')
            formatted_results.append(f"{i}. **{title}**\n   URL: {url}\n   Snippet: {snippet}")

        return "\n\n".join(formatted_results)
    except Exception as e:
        logger.error(f"Error executing web search: {e}", exc_info=True)
        return f"An error occurred while searching: {str(e)}"
