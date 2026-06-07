import logging
from duckduckgo_search import DDGS

logger = logging.getLogger(__name__)

def web_search(query: str, max_results: int = 5) -> str:
    """Performs a web search using DuckDuckGo and returns formatted results.

    Args:
        query: The search query string.
        max_results: The maximum number of search results to return.
    """
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
